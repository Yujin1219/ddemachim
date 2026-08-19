package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.enums.CourseCongestionLevel;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.service.RouteProviderClient;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class CourseQuietPlannerTest {

    @Test
    void choosesLowerTravelPlusFourLevelCongestionPenaltyAtExpectedArrival() {
        ResolvedPlace nearCrowded = place(1L, 37.1, 126.1);
        ResolvedPlace fartherRelaxed = place(2L, 37.2, 126.2);
        RouteProviderClient routes = mock(RouteProviderClient.class);
        when(routes.findTransit(any(), any())).thenAnswer(invocation -> {
            com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate destination =
                    invocation.getArgument(1);
            return route(destination.latitude() == 37.1 ? 60 : 600);
        });
        CourseCongestionForecastProvider forecast = (place, arrival) ->
                place.basketItemId() == 1L
                        ? CourseCongestionLevel.CROWDED
                        : CourseCongestionLevel.RELAXED;

        CourseQuietPlanner.QuietPlan plan = new CourseQuietPlanner(routes, forecast)
                .plan(request(nearCrowded, fartherRelaxed), List.of(nearCrowded, fartherRelaxed));

        assertThat(plan.strategy()).isEqualTo(CourseRouteStrategy.QUIET);
        assertThat(plan.stops())
                .extracting(stop -> stop.resolvedPlace().basketItemId())
                .containsExactly(2L, 1L);
        assertThat(plan.stops())
                .extracting(CourseQuietPlanner.PlannedQuietStop::congestionLevel)
                .containsExactly(CourseCongestionLevel.RELAXED, CourseCongestionLevel.CROWDED);
    }

    @Test
    void keepsActualEarlyArrivalAfterValidatingDeadlineBuffer() {
        ResolvedPlace place = new ResolvedPlace(
                1L, null, null, "장소", "서울 종로구", 37.1, 126.1,
                1, 1, CourseDwellSource.DEFAULT, LocalTime.of(11, 0), CourseHoursSourceType.REAL,
                LocalTime.of(9, 0), LocalTime.of(18, 0), false);
        RouteProviderClient routes = mock(RouteProviderClient.class);
        when(routes.findTransit(any(), any())).thenReturn(route(60));

        CourseQuietPlanner.QuietPlan plan = new CourseQuietPlanner(
                routes, (resolvedPlace, arrival) -> CourseCongestionLevel.NORMAL)
                .plan(request(place), List.of(place));

        assertThat(plan.stops().getFirst().effectiveArrival()).hasToString("2026-08-18T10:01");
        assertThat(plan.stops().getFirst().departure()).hasToString("2026-08-18T10:02");
    }

    @Test
    void schedulesPastTheFormerDesiredEndBoundaryWhenOperatingHoursAllowIt() {
        ResolvedPlace place = place(1L, 37.1, 126.1);
        RouteProviderClient routes = mock(RouteProviderClient.class);
        when(routes.findTransit(any(), any())).thenReturn(route(8 * 60 * 60));

        CourseQuietPlanner.QuietPlan plan = new CourseQuietPlanner(
                routes, (resolvedPlace, arrival) -> CourseCongestionLevel.NORMAL)
                .plan(request(place), List.of(place));

        assertThat(plan.scheduledEnd()).hasToString("2026-08-18T18:01");
    }

    private static CoursePreviewRequest request(ResolvedPlace... places) {
        return new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                new CoursePreviewRequest.Start(CourseStartType.CURRENT_LOCATION, "출발", 37.0, 126.0),
                List.of(places).stream()
                        .map(place -> new CoursePreviewRequest.Place(place.basketItemId(), 1, null))
                        .toList());
    }

    private static ResolvedPlace place(long id, double latitude, double longitude) {
        return new ResolvedPlace(
                id, null, null, "장소 " + id, "서울 종로구", latitude, longitude,
                1, 1, CourseDwellSource.DEFAULT, null, CourseHoursSourceType.REAL,
                LocalTime.MIN, LocalTime.of(23, 59), false);
    }

    private static RouteOption route(int seconds) {
        return new RouteOption(
                RouteMode.TRANSIT, RouteStatus.AVAILABLE, seconds, 1_000,
                1_500, 0, 100, null, List.of());
    }
}
