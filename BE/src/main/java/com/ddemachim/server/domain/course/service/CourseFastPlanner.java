package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.CourseFastPlanFailure;
import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.domain.route.service.CourseRouteProviderClient;
import com.ddemachim.server.domain.route.service.SelectedTransitRoute;
import com.ddemachim.server.domain.route.service.TransitWalkSegment;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class CourseFastPlanner {

    /** 예약·입장 마감 시각보다 여유 있게 도착하기 위해 확보하는 안전 시간이다. */
    private static final Duration ARRIVAL_DEADLINE_BUFFER = Duration.ofMinutes(10);
    /** 이 시간 이내의 이동은 대중교통을 조회하기 전에 도보를 우선 선택한다. */
    private static final int DEFAULT_WALK_DURATION_SECONDS = 20 * 60;
    /** 완전탐색 대신 단계마다 유지할 방문 순서 후보의 최대 개수다. */
    private static final int FEASIBLE_ORDER_BEAM_WIDTH = 16;

    private final CourseRouteProviderClient routeProviderClient;

    public CourseFastPlanner(CourseRouteProviderClient routeProviderClient) {
        this.routeProviderClient = routeProviderClient;
    }

    /**
     * FAST 코스를 생성한다.
     *
     * <p>요청 날짜와 출발 시각을 합쳐 일정 시작점을 만들고, 장소 사이 도보 경로를
     * 미리 조회한 다음 휴무·영업시간·도착 제한·체류시간을 만족하는 방문 순서를 찾는다.
     * 유효한 전체 순서가 없으면 장소별 실패 원인이 포함된 예외를 반환한다.</p>
     */
    public FastPlan plan(CoursePreviewRequest request, List<ResolvedPlace> resolvedPlaces) {
        if (resolvedPlaces == null || resolvedPlaces.isEmpty()) {
            throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        }

        // 날짜와 시각을 하나의 기준 시점으로 만들어 이후 모든 도착·출발 계산에 사용한다.
        LocalDateTime scheduledStart = request.serviceDate().atTime(request.desiredStartTime());

        // 출발지와 각 장소 사이, 장소와 장소 사이의 방향별 도보 경로를 요청 단위로 재사용한다.
        Map<DirectedLeg, RouteLookup> walkingRoutes = cacheWalkingRoutes(request, resolvedPlaces);

        // 대중교통은 20분 초과 도보 구간에서만 필요하므로 최초 사용 시 조회해 저장한다.
        Map<DirectedLeg, TransitLookup> transitRoutes = new HashMap<>();

        // 최종 계획 생성 실패 시 사용자에게 장소별 원인을 설명하기 위해 누적한다.
        Map<Integer, EnumSet<CourseFastPlanFailure.DiagnosticReason>> rejectedReasons = new HashMap<>();
        PermutationPlan selected = buildHeuristicPlan(
                request, resolvedPlaces, scheduledStart, walkingRoutes, transitRoutes, rejectedReasons);
        if (selected == null) {
            throw fastPlanUnavailable(resolvedPlaces, walkingRoutes, transitRoutes, rejectedReasons);
        }

        return buildFastPlan(scheduledStart, selected);
    }

    /**
     * 방문 순서를 탐색하기 전에 모든 방향의 도보 경로를 한 번씩 조회한다.
     *
     * <p>{@code sourceIndex == -1}은 사용자가 지정한 최초 출발지를 뜻한다. A→B와
     * B→A는 결과가 다를 수 있으므로 별도 구간으로 저장한다. 장소가 N개이면 출발지
     * 구간 N개와 장소 간 구간 N(N-1)개, 즉 총 N²개 구간을 구성한다. 이 결과는
     * 초기 순서 생성, 전체 일정 검증, 2-opt에서 공통으로 재사용된다.</p>
     */
    private Map<DirectedLeg, RouteLookup> cacheWalkingRoutes(
            CoursePreviewRequest request, List<ResolvedPlace> places) {
        Map<DirectedLeg, RouteLookup> routes = new HashMap<>();
        for (int sourceIndex = -1; sourceIndex < places.size(); sourceIndex++) {
            Coordinate origin = sourceIndex == -1
                    ? new Coordinate(request.start().latitude(), request.start().longitude())
                    : coordinate(places.get(sourceIndex));
            for (int destinationIndex = 0; destinationIndex < places.size(); destinationIndex++) {
                if (sourceIndex == destinationIndex) {
                    // 같은 장소에서 같은 장소로 이동하는 경로는 만들지 않는다.
                    continue;
                }
                Coordinate destination = coordinate(places.get(destinationIndex));
                routes.put(new DirectedLeg(sourceIndex, destinationIndex), findWalking(origin, destination));
            }
        }
        return routes;
    }

    /** 외부 경로 제공자의 성공·실패를 내부 조회 결과 타입으로 정규화한다. */
    private RouteLookup findWalking(Coordinate origin, Coordinate destination) {
        try {
            RouteOption route = routeProviderClient.findWalking(origin, destination);
            if (viableWalking(route)) {
                return RouteLookup.available(route);
            }
            return RouteLookup.unavailable(route == null ? null : route.unavailableReason());
        } catch (RouteProviderException exception) {
            return RouteLookup.unavailable(exception.reason());
        }
    }

    /**
     * 휴리스틱으로 최종 방문 순서를 찾는다.
     *
     * <ol>
     *   <li>방문 가능한 가까운 장소를 차례로 고르는 초기 순서를 만든다.</li>
     *   <li>초기 순서 전체가 유효하지 않으면 beam search로 다른 순서를 찾는다.</li>
     *   <li>유효하면 연속 구간을 뒤집는 2-opt 방식으로 총 이동시간을 줄인다.</li>
     * </ol>
     */
    private PermutationPlan buildHeuristicPlan(
            CoursePreviewRequest request,
            List<ResolvedPlace> places,
            LocalDateTime scheduledStart,
            Map<DirectedLeg, RouteLookup> walkingRoutes,
            Map<DirectedLeg, TransitLookup> transitRoutes,
            Map<Integer, EnumSet<CourseFastPlanFailure.DiagnosticReason>> rejectedReasons) {
        List<Integer> order = nearestFeasibleOrder(
                request, places, scheduledStart, walkingRoutes, rejectedReasons);
        PermutationPlan best = evaluateOrder(
                request, places, scheduledStart, walkingRoutes, transitRoutes, order, rejectedReasons);
        if (best == null) {
            return findFeasibleOrder(
                    request, places, scheduledStart, walkingRoutes, transitRoutes, rejectedReasons);
        }

        boolean improved;
        do {
            improved = false;
            for (int from = 0; from < order.size() - 1 && !improved; from++) {
                for (int to = from + 1; to < order.size(); to++) {
                    // from부터 to까지의 연속 구간만 역순으로 만들어 새 방문 순서를 만든다.
                    // 예: A-B-C-D에서 from=1, to=2이면 A-C-B-D가 된다.
                    List<Integer> candidateOrder = new ArrayList<>(order);
                    java.util.Collections.reverse(candidateOrder.subList(from, to + 1));

                    // 순서를 바꾼 뒤 모든 장소의 이동·영업·마감·체류 조건을 처음부터 재검사한다.
                    PermutationPlan candidate = evaluateOrder(
                            request, places, scheduledStart, walkingRoutes, transitRoutes,
                            candidateOrder, rejectedReasons);
                    if (candidate != null && (candidate.totalTravelSeconds() < best.totalTravelSeconds()
                            || (candidate.totalTravelSeconds() == best.totalTravelSeconds()
                            && compareRequestOrder(candidate.order(), best.order()) < 0))) {
                        // 더 짧은 유효 순서를 발견하면 채택하고, 변경된 순서를 기준으로 다시 탐색한다.
                        order = candidateOrder;
                        best = candidate;
                        improved = true;
                        break;
                    }
                }
            }
        } while (improved);
        return best;
    }

    /**
     * 가까운 장소부터 만든 초기 순서가 실패했을 때 실행하는 제한 너비 탐색이다.
     * 각 깊이에서 방문 가능한 부분 순서를 모두 확장한 뒤 이동시간이 짧은 상위 16개만
     * 유지해, 모든 순열을 검사하는 비용을 제한한다.
     */
    private PermutationPlan findFeasibleOrder(
            CoursePreviewRequest request,
            List<ResolvedPlace> places,
            LocalDateTime scheduledStart,
            Map<DirectedLeg, RouteLookup> walkingRoutes,
            Map<DirectedLeg, TransitLookup> transitRoutes,
            Map<Integer, EnumSet<CourseFastPlanFailure.DiagnosticReason>> rejectedReasons) {
        List<List<Integer>> beam = new ArrayList<>();
        // 아직 아무 장소도 방문하지 않은 빈 순서에서 탐색을 시작한다.
        beam.add(List.of());
        for (int depth = 0; depth < places.size(); depth++) {
            List<PermutationPlan> expanded = new ArrayList<>();
            for (List<Integer> prefix : beam) {
                for (int destinationIndex = 0; destinationIndex < places.size(); destinationIndex++) {
                    if (prefix.contains(destinationIndex)) continue;
                    List<Integer> next = new ArrayList<>(prefix);
                    next.add(destinationIndex);

                    // 부분 순서라도 출발지부터 현재 마지막 장소까지 시간표를 완전히 계산한다.
                    PermutationPlan candidate = evaluateOrder(
                            request, places, scheduledStart, walkingRoutes, transitRoutes,
                            next, rejectedReasons);
                    if (candidate != null) expanded.add(candidate);
                }
            }
            if (expanded.isEmpty()) return null;
            expanded.sort(Comparator.comparingLong(PermutationPlan::totalTravelSeconds)
                    .thenComparing(PermutationPlan::order, CourseFastPlanner::compareRequestOrder));

            // 다음 장소를 붙일 후보를 상위 16개로 제한한다.
            beam = expanded.stream().limit(FEASIBLE_ORDER_BEAM_WIDTH)
                    .map(PermutationPlan::order).toList();
        }
        List<Integer> bestOrder = beam.getFirst();
        return evaluateOrder(request, places, scheduledStart, walkingRoutes, transitRoutes,
                bestOrder, rejectedReasons);
    }

    /**
     * 현재 위치에서 아직 방문하지 않은 장소를 검사해, 방문 가능하면서 도보시간이 가장
     * 짧은 장소를 반복 선택한다. 여기서 만든 순서는 최종 답이 아니라 2-opt의 시작점이다.
     */
    private List<Integer> nearestFeasibleOrder(
            CoursePreviewRequest request,
            List<ResolvedPlace> places,
            LocalDateTime scheduledStart,
            Map<DirectedLeg, RouteLookup> walkingRoutes,
            Map<Integer, EnumSet<CourseFastPlanFailure.DiagnosticReason>> rejectedReasons) {
        List<Integer> remaining = new ArrayList<>();
        for (int index = 0; index < places.size(); index++) {
            remaining.add(index);
        }
        List<Integer> order = new ArrayList<>();
        // 다음 이동은 사용자가 지정한 출발 시각부터 시작한다.
        LocalDateTime currentTime = scheduledStart;
        // -1은 장소 목록의 인덱스가 아니라 최초 출발지를 나타내는 특별한 값이다.
        int sourceIndex = -1;
        while (!remaining.isEmpty()) {
            int selectedIndex = -1;
            CandidateResult selected = null;
            for (int destinationIndex : remaining) {
                // 현재 시각에 이 장소로 이동했을 때 영업·마감·체류 조건을 만족하는지 검사한다.
                CandidateResult candidate = feasibleCandidate(
                        request, currentTime, places.get(destinationIndex),
                        walkingRoutes.get(new DirectedLeg(sourceIndex, destinationIndex)));
                if (candidate.isFeasible() && (selected == null
                        || candidate.candidate().route().durationSeconds()
                        < selected.candidate().route().durationSeconds()
                        || (candidate.candidate().route().durationSeconds()
                        == selected.candidate().route().durationSeconds()
                        && destinationIndex < selectedIndex))) {
                    // 더 가까운 후보를 선택한다. 시간이 같으면 요청 목록의 앞쪽 장소를 우선한다.
                    selectedIndex = destinationIndex;
                    selected = candidate;
                }
            }
            if (selectedIndex < 0) {
                // 지금 단계에서 가능한 후보가 없어도 초기 순서는 완성한다.
                // 이후 전체 평가 실패 시 beam search가 다른 방문 순서를 탐색한다.
                int currentSourceIndex = sourceIndex;
                selectedIndex = remaining.stream()
                        .min(Comparator.<Integer>comparingInt(index -> walkingDuration(walkingRoutes.get(
                                new DirectedLeg(currentSourceIndex, index))))
                                .thenComparingInt(Integer::intValue))
                        .orElseThrow();
                selected = feasibleCandidate(
                        request, currentTime, places.get(selectedIndex),
                        walkingRoutes.get(new DirectedLeg(currentSourceIndex, selectedIndex)));
            }
            order.add(selectedIndex);
            remaining.remove(Integer.valueOf(selectedIndex));
            if (selected != null && selected.isFeasible()) {
                // 다음 장소의 계산 시작 시각은 방금 선택한 장소에서 나오는 시각이다.
                currentTime = selected.candidate().departure();
            }
            // 다음 반복에서는 방금 선택한 장소가 경로의 출발점이 된다.
            sourceIndex = selectedIndex;
        }
        return order;
    }

    private static int walkingDuration(RouteLookup lookup) {
        return lookup != null && lookup.route() != null && lookup.route().durationSeconds() != null
                ? lookup.route().durationSeconds() : Integer.MAX_VALUE;
    }

    /**
     * 하나의 방문 순서를 출발지부터 끝까지 시간 순서대로 시뮬레이션한다.
     * 중간 장소 하나라도 방문할 수 없으면 그 순서 전체를 무효로 처리한다.
     */
    private PermutationPlan evaluateOrder(
            CoursePreviewRequest request,
            List<ResolvedPlace> places,
            LocalDateTime scheduledStart,
            Map<DirectedLeg, RouteLookup> walkingRoutes,
            Map<DirectedLeg, TransitLookup> transitRoutes,
            List<Integer> order,
            Map<Integer, EnumSet<CourseFastPlanFailure.DiagnosticReason>> rejectedReasons) {
        LocalDateTime currentTime = scheduledStart;
        int sourceIndex = -1;
        List<Candidate> candidates = new ArrayList<>();
        long totalTravelSeconds = 0;

        for (int destinationIndex : order) {
            DirectedLeg leg = new DirectedLeg(sourceIndex, destinationIndex);
            Coordinate origin = sourceIndex == -1
                    ? new Coordinate(request.start().latitude(), request.start().longitude())
                    : coordinate(places.get(sourceIndex));
            Coordinate destination = coordinate(places.get(destinationIndex));
            CandidateResult result = selectTransport(
                    request,
                    currentTime,
                    places.get(destinationIndex),
                    origin,
                    destination,
                    walkingRoutes.get(leg),
                    transitRoutes,
                    leg);
            if (!result.isFeasible()) {
                // 실패한 장소와 사유를 기록해 최종 오류 응답의 진단 정보로 사용한다.
                rejectedReasons.computeIfAbsent(destinationIndex, ignored -> EnumSet.noneOf(
                        CourseFastPlanFailure.DiagnosticReason.class)).add(result.reason());
                return null;
            }
            Candidate candidate = result.candidate();
            candidates.add(candidate);
            totalTravelSeconds += candidate.route().durationSeconds();

            // 시간과 위치 상태를 갱신한 뒤 다음 장소를 같은 방식으로 계산한다.
            currentTime = candidate.departure();
            sourceIndex = destinationIndex;
        }
        return new PermutationPlan(List.copyOf(order), candidates, totalTravelSeconds);
    }

    /** 휴무와 도보 경로 존재 여부를 먼저 검사한 뒤 공통 시간 검증으로 전달한다. */
    private CandidateResult feasibleCandidate(
            CoursePreviewRequest request,
            LocalDateTime currentTime,
            ResolvedPlace place,
            RouteLookup lookup) {
        if (place.closed()) {
            return CandidateResult.rejected(CourseFastPlanFailure.DiagnosticReason.PLACE_CLOSED);
        }
        if (lookup == null || lookup.route() == null) {
            return CandidateResult.rejected(routeReason(lookup == null ? null : lookup.unavailableReason()));
        }
        return feasibleCandidate(request, currentTime, place, lookup.route());
    }

    /**
     * 특정 이동 경로를 사용했을 때 장소 방문이 가능한지 판정하고 도착·출발 시각을 만든다.
     */
    private CandidateResult feasibleCandidate(
            CoursePreviewRequest request,
            LocalDateTime currentTime,
            ResolvedPlace place,
            RouteOption route) {
        if (!viableRoute(route)) {
            return CandidateResult.rejected(routeReason(route == null ? null : route.unavailableReason()));
        }
        // 물리적으로 도착 가능한 시각 = 이전 장소 출발 시각 + 이번 구간 이동시간.
        LocalDateTime effectiveArrival = currentTime.plusSeconds(route.durationSeconds());
        if (place.openTime() != null) {
            LocalDateTime opening = request.serviceDate().atTime(place.openTime());
            if (effectiveArrival.isBefore(opening)) {
                // 영업 시작 전 도착하면 문을 열 때까지 기다린 것으로 처리한다.
                effectiveArrival = opening;
            }
        }
        if (place.arrivalDeadline() != null) {
            // 예약·입장 마감보다 10분 일찍 도착하도록 최종 허용 시각을 계산한다.
            LocalDateTime latestArrival = request.serviceDate()
                    .atTime(place.arrivalDeadline())
                    .minus(ARRIVAL_DEADLINE_BUFFER);
            if (effectiveArrival.isAfter(latestArrival)) {
                return CandidateResult.rejected(CourseFastPlanFailure.DiagnosticReason.ARRIVAL_DEADLINE_EXCEEDED);
            }

            // 현재 정책은 도착 제한을 단순 상한이 아니라 일정 앵커로도 사용한다.
            // 따라서 더 일찍 도착 가능해도 일정상 도착 시각을 '마감 10분 전'에 맞춘다.
            effectiveArrival = latestArrival;
        }

        // 장소에서 체류를 마친 시각이 다음 구간의 출발 시각이 된다.
        LocalDateTime departure = effectiveArrival.plusMinutes(place.dwellMinutes());
        if (request.availableMinutes() != null
                && departure.isAfter(request.serviceDate().atTime(request.desiredStartTime())
                .plusMinutes(request.availableMinutes()))) {
            // AI 코스가 요청한 전체 이용 가능 시간을 넘는다.
            return CandidateResult.rejected(CourseFastPlanFailure.DiagnosticReason.OPERATING_HOURS_EXCEEDED);
        }
        if (place.closeTime() != null
                && departure.isAfter(request.serviceDate().atTime(place.closeTime()))) {
            // 영업 종료 전 도착만 하는 것이 아니라 체류까지 끝내야 한다.
            return CandidateResult.rejected(CourseFastPlanFailure.DiagnosticReason.OPERATING_HOURS_EXCEEDED);
        }
        return CandidateResult.feasible(new Candidate(place, route, effectiveArrival, departure));
    }

    /** 탐색 결과를 API 응답에 사용할 FAST 계획과 순서별 방문 정보로 변환한다. */
    private FastPlan buildFastPlan(LocalDateTime scheduledStart, PermutationPlan selected) {
        LocalDateTime currentTime = scheduledStart;
        List<PlannedStop> stops = new ArrayList<>();
        long totalTravelSeconds = 0;

        for (Candidate candidate : selected.candidates()) {
            stops.add(new PlannedStop(
                    stops.size() + 1,
                    candidate.place(),
                    candidate.effectiveArrival(),
                    candidate.departure(),
                    candidate.route(),
                    candidate.selectedTransitRoute(),
                    candidate.alternativeRoute()));
            currentTime = candidate.departure();
            totalTravelSeconds += candidate.route().durationSeconds();
        }
        return new FastPlan(
                CourseRouteStrategy.FAST,
                scheduledStart,
                currentTime,
                Duration.between(scheduledStart, currentTime).toSeconds(),
                totalTravelSeconds,
                stops);
    }

    /**
     * 한 구간의 실제 이동수단을 결정한다.
     * 20분 이내의 유효한 도보를 우선하고, 그 외에는 대중교통을 조회한다. 대중교통이
     * 불가능하지만 도보가 가능하면 긴 도보를 최종 대안으로 사용한다.
     */
    private CandidateResult selectTransport(
            CoursePreviewRequest request,
            LocalDateTime currentTime,
            ResolvedPlace place,
            Coordinate origin,
            Coordinate destination,
            RouteLookup walkingLookup,
            Map<DirectedLeg, TransitLookup> transitRoutes,
            DirectedLeg leg) {
        if (place.closed()) {
            return CandidateResult.rejected(CourseFastPlanFailure.DiagnosticReason.PLACE_CLOSED);
        }
        CandidateResult walking = feasibleCandidate(request, currentTime, place, walkingLookup);
        if (walking.isFeasible()
                && walking.candidate().route().durationSeconds() <= DEFAULT_WALK_DURATION_SECONDS) {
            // 짧은 구간은 대중교통과 시간을 비교하지 않고 도보를 우선한다.
            return CandidateResult.feasible(walkingCandidate(walking.candidate(), origin, destination));
        }

        // 동일한 방향의 대중교통 조회 결과가 있으면 재사용하고, 없을 때만 외부 API를 호출한다.
        TransitLookup transitLookup = transitRoutes.computeIfAbsent(
                leg, ignored -> findTransit(origin, destination));
        CandidateResult transitCandidate = feasibleCandidate(request, currentTime, place, transitLookup);
        if (transitCandidate.isFeasible()) {
            // 대중교통을 선택하되, 가능한 도보 경로는 화면 비교용 대안으로 함께 보존한다.
            return CandidateResult.feasible(transitCandidate(
                    transitCandidate.candidate(), transitLookup.route(), walking.candidate()));
        }
        if (walking.isFeasible()) {
            // 대중교통을 사용할 수 없으면 20분을 넘더라도 유효한 도보 경로를 사용한다.
            return CandidateResult.feasible(walkingCandidate(walking.candidate(), origin, destination));
        }
        return CandidateResult.rejected(preferredRejection(walking, transitCandidate));
    }

    /** TMAP 대중교통 응답을 내부 조회 결과 타입으로 정규화한다. */
    private TransitLookup findTransit(Coordinate origin, Coordinate destination) {
        try {
            SelectedTransitRoute transit = routeProviderClient.findSelectedTransit(origin, destination);
            if (viableTransit(transit)) {
                return TransitLookup.available(transit);
            }
            RouteOption route = transit == null ? null : transit.option();
            return TransitLookup.unavailable(route == null ? null : route.unavailableReason());
        } catch (RouteProviderException exception) {
            return TransitLookup.unavailable(exception.reason());
        }
    }

    private CandidateResult feasibleCandidate(
            CoursePreviewRequest request,
            LocalDateTime currentTime,
            ResolvedPlace place,
            TransitLookup lookup) {
        if (lookup == null || lookup.route() == null) {
            return CandidateResult.rejected(routeReason(lookup == null ? null : lookup.unavailableReason()));
        }
        return feasibleCandidate(request, currentTime, place, lookup.route().option());
    }

    private static Candidate walkingCandidate(Candidate candidate, Coordinate origin, Coordinate destination) {
        return new Candidate(
                candidate.place(),
                candidate.route(),
                candidate.effectiveArrival(),
                candidate.departure(),
                walkingDetails(candidate.route(), origin, destination),
                null);
    }

    private static Candidate transitCandidate(
            Candidate candidate, SelectedTransitRoute transit, Candidate walkingCandidate) {
        return new Candidate(
                candidate.place(),
                candidate.route(),
                candidate.effectiveArrival(),
                candidate.departure(),
                transit,
                walkingCandidate == null ? null : walkingCandidate.route());
    }

    private static CourseFastPlanFailure.DiagnosticReason preferredRejection(
            CandidateResult walking,
            CandidateResult transit) {
        return isRouteFailure(transit.reason()) ? walking.reason() : transit.reason();
    }

    private static boolean isRouteFailure(CourseFastPlanFailure.DiagnosticReason reason) {
        return reason == CourseFastPlanFailure.DiagnosticReason.ROUTE_NOT_FOUND
                || reason == CourseFastPlanFailure.DiagnosticReason.ROUTE_UNAVAILABLE
                || reason == CourseFastPlanFailure.DiagnosticReason.ROUTE_PROVIDER_UNAVAILABLE
                || reason == CourseFastPlanFailure.DiagnosticReason.ROUTE_PROVIDER_NOT_CONFIGURED
                || reason == CourseFastPlanFailure.DiagnosticReason.ROUTE_PROVIDER_TIMEOUT;
    }

    /**
     * 전체 방문 순서를 만들 수 없을 때, 요청한 각 장소의 대표 실패 사유와 사용자가
     * 시도할 수 있는 조정 방법을 구성한다.
     */
    private CourseException fastPlanUnavailable(
            List<ResolvedPlace> places,
            Map<DirectedLeg, RouteLookup> walkingRoutes,
            Map<DirectedLeg, TransitLookup> transitRoutes,
            Map<Integer, EnumSet<CourseFastPlanFailure.DiagnosticReason>> rejectedReasons) {
        List<CourseFastPlanFailure.StopDiagnostic> diagnostics = new ArrayList<>();
        for (int index = 0; index < places.size(); index++) {
            ResolvedPlace place = places.get(index);
            CourseFastPlanFailure.DiagnosticReason reason = primaryReason(
                    place, index, walkingRoutes, transitRoutes, rejectedReasons.get(index));
            diagnostics.add(new CourseFastPlanFailure.StopDiagnostic(
                    place.basketItemId(), place.placeName(), reason, proposalFor(reason)));
        }
        return new CourseException(
                CourseErrorStatus.FAST_PLAN_UNAVAILABLE,
                new CourseFastPlanFailure(places.size(), diagnostics));
    }

    /** 한 장소에 누적된 실패 정보 중 사용자에게 보여줄 대표 원인을 선택한다. */
    private static CourseFastPlanFailure.DiagnosticReason primaryReason(
            ResolvedPlace place,
            int index,
            Map<DirectedLeg, RouteLookup> walkingRoutes,
            Map<DirectedLeg, TransitLookup> transitRoutes,
            EnumSet<CourseFastPlanFailure.DiagnosticReason> rejectedReasons) {
        if (place.closed()) {
            return CourseFastPlanFailure.DiagnosticReason.PLACE_CLOSED;
        }
        boolean hasViableInboundRoute = walkingRoutes.entrySet().stream()
                .filter(entry -> entry.getKey().destinationIndex() == index)
                .map(Map.Entry::getValue)
                .anyMatch(lookup -> lookup != null && lookup.route() != null)
                || transitRoutes.entrySet().stream()
                .filter(entry -> entry.getKey().destinationIndex() == index)
                .map(Map.Entry::getValue)
                .anyMatch(lookup -> lookup != null && lookup.route() != null);
        if (!hasViableInboundRoute) {
            return routeFailureReasons(walkingRoutes, index).stream()
                    .findFirst()
                    .or(() -> routeFailureReasons(transitRoutes, index).stream().findFirst())
                    .orElse(CourseFastPlanFailure.DiagnosticReason.ROUTE_UNAVAILABLE);
        }
        if (rejectedReasons != null) {
            for (CourseFastPlanFailure.DiagnosticReason reason : List.of(
                    CourseFastPlanFailure.DiagnosticReason.ARRIVAL_DEADLINE_EXCEEDED,
                    CourseFastPlanFailure.DiagnosticReason.OPERATING_HOURS_EXCEEDED)) {
                if (rejectedReasons.contains(reason)) {
                    return reason;
                }
            }
        }
        return CourseFastPlanFailure.DiagnosticReason.NO_FEASIBLE_ORDER;
    }

    private static List<CourseFastPlanFailure.DiagnosticReason> routeFailureReasons(
            Map<DirectedLeg, ? extends AvailabilityLookup> routes, int destinationIndex) {
        return routes.entrySet().stream()
                .filter(entry -> entry.getKey().destinationIndex() == destinationIndex)
                    .map(Map.Entry::getValue)
                    .filter(lookup -> lookup != null && lookup.unavailableReason() != null)
                    .map(lookup -> routeReason(lookup.unavailableReason()))
                    .toList();
    }

    /** 외부 경로 제공자의 실패 원인을 코스 도메인의 진단 코드로 변환한다. */
    private static CourseFastPlanFailure.DiagnosticReason routeReason(RouteUnavailableReason reason) {
        if (reason == null) {
            return CourseFastPlanFailure.DiagnosticReason.ROUTE_UNAVAILABLE;
        }
        return switch (reason) {
            case NO_ROUTE -> CourseFastPlanFailure.DiagnosticReason.ROUTE_NOT_FOUND;
            case PROVIDER_UNAVAILABLE -> CourseFastPlanFailure.DiagnosticReason.ROUTE_PROVIDER_UNAVAILABLE;
            case NOT_CONFIGURED -> CourseFastPlanFailure.DiagnosticReason.ROUTE_PROVIDER_NOT_CONFIGURED;
            case TIMEOUT -> CourseFastPlanFailure.DiagnosticReason.ROUTE_PROVIDER_TIMEOUT;
        };
    }

    /** 실패 원인별로 장소를 삭제하지 않고 다시 시도할 수 있는 조정 방법을 제안한다. */
    private static CourseFastPlanFailure.AdjustmentProposal proposalFor(
            CourseFastPlanFailure.DiagnosticReason reason) {
        return switch (reason) {
            case PLACE_CLOSED -> CourseFastPlanFailure.AdjustmentProposal.CHANGE_SERVICE_DATE;
            case ARRIVAL_DEADLINE_EXCEEDED -> CourseFastPlanFailure.AdjustmentProposal.RELAX_ARRIVAL_DEADLINE;
            case OPERATING_HOURS_EXCEEDED -> CourseFastPlanFailure.AdjustmentProposal.ADJUST_VISIT_DURATION;
            case ROUTE_NOT_FOUND,
                    ROUTE_UNAVAILABLE,
                    ROUTE_PROVIDER_UNAVAILABLE,
                    ROUTE_PROVIDER_NOT_CONFIGURED,
                    ROUTE_PROVIDER_TIMEOUT -> CourseFastPlanFailure.AdjustmentProposal.CHECK_ROUTE_AVAILABILITY;
            case NO_FEASIBLE_ORDER -> CourseFastPlanFailure.AdjustmentProposal.ADJUST_START_TIME;
        };
    }

    /** 이동시간이 같을 때 사용자가 전달한 원래 장소 순서에 가까운 계획을 우선한다. */
    private static int compareRequestOrder(List<Integer> left, List<Integer> right) {
        for (int index = 0; index < left.size(); index++) {
            int comparison = Integer.compare(left.get(index), right.get(index));
            if (comparison != 0) {
                return comparison;
            }
        }
        return 0;
    }

    private static boolean viableTransit(SelectedTransitRoute transit) {
        RouteOption route = transit == null ? null : transit.option();
        return route != null
                && route.mode() == RouteMode.TRANSIT
                && route.status() == RouteStatus.AVAILABLE
                && route.durationSeconds() != null
                && route.durationSeconds() > 0;
    }

    private static boolean viableWalking(RouteOption route) {
        return route != null
                && route.mode() == RouteMode.WALK
                && viableRoute(route);
    }

    private static boolean viableRoute(RouteOption route) {
        return route != null
                && route.status() == RouteStatus.AVAILABLE
                && route.durationSeconds() != null
                && route.durationSeconds() > 0;
    }

    /** 최초 출발지 또는 장소의 위·경도를 경로 API 입력 좌표로 변환한다. */
    private static Coordinate coordinate(ResolvedPlace place) {
        return new Coordinate(place.latitude(), place.longitude());
    }

    /** 순수 도보 경로도 EASY 전략에서 동일한 형태로 처리할 수 있도록 상세 구조를 만든다. */
    private static SelectedTransitRoute walkingDetails(
            RouteOption walkingRoute, Coordinate origin, Coordinate destination) {
        Integer distance = walkingRoute.distanceMeters();
        return new SelectedTransitRoute(walkingRoute, List.of(new TransitWalkSegment(
                1,
                0,
                origin,
                destination,
                walkingRoute.durationSeconds(),
                distance == null ? 0 : distance,
                List.of(origin, destination))));
    }

    /** 최종 FAST 코스 전체의 시간, 이동량, 방문 정류장을 담는다. */
    public record FastPlan(
            CourseRouteStrategy strategy,
            LocalDateTime scheduledStart,
            LocalDateTime scheduledEnd,
            long totalElapsedSeconds,
            long totalTravelSeconds,
            List<PlannedStop> stops) {

        public FastPlan {
            stops = stops == null ? List.of() : List.copyOf(stops);
        }
    }

    /** 코스의 한 방문 장소와 그 장소로 들어오는 경로·일정 정보를 담는다. */
    public record PlannedStop(
            int sequence,
            ResolvedPlace resolvedPlace,
            LocalDateTime effectiveArrival,
            LocalDateTime departure,
            RouteOption incomingRoute,
            SelectedTransitRoute selectedTransitRoute,
            RouteOption alternativeRoute) {

        public PlannedStop(
                int sequence,
                ResolvedPlace resolvedPlace,
                LocalDateTime effectiveArrival,
                LocalDateTime departure,
                RouteOption incomingRoute) {
            this(
                    sequence,
                    resolvedPlace,
                    effectiveArrival,
                    departure,
                    incomingRoute,
                    new SelectedTransitRoute(incomingRoute, List.of()),
                    null);
        }

        public PlannedStop(
                int sequence,
                ResolvedPlace resolvedPlace,
                LocalDateTime effectiveArrival,
                LocalDateTime departure,
                RouteOption incomingRoute,
                SelectedTransitRoute selectedTransitRoute) {
            this(sequence, resolvedPlace, effectiveArrival, departure, incomingRoute, selectedTransitRoute, null);
        }
    }

    /** 방향이 있는 한 이동 구간이다. -1 출발 인덱스는 사용자의 최초 출발점을 의미한다. */
    private record DirectedLeg(int sourceIndex, int destinationIndex) {
    }

    /** 도보·대중교통 조회 결과가 공통으로 노출하는 실패 원인 계약이다. */
    private interface AvailabilityLookup {

        RouteUnavailableReason unavailableReason();
    }

    /** 도보 경로 또는 도보 조회 실패 원인을 담는다. */
    private record RouteLookup(RouteOption route, RouteUnavailableReason unavailableReason) implements AvailabilityLookup {
        private static RouteLookup available(RouteOption route) {
            return new RouteLookup(route, null);
        }

        private static RouteLookup unavailable(RouteUnavailableReason reason) {
            return new RouteLookup(null, reason);
        }
    }

    /** 대중교통 경로 또는 대중교통 조회 실패 원인을 담는다. */
    private record TransitLookup(SelectedTransitRoute route, RouteUnavailableReason unavailableReason)
            implements AvailabilityLookup {

        private static TransitLookup available(SelectedTransitRoute route) {
            return new TransitLookup(route, null);
        }

        private static TransitLookup unavailable(RouteUnavailableReason reason) {
            return new TransitLookup(null, reason);
        }
    }

    /** 한 장소를 방문했을 때 확정되는 경로, 도착·출발 시각과 대안 경로를 담는다. */
    private record Candidate(
            ResolvedPlace place,
            RouteOption route,
            LocalDateTime effectiveArrival,
            LocalDateTime departure,
            SelectedTransitRoute selectedTransitRoute,
            RouteOption alternativeRoute) {

        private Candidate(
                ResolvedPlace place,
                RouteOption route,
                LocalDateTime effectiveArrival,
                LocalDateTime departure) {
            this(place, route, effectiveArrival, departure, null, null);
        }
    }

    /** 방문 가능한 후보 또는 방문 불가능 사유 중 하나를 표현한다. */
    private record CandidateResult(Candidate candidate, CourseFastPlanFailure.DiagnosticReason reason) {
        private static CandidateResult feasible(Candidate candidate) {
            return new CandidateResult(candidate, null);
        }

        private static CandidateResult rejected(CourseFastPlanFailure.DiagnosticReason reason) {
            return new CandidateResult(null, reason);
        }

        private boolean isFeasible() {
            return candidate != null;
        }
    }

    /** 하나의 방문 순서와 그 순서의 장소별 계산 결과, 총 이동시간을 담는다. */
    private record PermutationPlan(List<Integer> order, List<Candidate> candidates, long totalTravelSeconds) {
    }

}
