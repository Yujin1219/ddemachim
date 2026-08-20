package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.service.CourseRouteProviderClient;
import com.ddemachim.server.domain.route.service.SelectedTransitRoute;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class CourseFastPlannerTransportSelectionTest {

    @Test
    void keepsFeasibleTwentyMinuteWalkWithoutLookingUpTransit() {
        RecordingProvider provider = new RecordingProvider(route(RouteMode.WALK, 1_200), route(RouteMode.TRANSIT, 600));
        CoursePreviewInputResolver.ResolvedPlace place = new CoursePreviewInputResolver.ResolvedPlace(
                1L, null, null, "장소", "서울 종로구", 37.1, 126.1, 30, 30,
                CourseDwellSource.DEFAULT, null, CourseHoursSourceType.REAL,
                LocalTime.of(9, 0), LocalTime.of(18, 0), false);

        CourseFastPlanner.PlannedStop stop = new CourseFastPlanner(provider)
                .plan(request(place), List.of(place))
                .stops().getFirst();

        assertThat(stop.incomingRoute().mode()).isEqualTo(RouteMode.WALK);
        assertThat(stop.alternativeRoute()).isNull();
        assertThat(provider.walkingCalls).isEqualTo(1);
        assertThat(provider.transitCalls).isZero();
    }

    @Test
    void selectsTransitWhenWalkingIsUnavailable() {
        RecordingProvider provider = new RecordingProvider(null, route(RouteMode.TRANSIT, 600));
        CoursePreviewInputResolver.ResolvedPlace place = place();

        CourseFastPlanner.PlannedStop stop = new CourseFastPlanner(provider)
                .plan(request(place), List.of(place))
                .stops().getFirst();

        assertThat(stop.incomingRoute()).isSameAs(provider.transitRoute);
        assertThat(stop.alternativeRoute()).isNull();
        assertThat(provider.walkingCalls).isEqualTo(1);
        assertThat(provider.transitCalls).isEqualTo(1);
    }

    @Test
    void selectsTransitForLongWalkWithOneLookupAndRetainsWalkingAlternative() {
        RouteOption walking = route(RouteMode.WALK, 1_201);
        RecordingProvider provider = new RecordingProvider(walking, route(RouteMode.TRANSIT, 600));
        CoursePreviewInputResolver.ResolvedPlace place = place();

        CourseFastPlanner.PlannedStop stop = new CourseFastPlanner(provider)
                .plan(request(place), List.of(place))
                .stops().getFirst();

        assertThat(stop.incomingRoute()).isSameAs(provider.transitRoute);
        assertThat(stop.alternativeRoute()).isSameAs(walking);
        assertThat(provider.walkingCalls).isEqualTo(1);
        assertThat(provider.transitCalls).isEqualTo(1);
    }

    @Test
    void cachesTransitByDirectedLegAcrossPermutationEvaluationAndFinalAssembly() {
        RecordingProvider provider = new RecordingProvider(route(RouteMode.WALK, 1_201), route(RouteMode.TRANSIT, 600));
        List<CoursePreviewInputResolver.ResolvedPlace> places = List.of(
                place(),
                new CoursePreviewInputResolver.ResolvedPlace(
                        2L, null, null, "다른 장소", "서울 종로구", 37.2, 126.2, 30, 30,
                        CourseDwellSource.DEFAULT, null, CourseHoursSourceType.REAL,
                        LocalTime.of(9, 0), LocalTime.of(18, 0), false));

        new CourseFastPlanner(provider).plan(request(places), places);

        assertThat(provider.walkingCalls).isEqualTo(4);
        assertThat(provider.transitCalls).isEqualTo(4);
    }

    @Test
    void waitsAtTheDeadlineAnchorAfterArrivingEarly() {
        RecordingProvider provider = new RecordingProvider(route(RouteMode.WALK, 60), route(RouteMode.TRANSIT, 600));
        CoursePreviewInputResolver.ResolvedPlace place = new CoursePreviewInputResolver.ResolvedPlace(
                1L, null, null, "장소", "서울 종로구", 37.1, 126.1, 30, 30,
                CourseDwellSource.DEFAULT, LocalTime.of(11, 0), CourseHoursSourceType.REAL,
                LocalTime.of(9, 0), LocalTime.of(18, 0), false);

        CourseFastPlanner.PlannedStop stop = new CourseFastPlanner(provider)
                .plan(request(place), List.of(place))
                .stops().getFirst();

        assertThat(stop.effectiveArrival()).hasToString("2026-08-19T10:50");
        assertThat(stop.departure()).hasToString("2026-08-19T11:20");
    }

    @Test
    void selectsTransitWhenTheWalkingArrivalWouldMissTheDeadline() {
        RecordingProvider provider = new RecordingProvider(route(RouteMode.WALK, 1_200), route(RouteMode.TRANSIT, 300));
        CoursePreviewInputResolver.ResolvedPlace place = new CoursePreviewInputResolver.ResolvedPlace(
                1L, null, null, "장소", "서울 종로구", 37.1, 126.1, 30, 30,
                CourseDwellSource.DEFAULT, LocalTime.of(10, 20), CourseHoursSourceType.REAL,
                LocalTime.of(9, 0), LocalTime.of(18, 0), false);

        CourseFastPlanner.PlannedStop stop = new CourseFastPlanner(provider)
                .plan(request(place), List.of(place))
                .stops().getFirst();

        assertThat(stop.incomingRoute()).isSameAs(provider.transitRoute);
        assertThat(stop.alternativeRoute()).isNull();
        assertThat(provider.transitCalls).isEqualTo(1);
    }

    private static CoursePreviewInputResolver.ResolvedPlace place() {
        return new CoursePreviewInputResolver.ResolvedPlace(
                1L, null, null, "장소", "서울 종로구", 37.1, 126.1, 30, 30,
                CourseDwellSource.DEFAULT, null, CourseHoursSourceType.REAL,
                LocalTime.of(9, 0), LocalTime.of(18, 0), false);
    }

    private static CoursePreviewRequest request(CoursePreviewInputResolver.ResolvedPlace place) {
        return request(List.of(place));
    }

    private static CoursePreviewRequest request(List<CoursePreviewInputResolver.ResolvedPlace> places) {
        return new CoursePreviewRequest(
                LocalDate.of(2026, 8, 19), LocalTime.of(10, 0),
                new CoursePreviewRequest.Start(CourseStartType.CURRENT_LOCATION, "출발", 37.0, 126.0),
                places.stream()
                        .map(place -> new CoursePreviewRequest.Place(place.basketItemId(), 30, null))
                        .toList());
    }

    private static RouteOption route(RouteMode mode, int durationSeconds) {
        return new RouteOption(mode, RouteStatus.AVAILABLE, durationSeconds, 800,
                null, null, 800, null, List.of());
    }

    private static final class RecordingProvider implements CourseRouteProviderClient {
        private final RouteOption walkingRoute;
        private final RouteOption transitRoute;
        private int walkingCalls;
        private int transitCalls;

        private RecordingProvider(RouteOption walkingRoute, RouteOption transitRoute) {
            this.walkingRoute = walkingRoute;
            this.transitRoute = transitRoute;
        }

        @Override
        public RouteOption findWalking(Coordinate origin, Coordinate destination) {
            walkingCalls++;
            return walkingRoute;
        }

        @Override
        public RouteOption findTransit(Coordinate origin, Coordinate destination) {
            transitCalls++;
            return transitRoute;
        }

        @Override
        public SelectedTransitRoute findSelectedTransit(Coordinate origin, Coordinate destination) {
            transitCalls++;
            return new SelectedTransitRoute(transitRoute, List.of());
        }

        @Override
        public RouteOption findTaxi(Coordinate origin, Coordinate destination) {
            throw new UnsupportedOperationException();
        }
    }
}
