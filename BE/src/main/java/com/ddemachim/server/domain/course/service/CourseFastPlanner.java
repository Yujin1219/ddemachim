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
import com.ddemachim.server.domain.route.service.RouteProviderClient;
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

    private static final Duration ARRIVAL_DEADLINE_BUFFER = Duration.ofMinutes(10);
    private static final int DEFAULT_WALK_DURATION_SECONDS = 20 * 60;

    private final RouteProviderClient routeProviderClient;

    public CourseFastPlanner(RouteProviderClient routeProviderClient) {
        this.routeProviderClient = routeProviderClient;
    }

    public FastPlan plan(CoursePreviewRequest request, List<ResolvedPlace> resolvedPlaces) {
        if (resolvedPlaces == null || resolvedPlaces.isEmpty()) {
            throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        }

        LocalDateTime scheduledStart = request.serviceDate().atTime(request.desiredStartTime());
        Map<DirectedLeg, RouteLookup> walkingRoutes = cacheWalkingRoutes(request, resolvedPlaces);
        Map<DirectedLeg, TransitLookup> transitRoutes = new HashMap<>();
        Map<Integer, EnumSet<CourseFastPlanFailure.DiagnosticReason>> rejectedReasons = new HashMap<>();
        PermutationPlan selected = buildHeuristicPlan(
                request, resolvedPlaces, scheduledStart, walkingRoutes, transitRoutes, rejectedReasons);
        if (selected == null) {
            throw fastPlanUnavailable(resolvedPlaces, walkingRoutes, transitRoutes, rejectedReasons);
        }

        return buildFastPlan(scheduledStart, selected);
    }

    /**
     * Routes are cached once for this request before ordering. The matrix is linear in the
     * number of places and is shared by the greedy and 2-opt passes.
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
                    continue;
                }
                Coordinate destination = coordinate(places.get(destinationIndex));
                routes.put(new DirectedLeg(sourceIndex, destinationIndex), findWalking(origin, destination));
            }
        }
        return routes;
    }

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
            return null;
        }

        boolean improved;
        do {
            improved = false;
            for (int from = 0; from < order.size() - 1 && !improved; from++) {
                for (int to = from + 1; to < order.size(); to++) {
                    List<Integer> candidateOrder = new ArrayList<>(order);
                    java.util.Collections.reverse(candidateOrder.subList(from, to + 1));
                    PermutationPlan candidate = evaluateOrder(
                            request, places, scheduledStart, walkingRoutes, transitRoutes,
                            candidateOrder, rejectedReasons);
                    if (candidate != null && (candidate.totalTravelSeconds() < best.totalTravelSeconds()
                            || (candidate.totalTravelSeconds() == best.totalTravelSeconds()
                            && compareRequestOrder(candidate.order(), best.order()) < 0))) {
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
        LocalDateTime currentTime = scheduledStart;
        int sourceIndex = -1;
        while (!remaining.isEmpty()) {
            int selectedIndex = -1;
            CandidateResult selected = null;
            for (int destinationIndex : remaining) {
                CandidateResult candidate = feasibleCandidate(
                        request, currentTime, places.get(destinationIndex),
                        walkingRoutes.get(new DirectedLeg(sourceIndex, destinationIndex)));
                if (candidate.isFeasible() && (selected == null
                        || candidate.candidate().route().durationSeconds()
                        < selected.candidate().route().durationSeconds()
                        || (candidate.candidate().route().durationSeconds()
                        == selected.candidate().route().durationSeconds()
                        && destinationIndex < selectedIndex))) {
                    selectedIndex = destinationIndex;
                    selected = candidate;
                }
            }
            if (selectedIndex < 0) {
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
                currentTime = selected.candidate().departure();
            }
            sourceIndex = selectedIndex;
        }
        return order;
    }

    private static int walkingDuration(RouteLookup lookup) {
        return lookup != null && lookup.route() != null && lookup.route().durationSeconds() != null
                ? lookup.route().durationSeconds() : Integer.MAX_VALUE;
    }

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
                rejectedReasons.computeIfAbsent(destinationIndex, ignored -> EnumSet.noneOf(
                        CourseFastPlanFailure.DiagnosticReason.class)).add(result.reason());
                return null;
            }
            Candidate candidate = result.candidate();
            candidates.add(candidate);
            totalTravelSeconds += candidate.route().durationSeconds();
            currentTime = candidate.departure();
            sourceIndex = destinationIndex;
        }
        return new PermutationPlan(List.copyOf(order), candidates, totalTravelSeconds);
    }

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

    private CandidateResult feasibleCandidate(
            CoursePreviewRequest request,
            LocalDateTime currentTime,
            ResolvedPlace place,
            RouteOption route) {
        if (!viableRoute(route)) {
            return CandidateResult.rejected(routeReason(route == null ? null : route.unavailableReason()));
        }
        LocalDateTime effectiveArrival = currentTime.plusSeconds(route.durationSeconds());
        if (place.openTime() != null) {
            LocalDateTime opening = request.serviceDate().atTime(place.openTime());
            if (effectiveArrival.isBefore(opening)) {
                effectiveArrival = opening;
            }
        }
        if (place.arrivalDeadline() != null) {
            LocalDateTime latestArrival = request.serviceDate()
                    .atTime(place.arrivalDeadline())
                    .minus(ARRIVAL_DEADLINE_BUFFER);
            if (effectiveArrival.isAfter(latestArrival)) {
                return CandidateResult.rejected(CourseFastPlanFailure.DiagnosticReason.ARRIVAL_DEADLINE_EXCEEDED);
            }
            effectiveArrival = latestArrival;
        }

        LocalDateTime departure = effectiveArrival.plusMinutes(place.dwellMinutes());
        if (place.closeTime() != null
                && departure.isAfter(request.serviceDate().atTime(place.closeTime()))) {
            return CandidateResult.rejected(CourseFastPlanFailure.DiagnosticReason.OPERATING_HOURS_EXCEEDED);
        }
        return CandidateResult.feasible(new Candidate(place, route, effectiveArrival, departure));
    }

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
            return CandidateResult.feasible(walkingCandidate(walking.candidate(), origin, destination));
        }

        TransitLookup transitLookup = transitRoutes.computeIfAbsent(
                leg, ignored -> findTransit(origin, destination));
        CandidateResult transitCandidate = feasibleCandidate(request, currentTime, place, transitLookup);
        if (transitCandidate.isFeasible()) {
            return CandidateResult.feasible(transitCandidate(
                    transitCandidate.candidate(), transitLookup.route(), walking.candidate()));
        }
        if (walking.isFeasible()) {
            return CandidateResult.feasible(walkingCandidate(walking.candidate(), origin, destination));
        }
        return CandidateResult.rejected(preferredRejection(walking, transitCandidate));
    }

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

    private static Coordinate coordinate(ResolvedPlace place) {
        return new Coordinate(place.latitude(), place.longitude());
    }

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

    private record DirectedLeg(int sourceIndex, int destinationIndex) {
    }

    private interface AvailabilityLookup {

        RouteUnavailableReason unavailableReason();
    }

    private record RouteLookup(RouteOption route, RouteUnavailableReason unavailableReason) implements AvailabilityLookup {
        private static RouteLookup available(RouteOption route) {
            return new RouteLookup(route, null);
        }

        private static RouteLookup unavailable(RouteUnavailableReason reason) {
            return new RouteLookup(null, reason);
        }
    }

    private record TransitLookup(SelectedTransitRoute route, RouteUnavailableReason unavailableReason)
            implements AvailabilityLookup {

        private static TransitLookup available(SelectedTransitRoute route) {
            return new TransitLookup(route, null);
        }

        private static TransitLookup unavailable(RouteUnavailableReason reason) {
            return new TransitLookup(null, reason);
        }
    }

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

    private record PermutationPlan(List<Integer> order, List<Candidate> candidates, long totalTravelSeconds) {
    }

}
