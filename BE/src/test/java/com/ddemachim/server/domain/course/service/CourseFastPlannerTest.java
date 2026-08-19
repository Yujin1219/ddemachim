package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.FastPlan;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.PlannedStop;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.domain.route.service.RouteProviderClient;
import com.ddemachim.server.domain.route.service.SelectedTransitRoute;
import com.ddemachim.server.domain.route.service.TransitWalkSegment;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class CourseFastPlannerTest {

    private static final LocalDate SERVICE_DATE = LocalDate.of(2026, 8, 18);
    private static final Coordinate START = new Coordinate(37.0, 126.0);

    @Test
    void nullResolvedPlacesProduceInvalidPreviewInputWithoutCallingProvider() {
        CoursePreviewInputResolver.ResolvedPlace place = place(1L, 37.1, 126.1);
        RecordingProvider provider = new RecordingProvider((origin, destination) -> route(60));

        assertInvalidPreviewInput(() -> new CourseFastPlanner(provider)
                .plan(request(List.of(place)), null));

        assertThat(provider.calls()).isEmpty();
    }

    @Test
    void emptyResolvedPlacesProduceInvalidPreviewInputWithoutCallingProvider() {
        CoursePreviewInputResolver.ResolvedPlace place = place(1L, 37.1, 126.1);
        RecordingProvider provider = new RecordingProvider((origin, destination) -> route(60));

        assertInvalidPreviewInput(() -> new CourseFastPlanner(provider)
                .plan(request(List.of(place)), List.of()));

        assertThat(provider.calls()).isEmpty();
    }

    @Test
    void plansDynamicNearestNeighborWithExactlyOneCallPerRemainingPlaceAndRetainsWinners() {
        List<CoursePreviewInputResolver.ResolvedPlace> places = List.of(
                place(1L, 37.1, 126.1),
                place(2L, 37.2, 126.2),
                place(3L, 37.3, 126.3),
                place(4L, 37.4, 126.4),
                place(5L, 37.5, 126.5));
        Map<Od, RouteOption> routes = new HashMap<>();
        add(routes, START, places.get(0), 500);
        RouteOption startToSecond = add(routes, START, places.get(1), 100);
        add(routes, START, places.get(2), 300);
        add(routes, START, places.get(3), 400);
        add(routes, START, places.get(4), 200);
        Coordinate second = coordinate(places.get(1));
        add(routes, second, places.get(0), 400);
        RouteOption secondToThird = add(routes, second, places.get(2), 50);
        add(routes, second, places.get(3), 300);
        add(routes, second, places.get(4), 200);
        Coordinate third = coordinate(places.get(2));
        add(routes, third, places.get(0), 300);
        RouteOption thirdToFourth = add(routes, third, places.get(3), 40);
        add(routes, third, places.get(4), 100);
        Coordinate fourth = coordinate(places.get(3));
        add(routes, fourth, places.get(0), 200);
        RouteOption fourthToFifth = add(routes, fourth, places.get(4), 30);
        Coordinate fifth = coordinate(places.get(4));
        RouteOption fifthToFirst = add(routes, fifth, places.get(0), 20);
        RecordingProvider provider = new RecordingProvider((origin, destination) ->
                routes.get(new Od(origin, destination)));

        FastPlan plan = new CourseFastPlanner(provider).plan(request(places), places);

        assertThat(plan.strategy()).isEqualTo(CourseRouteStrategy.FAST);
        assertThat(plan.stops())
                .extracting(stop -> stop.resolvedPlace().basketItemId())
                .containsExactly(2L, 3L, 4L, 5L, 1L);
        assertThat(plan.stops()).extracting(PlannedStop::sequence)
                .containsExactly(1, 2, 3, 4, 5);
        assertThat(plan.stops().get(0).incomingRoute()).isSameAs(startToSecond);
        assertThat(plan.stops().get(1).incomingRoute()).isSameAs(secondToThird);
        assertThat(plan.stops().get(2).incomingRoute()).isSameAs(thirdToFourth);
        assertThat(plan.stops().get(3).incomingRoute()).isSameAs(fourthToFifth);
        assertThat(plan.stops().get(4).incomingRoute()).isSameAs(fifthToFirst);
        assertThat(plan.totalTravelSeconds()).isEqualTo(240);
        assertThat(plan.totalElapsedSeconds()).isEqualTo(540);
        assertThat(provider.calls()).containsExactly(
                call(START, places.get(0)), call(START, places.get(1)), call(START, places.get(2)),
                call(START, places.get(3)), call(START, places.get(4)),
                call(second, places.get(0)), call(second, places.get(2)), call(second, places.get(3)),
                call(second, places.get(4)),
                call(third, places.get(0)), call(third, places.get(3)), call(third, places.get(4)),
                call(fourth, places.get(0)), call(fourth, places.get(4)),
                call(fifth, places.get(0)));
        assertThat(provider.calls()).hasSize(15);
        assertThatThrownBy(() -> plan.stops().add(plan.stops().getFirst()))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void retainsTheRichSelectedTransitWithoutReplacingTheOriginalRouteOptionOrLegs() {
        CoursePreviewInputResolver.ResolvedPlace place = place(1L, 37.1, 126.1);
        RouteOption originalRoute = route(120);
        TransitWalkSegment walkSegment = new TransitWalkSegment(
                1,
                0,
                START,
                coordinate(place),
                40,
                50,
                List.of(START, coordinate(place)));
        SelectedTransitRoute selectedTransit = new SelectedTransitRoute(
                originalRoute, List.of(walkSegment));
        RichRecordingProvider provider = new RichRecordingProvider(selectedTransit);

        PlannedStop stop = new CourseFastPlanner(provider)
                .plan(request(List.of(place)), List.of(place))
                .stops().getFirst();

        assertThat(provider.calls()).containsExactly(new Call(START, coordinate(place)));
        assertThat(stop.incomingRoute()).isSameAs(originalRoute);
        assertThat(stop.incomingRoute().legs()).isSameAs(originalRoute.legs());
        assertThat(stop.selectedTransitRoute()).isSameAs(selectedTransit);
        assertThat(stop.selectedTransitRoute().walkSegments()).containsExactly(walkSegment);
    }

    @Test
    void equalDurationsPreserveRequestOrder() {
        List<CoursePreviewInputResolver.ResolvedPlace> places = List.of(
                place(1L, 37.1, 126.1), place(2L, 37.2, 126.2));
        RecordingProvider provider = new RecordingProvider((origin, destination) -> route(300));

        FastPlan plan = new CourseFastPlanner(provider).plan(request(places), places);

        assertThat(plan.stops()).extracting(stop -> stop.resolvedPlace().basketItemId())
                .containsExactly(1L, 2L);
    }

    @Test
    void waitsUntilOpeningBeforeStartingDwell() {
        CoursePreviewInputResolver.ResolvedPlace place = place(
                1L, 37.1, 126.1, 30, null, LocalTime.of(11, 0), LocalTime.of(18, 0), false);
        RecordingProvider provider = new RecordingProvider((origin, destination) -> route(600));

        PlannedStop stop = new CourseFastPlanner(provider)
                .plan(request(List.of(place)), List.of(place)).stops().getFirst();

        assertThat(stop.effectiveArrival()).isEqualTo(LocalDateTime.of(SERVICE_DATE, LocalTime.of(11, 0)));
        assertThat(stop.departure()).isEqualTo(LocalDateTime.of(SERVICE_DATE, LocalTime.of(11, 30)));
    }

    @Test
    void explicitlyClosedPlaceIsInfeasibleAfterItsRouteCall() {
        CoursePreviewInputResolver.ResolvedPlace closed = place(
                1L, 37.1, 126.1, 30, null, null, null, true);
        RecordingProvider provider = new RecordingProvider((origin, destination) -> route(60));

        assertFastPlanUnavailable(() -> new CourseFastPlanner(provider)
                .plan(request(List.of(closed)), List.of(closed)));
        assertThat(provider.calls()).hasSize(1);
    }

    @Test
    void departureExactlyAtClosingIsFeasibleButOneSecondAfterIsNot() {
        CoursePreviewInputResolver.ResolvedPlace equal = place(
                1L, 37.1, 126.1, 30, null, LocalTime.of(9, 0), LocalTime.of(10, 40), false);
        RecordingProvider equalProvider = new RecordingProvider((origin, destination) -> route(600));

        FastPlan plan = new CourseFastPlanner(equalProvider).plan(request(List.of(equal)), List.of(equal));

        assertThat(plan.scheduledEnd()).isEqualTo(LocalDateTime.of(SERVICE_DATE, LocalTime.of(10, 40)));

        CoursePreviewInputResolver.ResolvedPlace exceeded = place(
                1L, 37.1, 126.1, 30, null, LocalTime.of(9, 0), LocalTime.of(10, 39, 59), false);
        RecordingProvider exceededProvider = new RecordingProvider((origin, destination) -> route(600));
        assertFastPlanUnavailable(() -> new CourseFastPlanner(exceededProvider)
                .plan(request(List.of(exceeded)), List.of(exceeded)));
    }

    @Test
    void effectiveArrivalExactlyTenMinutesBeforeDeadlineIsFeasibleButOneSecondAfterIsNot() {
        CoursePreviewInputResolver.ResolvedPlace deadline = place(
                1L, 37.1, 126.1, 1, LocalTime.of(11, 0), LocalTime.of(9, 0), LocalTime.of(18, 0), false);
        RecordingProvider equalProvider = new RecordingProvider((origin, destination) -> route(3_000));

        FastPlan plan = new CourseFastPlanner(equalProvider).plan(request(List.of(deadline)), List.of(deadline));

        assertThat(plan.stops().getFirst().effectiveArrival())
                .isEqualTo(LocalDateTime.of(SERVICE_DATE, LocalTime.of(10, 50)));

        RecordingProvider exceededProvider = new RecordingProvider((origin, destination) -> route(3_001));
        assertFastPlanUnavailable(() -> new CourseFastPlanner(exceededProvider)
                .plan(request(List.of(deadline)), List.of(deadline)));
    }

    @Test
    void departureExactlyAtDesiredEndIsFeasibleButOneSecondAfterIsNot() {
        CoursePreviewInputResolver.ResolvedPlace place = place(
                1L, 37.1, 126.1, 30, null, LocalTime.of(9, 0), LocalTime.of(18, 0), false);
        CoursePreviewRequest request = request(LocalTime.of(10, 0), LocalTime.of(10, 40), List.of(place));
        RecordingProvider equalProvider = new RecordingProvider((origin, destination) -> route(600));

        FastPlan plan = new CourseFastPlanner(equalProvider).plan(request, List.of(place));

        assertThat(plan.scheduledEnd()).isEqualTo(LocalDateTime.of(SERVICE_DATE, LocalTime.of(10, 40)));

        RecordingProvider exceededProvider = new RecordingProvider((origin, destination) -> route(601));
        assertFastPlanUnavailable(() -> new CourseFastPlanner(exceededProvider).plan(request, List.of(place)));
    }

    @Test
    void providerFailureForOneCandidateDoesNotPreventAnotherFeasibleCandidate() {
        List<CoursePreviewInputResolver.ResolvedPlace> places = List.of(
                place(1L, 37.1, 126.1), place(2L, 37.2, 126.2));
        RecordingProvider provider = new RecordingProvider((origin, destination) -> {
            if (origin.equals(START) && destination.equals(coordinate(places.get(0)))) {
                throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
            }
            return route(120);
        });

        FastPlan plan = new CourseFastPlanner(provider).plan(request(places), places);

        assertThat(plan.stops()).extracting(stop -> stop.resolvedPlace().basketItemId())
                .containsExactly(2L, 1L);
        assertThat(provider.calls()).hasSize(3);
    }

    @Test
    void allUnroutableOrInfeasibleCandidatesProduceTypedCourseFailure() {
        List<CoursePreviewInputResolver.ResolvedPlace> places = List.of(
                place(1L, 37.1, 126.1),
                place(2L, 37.2, 126.2, 60, LocalTime.of(10, 5),
                        LocalTime.of(9, 0), LocalTime.of(18, 0), false));
        RecordingProvider provider = new RecordingProvider((origin, destination) -> {
            if (destination.equals(coordinate(places.get(0)))) {
                throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
            }
            return route(60);
        });

        assertFastPlanUnavailable(() -> new CourseFastPlanner(provider).plan(request(places), places));
        assertThat(provider.calls()).hasSize(2);
    }

    @Test
    void unexpectedRuntimeExceptionPropagates() {
        CoursePreviewInputResolver.ResolvedPlace place = place(1L, 37.1, 126.1);
        RecordingProvider provider = new RecordingProvider((origin, destination) -> {
            throw new IllegalStateException("programming failure");
        });

        assertThatThrownBy(() -> new CourseFastPlanner(provider)
                        .plan(request(List.of(place)), List.of(place)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("programming failure");
    }

    private static void assertFastPlanUnavailable(org.assertj.core.api.ThrowableAssert.ThrowingCallable callable) {
        assertThatThrownBy(callable)
                .isInstanceOfSatisfying(CourseException.class, exception -> {
                    assertThat(exception.getCode()).isEqualTo(CourseErrorStatus.FAST_PLAN_UNAVAILABLE);
                    assertThat(exception.getErrorReasonHttpStatus().getHttpStatus())
                            .isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT);
                    assertThat(exception.getErrorReasonHttpStatus().getCode()).isEqualTo("COURSE4222");
                });
    }

    private static void assertInvalidPreviewInput(org.assertj.core.api.ThrowableAssert.ThrowingCallable callable) {
        assertThatThrownBy(callable)
                .isInstanceOfSatisfying(CourseException.class, exception -> {
                    assertThat(exception.getCode()).isSameAs(CourseErrorStatus.INVALID_PREVIEW_INPUT);
                    assertThat(exception.getErrorReasonHttpStatus().getHttpStatus())
                            .isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getErrorReasonHttpStatus().getCode()).isEqualTo("COURSE4001");
                });
    }

    private static CoursePreviewRequest request(List<CoursePreviewInputResolver.ResolvedPlace> places) {
        return request(LocalTime.of(10, 0), LocalTime.of(18, 0), places);
    }

    private static CoursePreviewRequest request(
            LocalTime start, LocalTime end, List<CoursePreviewInputResolver.ResolvedPlace> places) {
        return new CoursePreviewRequest(
                SERVICE_DATE,
                start,
                end,
                new CoursePreviewRequest.Start(
                        CourseStartType.CURRENT_LOCATION, "출발", START.latitude(), START.longitude()),
                places.stream()
                        .map(place -> new CoursePreviewRequest.Place(
                                place.basketItemId(), place.dwellMinutes(), place.arrivalDeadline()))
                        .toList());
    }

    private static CoursePreviewInputResolver.ResolvedPlace place(
            Long id, double latitude, double longitude) {
        return place(
                id, latitude, longitude, 1, null,
                LocalTime.of(0, 0), LocalTime.of(23, 59), false);
    }

    private static CoursePreviewInputResolver.ResolvedPlace place(
            Long id,
            double latitude,
            double longitude,
            int dwellMinutes,
            LocalTime arrivalDeadline,
            LocalTime openTime,
            LocalTime closeTime,
            boolean closed) {
        return new CoursePreviewInputResolver.ResolvedPlace(
                id,
                null,
                null,
                "장소 " + id,
                "서울 종로구",
                latitude,
                longitude,
                dwellMinutes,
                dwellMinutes,
                CourseDwellSource.DEFAULT,
                arrivalDeadline,
                CourseHoursSourceType.REAL,
                openTime,
                closeTime,
                closed);
    }

    private static RouteOption route(int durationSeconds) {
        return new RouteOption(
                RouteMode.TRANSIT,
                RouteStatus.AVAILABLE,
                durationSeconds,
                1_000,
                1_500,
                0,
                100,
                null,
                List.of());
    }

    private static RouteOption add(
            Map<Od, RouteOption> routes,
            Coordinate origin,
            CoursePreviewInputResolver.ResolvedPlace destination,
            int durationSeconds) {
        RouteOption route = route(durationSeconds);
        routes.put(new Od(origin, coordinate(destination)), route);
        return route;
    }

    private static Coordinate coordinate(CoursePreviewInputResolver.ResolvedPlace place) {
        return new Coordinate(place.latitude(), place.longitude());
    }

    private static Call call(Coordinate origin, CoursePreviewInputResolver.ResolvedPlace destination) {
        return new Call(origin, coordinate(destination));
    }

    private record Od(Coordinate origin, Coordinate destination) {
    }

    private record Call(Coordinate origin, Coordinate destination) {
    }

    private static final class RecordingProvider implements RouteProviderClient {

        private final BiFunction<Coordinate, Coordinate, RouteOption> transit;
        private final List<Call> calls = new ArrayList<>();

        private RecordingProvider(BiFunction<Coordinate, Coordinate, RouteOption> transit) {
            this.transit = transit;
        }

        @Override
        public RouteOption findWalking(Coordinate origin, Coordinate destination) {
            throw new AssertionError("FAST planner must not request walking routes");
        }

        @Override
        public RouteOption findTransit(Coordinate origin, Coordinate destination) {
            calls.add(new Call(origin, destination));
            return transit.apply(origin, destination);
        }

        @Override
        public RouteOption findTaxi(Coordinate origin, Coordinate destination) {
            throw new AssertionError("FAST planner must not request taxi routes");
        }

        private List<Call> calls() {
            return List.copyOf(calls);
        }
    }

    private static final class RichRecordingProvider implements RouteProviderClient {

        private final SelectedTransitRoute selectedTransit;
        private final List<Call> calls = new ArrayList<>();

        private RichRecordingProvider(SelectedTransitRoute selectedTransit) {
            this.selectedTransit = selectedTransit;
        }

        @Override
        public RouteOption findWalking(Coordinate origin, Coordinate destination) {
            throw new AssertionError("FAST planner must not request walking routes");
        }

        @Override
        public RouteOption findTransit(Coordinate origin, Coordinate destination) {
            throw new AssertionError("FAST planner must retain the rich transit result");
        }

        @Override
        public SelectedTransitRoute findSelectedTransit(Coordinate origin, Coordinate destination) {
            calls.add(new Call(origin, destination));
            return selectedTransit;
        }

        @Override
        public RouteOption findTaxi(Coordinate origin, Coordinate destination) {
            throw new AssertionError("FAST planner must not request taxi routes");
        }

        private List<Call> calls() {
            return List.copyOf(calls);
        }
    }
}
