package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.service.CourseFastPlanner.FastPlan;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.PlannedStop;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.LineStringGeometry;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.domain.route.service.PedestrianSearchOption;
import com.ddemachim.server.domain.route.service.RouteProviderClient;
import com.ddemachim.server.domain.route.service.SelectedTransitRoute;
import com.ddemachim.server.domain.route.service.TransitWalkSegment;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;

@Service
public class CourseEasyWalkSelector {

    private static final int MAX_EASY_WALK_DURATION_SECONDS = 20 * 60;

    private final RouteProviderClient routeProviderClient;
    private final ElevationProfileService elevationProfileService;

    public CourseEasyWalkSelector(
            RouteProviderClient routeProviderClient,
            ElevationProfileService elevationProfileService) {
        this.routeProviderClient = routeProviderClient;
        this.elevationProfileService = elevationProfileService;
    }

    public EasyWalkPlan select(FastPlan fastPlan) {
        Objects.requireNonNull(fastPlan);
        List<EasyTransitSelection> transitSelections = new ArrayList<>();
        Map<LineStringGeometry, ElevationProfileService.ProfileResult> profilesByGeometry =
                new HashMap<>();
        for (PlannedStop stop : fastPlan.stops()) {
            SelectedTransitRoute selectedTransit = stop.selectedTransitRoute();
            List<WalkSelection> walkSelections = isEligibleSelectedWalk(stop)
                    ? selectedTransit.walkSegments().stream()
                    .map(segment -> selectWalk(segment, profilesByGeometry))
                    .toList()
                    : List.of();
            transitSelections.add(new EasyTransitSelection(selectedTransit, walkSelections));
        }
        return new EasyWalkPlan(fastPlan, transitSelections);
    }

    boolean hasEligibleSelectedWalk(FastPlan fastPlan) {
        return fastPlan != null && fastPlan.stops().stream().anyMatch(this::isEligibleSelectedWalk);
    }

    private boolean isEligibleSelectedWalk(PlannedStop stop) {
        RouteOption route = stop == null ? null : stop.incomingRoute();
        return route != null
                && route.mode() == RouteMode.WALK
                && route.durationSeconds() != null
                && route.durationSeconds() > 0
                && route.durationSeconds() <= MAX_EASY_WALK_DURATION_SECONDS
                && stop.selectedTransitRoute() != null;
    }

    private WalkSelection selectWalk(
            TransitWalkSegment segment,
            Map<LineStringGeometry, ElevationProfileService.ProfileResult> profilesByGeometry) {
        ElevationProfileService.ProfileResult originalProfile = profileOriginal(segment, profilesByGeometry);
        List<Candidate> candidates = new ArrayList<>();
        for (PedestrianSearchOption option : PedestrianSearchOption.values()) {
            try {
                RouteOption route = routeProviderClient.findWalkingVariant(
                        segment.start(), segment.end(), option);
                if (isViable(route)) {
                    LineStringGeometry geometry = geometry(route);
                    ElevationProfileService.ProfileResult profile = profilesByGeometry.computeIfAbsent(
                            geometry, elevationProfileService::profile);
                    candidates.add(new Candidate(option, route, profile));
                }
            } catch (RouteProviderException exception) {
                // A provider-declared unavailable variant does not invalidate its siblings.
            }
        }
        if (candidates.isEmpty()) {
            if (originalProfile.isAvailable()) {
                return originalSelection(segment, originalProfile);
            }
            return new WalkSelection(
                    segment,
                    null,
                    null,
                    originalProfile,
                    ElevationProfileService.ProfileResult.unavailable(),
                    WalkSelectionStatus.TRANSIT_FALLBACK);
        }
        List<Candidate> profiledCandidates = candidates.stream()
                .filter(candidate -> candidate.profile().isAvailable())
                .toList();
        boolean hasProfiledCandidate = !profiledCandidates.isEmpty();
        Comparator<Candidate> comparator = hasProfiledCandidate
                ? Comparator
                        .comparingDouble((Candidate candidate) ->
                                candidate.profile().steepUphillDistanceMeters())
                        .thenComparingDouble(candidate -> candidate.profile().ascentMeters())
                        .thenComparingInt(candidate -> candidate.route().durationSeconds())
                        .thenComparingInt(candidate -> walkingDistance(candidate.route()))
                        .thenComparingInt(candidate -> candidate.option().stableOrder())
                : Comparator
                        .comparingInt((Candidate candidate) -> candidate.route().durationSeconds())
                        .thenComparingInt(candidate -> walkingDistance(candidate.route()))
                        .thenComparingInt(candidate -> candidate.option().stableOrder());
        Candidate selected = (hasProfiledCandidate ? profiledCandidates : candidates).stream()
                .min(comparator)
                .orElseThrow();
        if (originalProfile.isAvailable()
                && (!hasProfiledCandidate || originalIsNoWorse(segment, originalProfile, selected))) {
            return originalSelection(segment, originalProfile);
        }
        WalkSelectionStatus status = hasProfiledCandidate
                ? WalkSelectionStatus.PROFILED
                : WalkSelectionStatus.DEM_FALLBACK;
        ElevationProfileService.ProfileResult selectedProfile = hasProfiledCandidate
                ? selected.profile()
                : ElevationProfileService.ProfileResult.unavailable();
        return new WalkSelection(
                segment,
                selected.route(),
                selected.option(),
                originalProfile,
                selectedProfile,
                status);
    }

