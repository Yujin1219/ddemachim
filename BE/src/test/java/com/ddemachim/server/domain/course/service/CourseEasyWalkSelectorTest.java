package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.FastPlan;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.PlannedStop;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.LineStringGeometry;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.domain.route.service.PedestrianSearchOption;
import com.ddemachim.server.domain.route.service.RouteProviderClient;
import com.ddemachim.server.domain.route.service.SelectedTransitRoute;
import com.ddemachim.server.domain.route.service.TransitWalkSegment;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CourseEasyWalkSelectorTest {

    @Test
    void keepsStopAndWalkOrderAndCallsAllFourVariantsInStableOrderForEveryWalk() {
        TransitWalkSegment firstWalk = walk(1, 0, coordinate(126.0), coordinate(126.001));
        TransitWalkSegment secondWalk = walk(2, 2, coordinate(126.002), coordinate(126.003));
        SelectedTransitRoute selectedTransit = new SelectedTransitRoute(
                transitRoute(), List.of(firstWalk, secondWalk));
        FastPlan fastPlan = fastPlan(selectedTransit);
        RecordingProvider provider = new RecordingProvider();
        ElevationProfileService profiles = mock(ElevationProfileService.class);
        when(profiles.profile(any())).thenReturn(profile(0.0, 0.0));

        CourseEasyWalkSelector.EasyWalkPlan result =
                new CourseEasyWalkSelector(provider, profiles).select(fastPlan);

        assertThat(result.fastPlan()).isSameAs(fastPlan);
        assertThat(result.transitSelections()).singleElement().satisfies(selection -> {
            assertThat(selection.selectedTransitRoute()).isSameAs(selectedTransit);
            assertThat(selection.walkSelections())
                    .extracting(walkSelection -> walkSelection.originalSegment().walkOrdinal())
                    .containsExactly(1, 2);
        });
        assertThat(provider.calls()).containsExactly(
                new VariantCall(firstWalk.start(), firstWalk.end(), PedestrianSearchOption.RECOMMENDED),
                new VariantCall(firstWalk.start(), firstWalk.end(), PedestrianSearchOption.RECOMMENDED_MAIN_ROAD),
                new VariantCall(firstWalk.start(), firstWalk.end(), PedestrianSearchOption.SHORTEST),
                new VariantCall(firstWalk.start(), firstWalk.end(), PedestrianSearchOption.SHORTEST_WITHOUT_STAIRS),
                new VariantCall(secondWalk.start(), secondWalk.end(), PedestrianSearchOption.RECOMMENDED),
                new VariantCall(secondWalk.start(), secondWalk.end(), PedestrianSearchOption.RECOMMENDED_MAIN_ROAD),
                new VariantCall(secondWalk.start(), secondWalk.end(), PedestrianSearchOption.SHORTEST),
                new VariantCall(secondWalk.start(), secondWalk.end(), PedestrianSearchOption.SHORTEST_WITHOUT_STAIRS));
    }

    @Test
    void allProfiledCandidatesPreferLowerSlopeBurdenOverTheFasterRoute() {
        TransitWalkSegment walk = walk(1, 0, coordinate(126.0), coordinate(126.001));
        FastPlan fastPlan = fastPlan(new SelectedTransitRoute(transitRoute(), List.of(walk)));
        LineStringGeometry steepGeometry = geometry(126.0);
        LineStringGeometry easyGeometry = geometry(126.01);
        RecordingProvider provider = new RecordingProvider((origin, destination, option) -> switch (option) {
            case RECOMMENDED -> walkingRoute(option, 60, 100, steepGeometry);
            case RECOMMENDED_MAIN_ROAD -> walkingRoute(option, 90, 120, easyGeometry);
            default -> throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
        });
        ElevationProfileService profiles = mock(ElevationProfileService.class);
        when(profiles.profile(steepGeometry)).thenReturn(profile(5.0, 20.0));
        when(profiles.profile(easyGeometry)).thenReturn(profile(8.0, 0.0));

        CourseEasyWalkSelector.WalkSelection selection =
                new CourseEasyWalkSelector(provider, profiles)
                        .select(fastPlan)
                        .transitSelections().getFirst()
                        .walkSelections().getFirst();

        assertThat(selection.selectedOption())
                .isEqualTo(PedestrianSearchOption.RECOMMENDED_MAIN_ROAD);
        assertThat(selection.status()).isEqualTo(CourseEasyWalkSelector.WalkSelectionStatus.PROFILED);
    }

    @Test
    void identicalCandidateGeometryIsProfiledOnceWithoutDiscardingDistinctCandidates() {
        TransitWalkSegment walk = walk(1, 0, coordinate(126.0), coordinate(126.001));
        FastPlan fastPlan = fastPlan(new SelectedTransitRoute(transitRoute(), List.of(walk)));
        LineStringGeometry sharedGeometry = geometry(126.0);
        RecordingProvider provider = new RecordingProvider((origin, destination, option) ->
                walkingRoute(option, 100, 200 + option.stableOrder(), sharedGeometry));
        ElevationProfileService profiles = mock(ElevationProfileService.class);
        when(profiles.profile(sharedGeometry)).thenReturn(profile(0.0, 0.0));

        CourseEasyWalkSelector.WalkSelection selection =
                new CourseEasyWalkSelector(provider, profiles)
                        .select(fastPlan)
                        .transitSelections().getFirst()
                        .walkSelections().getFirst();

        verify(profiles, times(1)).profile(sharedGeometry);
        assertThat(selection.selectedOption()).isEqualTo(PedestrianSearchOption.RECOMMENDED);
        assertThat(provider.calls()).hasSize(4);
    }

    @Test
    void allVariantFailuresRetainTheOriginalSegmentAsTypedTransitFallback() {
        TransitWalkSegment walk = walk(1, 0, coordinate(126.0), coordinate(126.001));
        SelectedTransitRoute selectedTransit = new SelectedTransitRoute(transitRoute(), List.of(walk));
        FastPlan fastPlan = fastPlan(selectedTransit);
        RecordingProvider provider = new RecordingProvider((origin, destination, option) -> {
            throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
        });
        ElevationProfileService profiles = mock(ElevationProfileService.class);

        CourseEasyWalkSelector.WalkSelection selection =
                new CourseEasyWalkSelector(provider, profiles)
                        .select(fastPlan)
                        .transitSelections().getFirst()
                        .walkSelections().getFirst();

        assertThat(selection.originalSegment()).isSameAs(walk);
        assertThat(selection.selectedWalkingRoute()).isNull();
        assertThat(selection.selectedOption()).isNull();
        assertThat(selection.status())
                .isEqualTo(CourseEasyWalkSelector.WalkSelectionStatus.TRANSIT_FALLBACK);
        assertThat(selection.elevationProfile().profile()).isNull();
        assertThat(selection.elevationProfile().ascentMeters()).isNull();
        assertThat(provider.calls()).hasSize(4);
        verify(profiles, times(0)).profile(any());
    }

    @Test
    void mixedProfilesSelectsOnlyAmongProfiledCandidatesEvenWhenUnprofiledIsFaster() {
        TransitWalkSegment walk = walk(1, 0, coordinate(126.0), coordinate(126.001));
        FastPlan fastPlan = fastPlan(new SelectedTransitRoute(transitRoute(), List.of(walk)));
        LineStringGeometry fastGeometry = geometry(126.0);
        LineStringGeometry profiledGeometry = geometry(126.01);
        RecordingProvider provider = new RecordingProvider((origin, destination, option) -> switch (option) {
            case RECOMMENDED -> walkingRoute(option, 60, 100, fastGeometry);
            case RECOMMENDED_MAIN_ROAD -> walkingRoute(option, 90, 120, profiledGeometry);
            default -> throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
        });
        ElevationProfileService profiles = mock(ElevationProfileService.class);
        when(profiles.profile(fastGeometry))
                .thenReturn(ElevationProfileService.ProfileResult.unavailable());
        when(profiles.profile(profiledGeometry)).thenReturn(profile(8.0, 4.0));

        CourseEasyWalkSelector.WalkSelection selection =
                new CourseEasyWalkSelector(provider, profiles)
                        .select(fastPlan)
                        .transitSelections().getFirst()
                        .walkSelections().getFirst();

        assertThat(selection.selectedOption())
                .isEqualTo(PedestrianSearchOption.RECOMMENDED_MAIN_ROAD);
        assertThat(selection.status())
                .isEqualTo(CourseEasyWalkSelector.WalkSelectionStatus.PROFILED);
        assertThat(selection.elevationProfile().ascentMeters()).isEqualTo(8.0);
        assertThat(selection.elevationProfile().steepUphillDistanceMeters()).isEqualTo(4.0);
    }

    @Test
    void allUnavailableProfilesUseDurationFallbackAcrossViableCandidates() {
        TransitWalkSegment walk = walk(1, 0, coordinate(126.0), coordinate(126.001));
        FastPlan fastPlan = fastPlan(new SelectedTransitRoute(transitRoute(), List.of(walk)));
        LineStringGeometry fastGeometry = geometry(126.0);
        LineStringGeometry slowGeometry = geometry(126.01);
        RecordingProvider provider = new RecordingProvider((origin, destination, option) -> switch (option) {
            case RECOMMENDED -> walkingRoute(option, 60, 100, fastGeometry);
            case RECOMMENDED_MAIN_ROAD -> walkingRoute(option, 90, 90, slowGeometry);
            default -> throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
        });
        ElevationProfileService profiles = mock(ElevationProfileService.class);
        when(profiles.profile(fastGeometry))
                .thenReturn(ElevationProfileService.ProfileResult.unavailable());
        when(profiles.profile(slowGeometry))
                .thenReturn(ElevationProfileService.ProfileResult.unavailable());

        CourseEasyWalkSelector.WalkSelection selection =
                new CourseEasyWalkSelector(provider, profiles)
                        .select(fastPlan)
                        .transitSelections().getFirst()
                        .walkSelections().getFirst();

        assertThat(selection.selectedOption()).isEqualTo(PedestrianSearchOption.RECOMMENDED);
        assertThat(selection.status())
                .isEqualTo(CourseEasyWalkSelector.WalkSelectionStatus.DEM_FALLBACK);
        assertThat(selection.elevationProfile().profile()).isNull();
        assertThat(selection.elevationProfile().ascentMeters()).isNull();
        assertThat(selection.elevationProfile().steepUphillDistanceMeters()).isNull();
    }

    private static ElevationProfileService.ProfileResult profile(double ascent, double steepDistance) {
        return new ElevationProfileService.ProfileResult(
                List.of(new ElevationProfileService.ProfilePoint(0.0, 126.0, 37.0, 10.0)),
                ascent,
                steepDistance);
    }

    private static FastPlan fastPlan(SelectedTransitRoute selectedTransit) {
        LocalDateTime start = LocalDateTime.of(2026, 8, 19, 10, 0);
        PlannedStop stop = new PlannedStop(
                1,
                new CoursePreviewInputResolver.ResolvedPlace(
                        1L, null, null, "장소", "서울 종로구", 37.0, 126.0,
                        10, 10, CourseDwellSource.DEFAULT, null, CourseHoursSourceType.REAL,
                        LocalTime.MIN, LocalTime.MAX, false),
                start.plusMinutes(5),
                start.plusMinutes(15),
                selectedTransit.option(),
                selectedTransit);
        return new FastPlan(
                CourseRouteStrategy.FAST,
                start,
                stop.departure(),
                900,
                300,
                List.of(stop));
    }

    private static TransitWalkSegment walk(
            int walkOrdinal, int legIndex, Coordinate start, Coordinate end) {
        return new TransitWalkSegment(
                walkOrdinal, legIndex, start, end, 60, 100, List.of(start, end));
    }

    private static Coordinate coordinate(double longitude) {
        return new Coordinate(37.0, longitude);
    }

    private static RouteOption transitRoute() {
        RouteLeg busLeg = new RouteLeg(RouteMode.TRANSIT, "버스", 300, 1_000, null);
        return new RouteOption(
                RouteMode.TRANSIT,
                RouteStatus.AVAILABLE,
                300,
                1_000,
                1_500,
                0,
                200,
                null,
                List.of(busLeg));
    }

    private static RouteOption walkingRoute(PedestrianSearchOption option) {
        int duration = 100 + option.stableOrder();
        int distance = 200 + option.stableOrder();
        LineStringGeometry geometry = geometry(126.0 + (option.stableOrder() * 0.001));
        return walkingRoute(option, duration, distance, geometry);
    }

    private static RouteOption walkingRoute(
            PedestrianSearchOption option,
            int duration,
            int distance,
            LineStringGeometry geometry) {
        return new RouteOption(
                RouteMode.WALK,
                RouteStatus.AVAILABLE,
                duration,
                distance,
                null,
                null,
                distance,
                null,
                List.of(new RouteLeg(RouteMode.WALK, null, duration, distance, geometry)));
    }

    private static LineStringGeometry geometry(double longitude) {
        return new LineStringGeometry(List.of(
                List.of(longitude, 37.0),
                List.of(longitude + 0.0001, 37.0)));
    }

    private record VariantCall(
            Coordinate origin, Coordinate destination, PedestrianSearchOption option) {
    }

    private static final class RecordingProvider implements RouteProviderClient {

        private final List<VariantCall> calls = new ArrayList<>();
        private final VariantFunction variants;

        private RecordingProvider() {
            this((origin, destination, option) -> walkingRoute(option));
        }

        private RecordingProvider(VariantFunction variants) {
            this.variants = variants;
        }

        @Override
        public RouteOption findWalking(Coordinate origin, Coordinate destination) {
            throw new AssertionError("EASY selector must request explicit variants");
        }

        @Override
        public RouteOption findWalkingVariant(
                Coordinate origin,
                Coordinate destination,
            PedestrianSearchOption option) {
            calls.add(new VariantCall(origin, destination, option));
            return variants.apply(origin, destination, option);
        }

        @Override
        public RouteOption findTransit(Coordinate origin, Coordinate destination) {
            throw new AssertionError("EASY selector must use retained transit routes");
        }

        @Override
        public RouteOption findTaxi(Coordinate origin, Coordinate destination) {
            throw new AssertionError("EASY selector must not request taxi routes");
        }

        private List<VariantCall> calls() {
            return List.copyOf(calls);
        }
    }

    @FunctionalInterface
    private interface VariantFunction {

        RouteOption apply(
                Coordinate origin,
                Coordinate destination,
                PedestrianSearchOption option);
    }
}
