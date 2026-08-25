package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.CourseCreateRequest;
import com.ddemachim.server.domain.course.dto.CourseDetailResponse;
import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.dto.CourseReplanRequest;
import com.ddemachim.server.domain.course.dto.CourseStartRequest;
import com.ddemachim.server.domain.course.dto.CourseSummaryResponse;
import com.ddemachim.server.domain.course.entity.Course;
import com.ddemachim.server.domain.course.entity.CourseRevision;
import com.ddemachim.server.domain.course.entity.CourseStop;
import com.ddemachim.server.domain.course.enums.CourseReplanReason;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartTiming;
import com.ddemachim.server.domain.course.enums.CourseStatus;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.repository.CourseRepository;
import com.ddemachim.server.domain.course.repository.CourseRevisionRepository;
import com.ddemachim.server.domain.course.repository.CourseStopRepository;
import com.ddemachim.server.domain.course.repository.CourseBasketItemRepository;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.exception.AuthErrorStatus;
import com.ddemachim.server.domain.user.exception.AuthException;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CourseService {

    private static final String ALGORITHM_VERSION = "preview-v1";
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final MemberRepository memberRepository;
    private final CourseRepository courseRepository;
    private final CourseRevisionRepository courseRevisionRepository;
    private final CourseStopRepository courseStopRepository;
    private final CourseBasketItemRepository courseBasketItemRepository;
    private final CoursePreviewService coursePreviewService;
    private final CoursePreviewInputResolver inputResolver;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public CourseService(
            MemberRepository memberRepository,
            CourseRepository courseRepository,
            CourseRevisionRepository courseRevisionRepository,
            CourseStopRepository courseStopRepository,
            CourseBasketItemRepository courseBasketItemRepository,
            CoursePreviewService coursePreviewService,
            CoursePreviewInputResolver inputResolver,
            ObjectMapper objectMapper) {
        this(
                memberRepository,
                courseRepository,
                courseRevisionRepository,
                courseStopRepository,
                courseBasketItemRepository,
                coursePreviewService,
                inputResolver,
                objectMapper,
                Clock.system(SEOUL));
    }

    CourseService(
            MemberRepository memberRepository,
            CourseRepository courseRepository,
            CourseRevisionRepository courseRevisionRepository,
            CourseStopRepository courseStopRepository,
            CourseBasketItemRepository courseBasketItemRepository,
            CoursePreviewService coursePreviewService,
            CoursePreviewInputResolver inputResolver,
            ObjectMapper objectMapper,
            Clock clock) {
        this.memberRepository = memberRepository;
        this.courseRepository = courseRepository;
        this.courseRevisionRepository = courseRevisionRepository;
        this.courseStopRepository = courseStopRepository;
        this.courseBasketItemRepository = courseBasketItemRepository;
        this.coursePreviewService = coursePreviewService;
        this.inputResolver = inputResolver;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional
    public CourseDetailResponse create(Long memberId, CourseCreateRequest request) {
        Member member = lockMember(memberId);
        CoursePreviewRequest previewRequest = effectivePreviewRequest(request);
        Course activeCourse = request.startTiming() == CourseStartTiming.NOW
                ? findActiveCourse(memberId)
                : null;
        guardActiveCourse(activeCourse, request.replaceActive());

        CoursePreviewResponse generated = coursePreviewService.preview(memberId, previewRequest);
        CoursePreviewResponse.Option selected = generated.options().stream()
                .filter(option -> option.strategy() == request.strategy())
                .findFirst()
                .map(option -> applyRouteSelections(option, request.routeSelections()))
                .orElseThrow(() -> new CourseException(CourseErrorStatus.INVALID_COURSE_SELECTION));
        if (selected.stops().isEmpty() || selected.scheduledEnd() == null) {
            throw new CourseException(CourseErrorStatus.INVALID_COURSE_SELECTION);
        }

        List<ResolvedPlace> resolvedPlaces = inputResolver.resolve(
                memberId,
                previewRequest.serviceDate(),
                previewRequest.places());
        Map<Long, ResolvedPlace> resolvedByBasketId = resolvedPlaces.stream()
                .collect(Collectors.toMap(ResolvedPlace::basketItemId, Function.identity()));

        if (activeCourse != null) {
            activeCourse.archiveActive();
        }
        Course course = courseRepository.save(Course.create(member, titleFor(selected.stops()), request.visibility()));
        CourseRevision revision = courseRevisionRepository.save(CourseRevision.create(
                course,
                1,
                selected.strategy(),
                previewRequest.serviceDate(),
                previewRequest.desiredStartTime(),
                selected.scheduledEnd(),
                previewRequest.start().type(),
                previewRequest.start().name(),
                previewRequest.start().latitude(),
                previewRequest.start().longitude(),
                ALGORITHM_VERSION,
                CourseReplanReason.INITIAL));

        List<CourseStop> stops = selected.stops().stream()
                .map(stop -> createStop(revision, stop, resolvedByBasketId.get(stop.basketItemId())))
                .toList();
        courseStopRepository.saveAll(stops);
        course.changeCurrentRevision(revision, stops.size());
        if (request.startTiming() == CourseStartTiming.NOW) {
            course.start();
        }
        CourseDetailResponse detail = detailFrom(course, revision, selected);
        List<Long> consumedBasketItemIds = resolvedPlaces.stream()
                .map(ResolvedPlace::basketItemId)
                .distinct()
                .toList();
        courseBasketItemRepository.deleteAllByMemberIdAndIdIn(memberId, consumedBasketItemIds);
        return detail;
    }

    @Transactional(readOnly = true)
    public List<CourseSummaryResponse> list(Long memberId, CourseStatus status) {
        CourseStatus requestedStatus = status == null ? CourseStatus.READY : status;
        return courseRepository.findAllByMemberIdAndStatusOrderByUpdatedAtDesc(memberId, requestedStatus).stream()
                .filter(course -> course.getCurrentRevision() != null)
                .map(this::toSummary)
                .sorted(Comparator.comparing(CourseSummaryResponse::serviceDate)
                        .thenComparing(CourseSummaryResponse::scheduledStart))
                .toList();
    }

    @Transactional(readOnly = true)
    public CourseDetailResponse get(Long memberId, Long courseId) {
        Course course = ownedCourse(memberId, courseId);
        CourseRevision revision = requireCurrentRevision(course);
        List<CourseStop> stops = courseStopRepository
                .findAllByCourseRevisionIdOrderBySequenceNoAsc(revision.getId());
        return detailFrom(course, revision, optionFrom(revision, stops));
    }

    @Transactional
    public CourseDetailResponse start(Long memberId, Long courseId, CourseStartRequest request) {
        lockMember(memberId);
        Course target = ownedCourse(memberId, courseId);
        if (target.getStatus() != CourseStatus.READY) {
            throw new CourseException(CourseErrorStatus.INVALID_COURSE_STATUS);
        }
        Course activeCourse = findActiveCourse(memberId);
        guardActiveCourse(activeCourse, request != null && request.replaceActive());
        if (activeCourse != null) {
            activeCourse.archiveActive();
        }
        target.start();
        CourseRevision revision = requireCurrentRevision(target);
        List<CourseStop> stops = courseStopRepository
                .findAllByCourseRevisionIdOrderBySequenceNoAsc(revision.getId());
        return detailFrom(target, revision, optionFrom(revision, stops));
    }

    @Transactional
    public CourseDetailResponse complete(Long memberId, Long courseId) {
        Course course = ownedCourse(memberId, courseId);
        if (course.getStatus() != CourseStatus.IN_PROGRESS) {
            throw new CourseException(CourseErrorStatus.INVALID_COURSE_STATUS);
        }
        course.complete();
        CourseRevision revision = requireCurrentRevision(course);
        List<CourseStop> stops = courseStopRepository
                .findAllByCourseRevisionIdOrderBySequenceNoAsc(revision.getId());
        return detailFrom(course, revision, optionFrom(revision, stops));
    }

    @Transactional
    public CourseDetailResponse replan(Long memberId, Long courseId, CourseReplanRequest request) {
        Course course = ownedCourse(memberId, courseId);
        if (course.getStatus() != CourseStatus.IN_PROGRESS) {
            throw new CourseException(CourseErrorStatus.INVALID_COURSE_STATUS);
        }
        CourseRevision currentRevision = requireCurrentRevision(course);
        List<CourseStop> currentStops = courseStopRepository
                .findAllByCourseRevisionIdOrderBySequenceNoAsc(currentRevision.getId());
        int currentIndex = indexOfStop(currentStops, request.currentStopBasketItemId());
        if (currentIndex < 0 || currentIndex >= currentStops.size() - 1) {
            throw new CourseException(CourseErrorStatus.INVALID_COURSE_SELECTION);
        }
        List<CourseStop> remainingStops = currentStops.subList(currentIndex + 1, currentStops.size());
        CoursePreviewRequest.Start start = new CoursePreviewRequest.Start(
                com.ddemachim.server.domain.course.enums.CourseStartType.CURRENT_LOCATION,
                "현재 위치", request.latitude(), request.longitude());
        CoursePreviewResponse.Option replanned = currentRevision.getRouteStrategy() == CourseRouteStrategy.QUIET
                ? replanQuiet(currentRevision, remainingStops, start, request.departureTime())
                : rescheduleExistingRoute(currentRevision, remainingStops, request.departureTime());
        CourseRevision revision = courseRevisionRepository.save(CourseRevision.create(
                course,
                currentRevision.getRevisionNo() + 1,
                currentRevision.getRouteStrategy(),
                currentRevision.getServiceDate(),
                request.departureTime(),
                replanned.scheduledEnd(),
                start.type(), start.name(), start.latitude(), start.longitude(),
                ALGORITHM_VERSION,
                CourseReplanReason.USER_EDIT));
        Map<Long, ResolvedPlace> resolvedByBasketId = remainingStops.stream()
                .map(this::resolvedFromStop)
                .collect(Collectors.toMap(ResolvedPlace::basketItemId, Function.identity()));
        List<CourseStop> stops = replanned.stops().stream()
                .map(stop -> createStop(revision, stop, resolvedByBasketId.get(stop.basketItemId())))
                .toList();
        courseStopRepository.saveAll(stops);
        course.changeCurrentRevision(revision, stops.size());
        return detailFrom(course, revision, replanned);
    }

    private int indexOfStop(List<CourseStop> stops, Long basketItemId) {
        for (int index = 0; index < stops.size(); index += 1) {
            if (Objects.equals(stops.get(index).getSourceBasketItemId(), basketItemId)) return index;
        }
        return -1;
    }

    private CoursePreviewResponse.Option replanQuiet(
            CourseRevision revision,
            List<CourseStop> remainingStops,
            CoursePreviewRequest.Start start,
            LocalTime departureTime) {
        List<CoursePreviewRequest.Place> places = remainingStops.stream()
                .map(stop -> new CoursePreviewRequest.Place(
                        stop.getSourceBasketItemId(), stop.getDwellMinutes(), stop.getArrivalDeadline()))
                .toList();
        CoursePreviewRequest request = new CoursePreviewRequest(
                revision.getServiceDate(), departureTime, start, places);
        List<ResolvedPlace> resolved = remainingStops.stream().map(this::resolvedFromStop).toList();
        return coursePreviewService.previewResolved(request, resolved).options().stream()
                .filter(option -> option.strategy() == CourseRouteStrategy.QUIET)
                .findFirst()
                .orElseThrow(() -> new CourseException(CourseErrorStatus.INVALID_COURSE_SELECTION));
    }

    private CoursePreviewResponse.Option rescheduleExistingRoute(
            CourseRevision revision,
            List<CourseStop> remainingStops,
            LocalTime departureTime) {
        LocalTime previousDeparture = departureTime;
        List<CoursePreviewResponse.Stop> stops = new ArrayList<>();
        for (int index = 0; index < remainingStops.size(); index += 1) {
            CourseStop stop = remainingStops.get(index);
            LocalTime arrival = previousDeparture.plusMinutes(Math.max(0, stop.getTravelMinutesFromPrevious()));
            LocalTime departure = arrival.plusMinutes(stop.getDwellMinutes());
            RouteOption route = stop.getSelectedRouteSnapshot() == null
                    ? null : objectMapper.convertValue(stop.getSelectedRouteSnapshot(), RouteOption.class);
            stops.add(new CoursePreviewResponse.Stop(
                    index + 1, stop.getSourceBasketItemId(), stop.getPlaceNameSnapshot(), stop.getAddressSnapshot(),
                    stop.getLatitudeSnapshot(), stop.getLongitudeSnapshot(), stop.getDefaultDwellMinutes(), stop.getDwellMinutes(),
                    stop.getDwellSource(), stop.getArrivalDeadline(), stop.getArrivalBufferMinutes(), arrival, departure,
                    stop.getTravelMinutesFromPrevious(), stop.getTravelDistanceMeters(), stop.getAscentMeters(),
                    stop.getCongestionScoreSnapshot(), stop.getHoursSourceType(), stop.getOpenTimeSnapshot(), stop.getCloseTimeSnapshot(),
                    stop.getEvent() == null ? null : stop.getEvent().getId(), stop.getEventEndTimeSnapshot(),
                    route == null ? null : route.mode(), route, null, route,
                    stop.getPlace() == null ? null : stop.getPlace().getId()));
            previousDeparture = departure;
        }
        int travelMinutes = stops.stream().mapToInt(CoursePreviewResponse.Stop::travelMinutesFromPrevious).sum();
        int distanceMeters = stops.stream().mapToInt(CoursePreviewResponse.Stop::travelDistanceMeters).sum();
        return new CoursePreviewResponse.Option(
                revision.getRouteStrategy(), stops.size(), durationMinutes(departureTime, previousDeparture),
                travelMinutes, distanceMeters, sumNullable(stops.stream().map(CoursePreviewResponse.Stop::ascentMeters).toList()),
                averageNullable(stops.stream().map(CoursePreviewResponse.Stop::congestionScore).toList()),
                departureTime, previousDeparture, stops);
    }

    private ResolvedPlace resolvedFromStop(CourseStop stop) {
        return new ResolvedPlace(
                stop.getSourceBasketItemId(), stop.getPlace(), stop.getUserPlace(), stop.getPlaceNameSnapshot(),
                stop.getAddressSnapshot(), stop.getLatitudeSnapshot(), stop.getLongitudeSnapshot(),
                stop.getDefaultDwellMinutes(), stop.getDwellMinutes(), stop.getDwellSource(), stop.getArrivalDeadline(),
                stop.getHoursSourceType(), stop.getOpenTimeSnapshot(), stop.getCloseTimeSnapshot(), false,
                stop.getPlace() == null ? null : stop.getPlace().getId());
    }

    private Member lockMember(Long memberId) {
        return memberRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new AuthException(AuthErrorStatus.INVALID_ACCESS_TOKEN));
    }

    private Course ownedCourse(Long memberId, Long courseId) {
        return courseRepository.findByIdAndMemberId(courseId, memberId)
                .orElseThrow(() -> new CourseException(CourseErrorStatus.COURSE_NOT_FOUND));
    }

    private CourseRevision requireCurrentRevision(Course course) {
        if (course.getCurrentRevision() == null) {
            throw new CourseException(CourseErrorStatus.COURSE_NOT_FOUND);
        }
        return course.getCurrentRevision();
    }

    private Course findActiveCourse(Long memberId) {
        return courseRepository
                .findFirstByMemberIdAndStatusOrderByUpdatedAtDesc(memberId, CourseStatus.IN_PROGRESS)
                .orElse(null);
    }

    private void guardActiveCourse(Course activeCourse, boolean replaceActive) {
        if (activeCourse != null && !replaceActive) {
            throw new CourseException(
                    CourseErrorStatus.ACTIVE_COURSE_EXISTS,
                    Map.of("activeCourseId", activeCourse.getId()));
        }
    }

    private CoursePreviewRequest effectivePreviewRequest(CourseCreateRequest request) {
        CoursePreviewRequest source = request.previewRequest();
        if (request.startTiming() != CourseStartTiming.NOW) {
            return source;
        }
        LocalTime now = LocalTime.now(clock).withSecond(0).withNano(0);
        return new CoursePreviewRequest(
                LocalDate.now(clock),
                now,
                source.start(),
                source.places());
    }

    private CourseStop createStop(
            CourseRevision revision,
            CoursePreviewResponse.Stop stop,
            ResolvedPlace resolved) {
        if (resolved == null) {
            throw new CourseException(CourseErrorStatus.INVALID_COURSE_SELECTION);
        }
        CourseStop entity = resolved.place() != null
                ? CourseStop.forPlace(
                        revision, stop.sequenceNo(), stop.basketItemId(), resolved.place(),
                        stop.placeName(), stop.address(), stop.latitude(), stop.longitude(),
                        stop.defaultDwellMinutes(), stop.dwellMinutes(), stop.dwellSource(),
                        stop.arrivalDeadline(), stop.scheduledArrival(), stop.scheduledDeparture(),
                        stop.travelMinutesFromPrevious(), stop.travelDistanceMeters(), stop.ascentMeters(),
                        stop.congestionScore(), stop.hoursSourceType(), stop.openTime(), stop.closeTime(),
                        null, stop.eventEndTime())
                : CourseStop.forUserPlace(
                        revision, stop.sequenceNo(), stop.basketItemId(), resolved.userPlace(),
                        stop.placeName(), stop.address(), stop.latitude(), stop.longitude(),
                        stop.defaultDwellMinutes(), stop.dwellMinutes(), stop.dwellSource(),
                        stop.arrivalDeadline(), stop.scheduledArrival(), stop.scheduledDeparture(),
                        stop.travelMinutesFromPrevious(), stop.travelDistanceMeters(), stop.ascentMeters(),
                        stop.congestionScore(), stop.hoursSourceType(), stop.openTime(), stop.closeTime(),
                        null, stop.eventEndTime());
        RouteOption route = stop.selectedRoute() != null ? stop.selectedRoute() : stop.incomingRoute();
        return entity.withSelectedRouteSnapshot(route == null
                ? null
                : objectMapper.convertValue(route, new TypeReference<Map<String, Object>>() {}));
    }

    private CourseSummaryResponse toSummary(Course course) {
        CourseRevision revision = course.getCurrentRevision();
        List<CourseStop> stops = courseStopRepository
                .findAllByCourseRevisionIdOrderBySequenceNoAsc(revision.getId());
        return new CourseSummaryResponse(
                course.getId(),
                course.getTitle(),
                course.getStatus(),
                revision.getServiceDate(),
                revision.getDesiredStartTime(),
                revision.getDesiredEndTime(),
                course.getPlannedStopCount(),
                durationMinutes(revision.getDesiredStartTime(), revision.getDesiredEndTime()),
                stops.isEmpty() ? null : stops.get(0).getPlaceNameSnapshot(),
                stops.isEmpty() || stops.get(0).getPlace() == null
                        ? null
                        : stops.get(0).getPlace().getImageUrl(),
                stops.stream()
                        .map(stop -> new CourseSummaryResponse.RouteCoordinate(
                                stop.getLongitudeSnapshot(), stop.getLatitudeSnapshot()))
                        .toList());
    }

    private CourseDetailResponse detailFrom(
            Course course,
            CourseRevision revision,
            CoursePreviewResponse.Option option) {
        CoursePreviewRequest.Start start = new CoursePreviewRequest.Start(
                revision.getStartType(),
                revision.getStartName(),
                revision.getStartLatitude(),
                revision.getStartLongitude());
        CoursePreviewResponse preview = new CoursePreviewResponse(
                clock.instant(),
                revision.getServiceDate(),
                revision.getDesiredStartTime(),
                List.of(option));
        return new CourseDetailResponse(course.getId(), course.getTitle(), course.getStatus(), start, preview);
    }

    private CoursePreviewResponse.Option optionFrom(CourseRevision revision, List<CourseStop> stops) {
        List<CoursePreviewResponse.Stop> responseStops = stops.stream().map(this::toResponseStop).toList();
        int travelMinutes = stops.stream().mapToInt(CourseStop::getTravelMinutesFromPrevious).sum();
        int distanceMeters = stops.stream().mapToInt(CourseStop::getTravelDistanceMeters).sum();
        BigDecimal totalAscent = sumNullable(stops.stream().map(CourseStop::getAscentMeters).toList());
        BigDecimal averageCongestion = averageNullable(
                stops.stream().map(CourseStop::getCongestionScoreSnapshot).toList());
        return new CoursePreviewResponse.Option(
                revision.getRouteStrategy(),
                stops.size(),
                durationMinutes(revision.getDesiredStartTime(), revision.getDesiredEndTime()),
                travelMinutes,
                distanceMeters,
                totalAscent,
                averageCongestion,
                revision.getDesiredStartTime(),
                revision.getDesiredEndTime(),
                responseStops);
    }

    private CoursePreviewResponse.Stop toResponseStop(CourseStop stop) {
        RouteOption route = stop.getSelectedRouteSnapshot() == null
                ? null
                : objectMapper.convertValue(stop.getSelectedRouteSnapshot(), RouteOption.class);
        return new CoursePreviewResponse.Stop(
                stop.getSequenceNo(),
                stop.getSourceBasketItemId(),
                stop.getPlaceNameSnapshot(),
                stop.getAddressSnapshot(),
                stop.getLatitudeSnapshot(),
                stop.getLongitudeSnapshot(),
                stop.getDefaultDwellMinutes(),
                stop.getDwellMinutes(),
                stop.getDwellSource(),
                stop.getArrivalDeadline(),
                stop.getArrivalBufferMinutes(),
                stop.getScheduledArrival(),
                stop.getScheduledDeparture(),
                stop.getTravelMinutesFromPrevious(),
                stop.getTravelDistanceMeters(),
                stop.getAscentMeters(),
                stop.getCongestionScoreSnapshot(),
                stop.getHoursSourceType(),
                stop.getOpenTimeSnapshot(),
                stop.getCloseTimeSnapshot(),
                stop.getEvent() == null ? null : stop.getEvent().getId(),
                stop.getEventEndTimeSnapshot(),
                route == null ? null : route.mode(),
                route,
                null,
                route,
                stop.getPlace() == null ? null : stop.getPlace().getId());
    }

    private CoursePreviewResponse.Option applyRouteSelections(
            CoursePreviewResponse.Option option,
            Map<Long, String> selections) {
        if (selections == null || selections.isEmpty()) {
            return option;
        }
        List<CoursePreviewResponse.Stop> adjustedStops = new ArrayList<>();
        LocalTime previousDeparture = option.scheduledStart();
        int travelDelta = 0;
        int distanceDelta = 0;
        boolean changed = false;
        for (CoursePreviewResponse.Stop stop : option.stops()) {
            RouteOption baseline = stop.selectedRoute() != null ? stop.selectedRoute() : stop.incomingRoute();
            boolean useAlternative = "alternative".equals(selections.get(stop.basketItemId()))
                    && stop.alternativeRoute() != null;
            RouteOption selected = useAlternative ? stop.alternativeRoute() : baseline;
            int baselineMinutes = routeMinutes(baseline, stop.travelMinutesFromPrevious());
            int selectedMinutes = routeMinutes(selected, stop.travelMinutesFromPrevious());
            int baselineDistance = routeDistance(baseline, stop.travelDistanceMeters());
            int selectedDistance = routeDistance(selected, stop.travelDistanceMeters());
            LocalTime arrival = laterOf(
                    stop.scheduledArrival(),
                    previousDeparture.plusMinutes(selectedMinutes));
            long dwellMinutes = Duration.between(stop.scheduledArrival(), stop.scheduledDeparture()).toMinutes();
            LocalTime departure = arrival.plusMinutes(Math.max(0, dwellMinutes));
            adjustedStops.add(new CoursePreviewResponse.Stop(
                    stop.sequenceNo(), stop.basketItemId(), stop.placeName(), stop.address(),
                    stop.latitude(), stop.longitude(), stop.defaultDwellMinutes(), stop.dwellMinutes(),
                    stop.dwellSource(), stop.arrivalDeadline(), stop.arrivalBufferMinutes(),
                    arrival, departure, selectedMinutes, selectedDistance, stop.ascentMeters(),
                    stop.congestionScore(), stop.hoursSourceType(), stop.openTime(), stop.closeTime(),
                    stop.eventId(), stop.eventEndTime(), selected == null ? stop.selectedMode() : selected.mode(),
                    selected, null, selected));
            previousDeparture = departure;
            if (useAlternative) {
                changed = true;
                travelDelta += selectedMinutes - baselineMinutes;
                distanceDelta += selectedDistance - baselineDistance;
            }
        }
        if (!changed) {
            return option;
        }
        int durationDelta = (int) Duration.between(option.scheduledEnd(), previousDeparture).toMinutes();
        return new CoursePreviewResponse.Option(
                option.strategy(), option.stopCount(), option.totalDurationMinutes() + durationDelta,
                option.totalTravelMinutes() + travelDelta, option.totalDistanceMeters() + distanceDelta,
                option.totalAscentMeters(), option.averageCongestionScore(), option.scheduledStart(),
                previousDeparture, adjustedStops, option.elevationComparisons());
    }

    private static int routeMinutes(RouteOption route, Integer fallback) {
        if (route == null || route.status() != RouteStatus.AVAILABLE || route.durationSeconds() == null) {
            return fallback == null ? 0 : fallback;
        }
        return Math.max(0, (int) Math.ceil(route.durationSeconds() / 60.0));
    }

    private static int routeDistance(RouteOption route, Integer fallback) {
        if (route == null || route.status() != RouteStatus.AVAILABLE || route.distanceMeters() == null) {
            return fallback == null ? 0 : fallback;
        }
        return Math.max(0, route.distanceMeters());
    }

    private static LocalTime laterOf(LocalTime left, LocalTime right) {
        return left.isAfter(right) ? left : right;
    }

    private static String titleFor(List<CoursePreviewResponse.Stop> stops) {
        String first = stops.get(0).placeName();
        return stops.size() == 1 ? first : first + " 외 " + (stops.size() - 1) + "곳";
    }

    private static int durationMinutes(LocalTime start, LocalTime end) {
        long minutes = Duration.between(start, end).toMinutes();
        return (int) (minutes < 0 ? minutes + 1440 : minutes);
    }

    private static BigDecimal sumNullable(List<BigDecimal> values) {
        List<BigDecimal> present = values.stream().filter(Objects::nonNull).toList();
        return present.isEmpty() ? null : present.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal averageNullable(List<BigDecimal> values) {
        List<BigDecimal> present = values.stream().filter(Objects::nonNull).toList();
        if (present.isEmpty()) return null;
        return present.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(present.size()), 2, RoundingMode.HALF_UP);
    }
}
