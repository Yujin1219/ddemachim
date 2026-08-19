package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseCongestionLevel;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.FastPlan;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.PlannedStop;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.course.service.CourseQuietPlanner.PlannedQuietStop;
import com.ddemachim.server.domain.course.service.CourseQuietPlanner.QuietPlan;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.LineStringGeometry;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteStep;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class CoursePreviewServiceTest {

    private static final Instant GENERATED_AT = Instant.parse("2026-08-18T01:02:03Z");

    private CoursePreviewInputResolver resolver;
    private CourseFastPlanner planner;
    private CoursePreviewService service;

    @BeforeEach
    void setUp() {
        resolver = mock(CoursePreviewInputResolver.class);
        planner = mock(CourseFastPlanner.class);
        service = new CoursePreviewService(
                resolver,
                planner,
                Clock.fixed(GENERATED_AT, ZoneOffset.UTC));
    }

    @Test
    void resolvesThenPlansOnceAndMapsTheFastPreviewWithoutRecallingAProvider() {
        CoursePreviewRequest request = request(List.of(new CoursePreviewRequest.Place(
                10L, 60, LocalTime.of(11, 0))));
        ResolvedPlace place = place(
                10L,
                "경복궁",
                60,
                60,
                CourseDwellSource.DEFAULT,
                LocalTime.of(11, 0));
        List<ResolvedPlace> resolved = List.of(place);
        RouteOption incomingRoute = route(61, 800, List.of(leg(61, 800)));
        FastPlan plan = plan(
                3_659,
                121,
                List.of(stop(1, place, LocalTime.of(10, 50), LocalTime.of(11, 50), incomingRoute)));
        when(resolver.resolve(3L, request.serviceDate(), request.places())).thenReturn(resolved);
        when(planner.plan(request, resolved)).thenReturn(plan);

        CoursePreviewResponse response = service.preview(3L, request);

        assertThat(response.generatedAt()).isEqualTo(GENERATED_AT);
        assertThat(response.serviceDate()).isEqualTo(LocalDate.of(2026, 8, 18));
        assertThat(response.desiredStartTime()).isEqualTo(LocalTime.of(10, 0));
        assertThat(response.desiredEndTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(response.options()).singleElement().satisfies(option -> {
            assertThat(option.strategy()).isEqualTo(CourseRouteStrategy.FAST);
            assertThat(option.stopCount()).isEqualTo(1);
            assertThat(option.totalDurationMinutes()).isEqualTo(61);
            assertThat(option.totalTravelMinutes()).isEqualTo(3);
            assertThat(option.totalDistanceMeters()).isEqualTo(800);
            assertThat(option.totalAscentMeters()).isNull();
            assertThat(option.averageCongestionScore()).isNull();
            assertThat(option.scheduledStart()).isEqualTo(LocalTime.of(10, 0));
            assertThat(option.scheduledEnd()).isEqualTo(LocalTime.of(11, 0, 59));
            assertThat(option.stops()).singleElement().satisfies(mappedStop -> {
                assertThat(mappedStop.sequenceNo()).isEqualTo(1);
                assertThat(mappedStop.basketItemId()).isEqualTo(10L);
                assertThat(mappedStop.placeName()).isEqualTo("경복궁");
                assertThat(mappedStop.address()).isEqualTo("서울 종로구 사직로 161");
                assertThat(mappedStop.latitude()).isEqualTo(37.5776);
                assertThat(mappedStop.longitude()).isEqualTo(126.9769);
                assertThat(mappedStop.defaultDwellMinutes()).isEqualTo(60);
                assertThat(mappedStop.dwellMinutes()).isEqualTo(60);
                assertThat(mappedStop.dwellSource()).isEqualTo(CourseDwellSource.DEFAULT);
                assertThat(mappedStop.arrivalDeadline()).isEqualTo(LocalTime.of(11, 0));
                assertThat(mappedStop.arrivalBufferMinutes()).isEqualTo(10);
                assertThat(mappedStop.scheduledArrival()).isEqualTo(LocalTime.of(10, 50));
                assertThat(mappedStop.scheduledDeparture()).isEqualTo(LocalTime.of(11, 50));
                assertThat(mappedStop.travelMinutesFromPrevious()).isEqualTo(2);
                assertThat(mappedStop.travelDistanceMeters()).isEqualTo(800);
                assertThat(mappedStop.ascentMeters()).isNull();
                assertThat(mappedStop.congestionScore()).isNull();
                assertThat(mappedStop.hoursSourceType()).isEqualTo(CourseHoursSourceType.REAL);
                assertThat(mappedStop.openTime()).isEqualTo(LocalTime.of(9, 0));
                assertThat(mappedStop.closeTime()).isEqualTo(LocalTime.of(18, 0));
                assertThat(mappedStop.eventId()).isNull();
                assertThat(mappedStop.eventEndTime()).isNull();
                assertThat(mappedStop.incomingRoute()).isSameAs(incomingRoute);
            });
        });
        InOrder order = inOrder(resolver, planner);
        order.verify(resolver).resolve(3L, request.serviceDate(), request.places());
        order.verify(planner).plan(request, resolved);
        verifyNoMoreInteractions(resolver, planner);
    }

    @Test
    void usesTopLevelDistanceFirstAndFallsBackToCompleteLegDistances() {
        CoursePreviewRequest request = request(List.of(
                new CoursePreviewRequest.Place(10L, 30, null),
                new CoursePreviewRequest.Place(11L, 30, null)));
        ResolvedPlace first = place(10L, "경복궁", 60, 30, CourseDwellSource.USER_MODIFIED, null);
        ResolvedPlace second = place(11L, "창덕궁", 45, 30, CourseDwellSource.USER_MODIFIED, null);
        List<ResolvedPlace> resolved = List.of(first, second);
        RouteOption topLevelDistance = route(60, 900, List.of(leg(60, null)));
        RouteOption legFallback = route(120, null, List.of(leg(50, 100), leg(70, 200)));
        FastPlan plan = plan(
                2_000,
                180,
                List.of(
                        stop(1, first, LocalTime.of(10, 1), LocalTime.of(10, 31), topLevelDistance),
                        stop(2, second, LocalTime.of(10, 33), LocalTime.of(11, 3), legFallback)));
        when(resolver.resolve(3L, request.serviceDate(), request.places())).thenReturn(resolved);
        when(planner.plan(request, resolved)).thenReturn(plan);

        CoursePreviewResponse.Option option = service.preview(3L, request).options().getFirst();

        assertThat(option.totalDistanceMeters()).isEqualTo(1_200);
        assertThat(option.stops())
                .extracting(CoursePreviewResponse.Stop::travelDistanceMeters)
                .containsExactly(900, 300);
        assertThat(option.stops())
                .extracting(CoursePreviewResponse.Stop::arrivalBufferMinutes)
                .containsOnlyNulls();
    }

    @Test
    void keepsAggregateDistanceUnknownWhenAnySelectedRouteDistanceIsUnknown() {
        CoursePreviewRequest request = request(List.of(
                new CoursePreviewRequest.Place(10L, 30, null),
                new CoursePreviewRequest.Place(11L, 30, null)));
        ResolvedPlace first = place(10L, "경복궁", 60, 30, CourseDwellSource.USER_MODIFIED, null);
        ResolvedPlace second = place(11L, "창덕궁", 45, 30, CourseDwellSource.USER_MODIFIED, null);
        List<ResolvedPlace> resolved = List.of(first, second);
        RouteOption known = route(60, 900, List.of(leg(60, 900)));
        RouteOption unknown = route(120, null, List.of(leg(120, null)));
        when(resolver.resolve(3L, request.serviceDate(), request.places())).thenReturn(resolved);
        when(planner.plan(request, resolved)).thenReturn(plan(
                2_000,
                180,
                List.of(
                        stop(1, first, LocalTime.of(10, 1), LocalTime.of(10, 31), known),
                        stop(2, second, LocalTime.of(10, 33), LocalTime.of(11, 3), unknown))));

        CoursePreviewResponse.Option option = service.preview(3L, request).options().getFirst();

        assertThat(option.totalDistanceMeters()).isNull();
        assertThat(option.stops())
                .extracting(CoursePreviewResponse.Stop::travelDistanceMeters)
                .containsExactly(900, null);
    }

    @Test
    void returnsFastAndQuietOptionsWithFourLevelCongestionScores() {
        CourseQuietPlanner quietPlanner = mock(CourseQuietPlanner.class);
        CoursePreviewService quietService = new CoursePreviewService(
                resolver,
                planner,
                quietPlanner,
                Clock.fixed(GENERATED_AT, ZoneOffset.UTC));
        CoursePreviewRequest request = request(List.of(new CoursePreviewRequest.Place(10L, 30, null)));
        ResolvedPlace place = place(10L, "경복궁", 60, 30, CourseDwellSource.USER_MODIFIED, null);
        List<ResolvedPlace> resolved = List.of(place);
        RouteOption route = route(120, 800, List.of(leg(120, 800)));
        FastPlan fastPlan = plan(
                1_920,
                120,
                List.of(stop(1, place, LocalTime.of(10, 2), LocalTime.of(10, 32), route)));
        QuietPlan quietPlan = new QuietPlan(
                CourseRouteStrategy.QUIET,
                LocalDateTime.of(2026, 8, 18, 10, 0),
                LocalDateTime.of(2026, 8, 18, 10, 32),
                1_920,
                120,
                List.of(new PlannedQuietStop(
                        1,
                        place,
                        LocalDateTime.of(2026, 8, 18, 10, 2),
                        LocalDateTime.of(2026, 8, 18, 10, 32),
                        route,
                        CourseCongestionLevel.SLIGHTLY_CROWDED)));
        when(resolver.resolve(3L, request.serviceDate(), request.places())).thenReturn(resolved);
        when(planner.plan(request, resolved)).thenReturn(fastPlan);
        when(quietPlanner.plan(request, resolved)).thenReturn(quietPlan);

        CoursePreviewResponse response = quietService.preview(3L, request);

        assertThat(response.options())
                .extracting(CoursePreviewResponse.Option::strategy)
                .containsExactly(CourseRouteStrategy.FAST, CourseRouteStrategy.QUIET);
        CoursePreviewResponse.Option quiet = response.options().get(1);
        assertThat(quiet.averageCongestionScore()).isEqualByComparingTo("67.00");
        assertThat(quiet.stops().getFirst().congestionScore()).isEqualByComparingTo("67");
    }

    private static CoursePreviewRequest request(List<CoursePreviewRequest.Place> places) {
        return new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                new CoursePreviewRequest.Start(
                        CourseStartType.CURRENT_LOCATION,
                        "현재 위치",
                        37.5665,
                        126.9780),
                places);
    }

    private static ResolvedPlace place(
            Long basketItemId,
            String placeName,
            Integer defaultDwellMinutes,
            Integer dwellMinutes,
            CourseDwellSource dwellSource,
            LocalTime arrivalDeadline) {
        return new ResolvedPlace(
                basketItemId,
                null,
                null,
                placeName,
                "서울 종로구 사직로 161",
                37.5776,
                126.9769,
                defaultDwellMinutes,
                dwellMinutes,
                dwellSource,
                arrivalDeadline,
                CourseHoursSourceType.REAL,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                false);
    }

    private static PlannedStop stop(
            int sequence,
            ResolvedPlace place,
            LocalTime arrival,
            LocalTime departure,
            RouteOption incomingRoute) {
        LocalDate serviceDate = LocalDate.of(2026, 8, 18);
        return new PlannedStop(
                sequence,
                place,
                serviceDate.atTime(arrival),
                serviceDate.atTime(departure),
                incomingRoute);
    }

    private static FastPlan plan(long elapsedSeconds, long travelSeconds, List<PlannedStop> stops) {
        return new FastPlan(
                CourseRouteStrategy.FAST,
                LocalDateTime.of(2026, 8, 18, 10, 0),
                LocalDateTime.of(2026, 8, 18, 11, 0, 59),
                elapsedSeconds,
                travelSeconds,
                stops);
    }

    private static RouteOption route(
            Integer durationSeconds,
            Integer distanceMeters,
            List<RouteLeg> legs) {
        return new RouteOption(
                RouteMode.TRANSIT,
                RouteStatus.AVAILABLE,
                durationSeconds,
                distanceMeters,
                1_400,
                0,
                180,
                null,
                legs);
    }

    private static RouteLeg leg(Integer durationSeconds, Integer distanceMeters) {
        LineStringGeometry geometry = new LineStringGeometry(List.of(
                List.of(126.9780, 37.5665),
                List.of(126.9790, 37.5675)));
        RouteStep walkStep = new RouteStep("세종대로", 180, "횡단보도를 건너 직진", geometry);
        return new RouteLeg(
                RouteMode.WALK,
                "도보",
                durationSeconds,
                distanceMeters,
                geometry,
                List.of(walkStep));
    }
}