    private static WalkSelection originalSelection(
            TransitWalkSegment segment,
            ElevationProfileService.ProfileResult originalProfile) {
        return new WalkSelection(
                segment,
                null,
                null,
                originalProfile,
                originalProfile,
                WalkSelectionStatus.PROFILED);
    }

    private static boolean originalIsNoWorse(
            TransitWalkSegment segment,
            ElevationProfileService.ProfileResult originalProfile,
            Candidate selected) {
        int comparison = Double.compare(
                originalProfile.steepUphillDistanceMeters(),
                selected.profile().steepUphillDistanceMeters());
        if (comparison != 0) return comparison < 0;
        comparison = Double.compare(
                originalProfile.ascentMeters(),
                selected.profile().ascentMeters());
        if (comparison != 0) return comparison < 0;
        comparison = Integer.compare(segment.durationSeconds(), selected.route().durationSeconds());
        if (comparison != 0) return comparison <= 0;
        return segment.distanceMeters() <= walkingDistance(selected.route());
    }

    private ElevationProfileService.ProfileResult profileOriginal(
            TransitWalkSegment segment,
            Map<LineStringGeometry, ElevationProfileService.ProfileResult> profilesByGeometry) {
        if (segment.geometry().isEmpty()) return ElevationProfileService.ProfileResult.unavailable();
        LineStringGeometry geometry = new LineStringGeometry(segment.geometry().stream()
                .map(point -> List.of(point.longitude(), point.latitude()))
                .toList());
        return profilesByGeometry.computeIfAbsent(geometry, elevationProfileService::profile);
    }

    private static boolean isViable(RouteOption route) {
        return route != null
                && route.mode() == RouteMode.WALK
                && route.status() == RouteStatus.AVAILABLE
                && route.durationSeconds() != null
                && route.durationSeconds() > 0
                && walkingDistance(route) != null
                && walkingDistance(route) >= 0
                && geometry(route) != null;
    }

    private static Integer walkingDistance(RouteOption route) {
        return route.walkDistanceMeters() != null
                ? route.walkDistanceMeters()
                : route.distanceMeters();
    }

    private static LineStringGeometry geometry(RouteOption route) {
        return route.legs().stream()
                .filter(leg -> leg.mode() == RouteMode.WALK)
                .map(RouteLeg::geometry)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    public enum WalkSelectionStatus {
        PROFILED,
        DEM_FALLBACK,
        TRANSIT_FALLBACK
    }

    public record EasyWalkPlan(FastPlan fastPlan, List<EasyTransitSelection> transitSelections) {

        public EasyWalkPlan {
            fastPlan = Objects.requireNonNull(fastPlan);
            transitSelections = transitSelections == null
                    ? List.of()
                    : List.copyOf(transitSelections);
        }
    }

    public record EasyTransitSelection(
            SelectedTransitRoute selectedTransitRoute,
            List<WalkSelection> walkSelections) {

        public EasyTransitSelection {
            selectedTransitRoute = Objects.requireNonNull(selectedTransitRoute);
            walkSelections = walkSelections == null ? List.of() : List.copyOf(walkSelections);
        }
    }

    public record WalkSelection(
            TransitWalkSegment originalSegment,
            RouteOption selectedWalkingRoute,
            PedestrianSearchOption selectedOption,
            ElevationProfileService.ProfileResult originalElevationProfile,
            ElevationProfileService.ProfileResult elevationProfile,
            WalkSelectionStatus status) {
    }

    private record Candidate(
            PedestrianSearchOption option,
            RouteOption route,
            ElevationProfileService.ProfileResult profile) {
    }
}
