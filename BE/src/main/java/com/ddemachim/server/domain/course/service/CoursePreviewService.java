package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.service.CourseEasyWalkSelector.EasyTransitSelection;
import com.ddemachim.server.domain.course.service.CourseEasyWalkSelector.EasyWalkPlan;
import com.ddemachim.server.domain.course.service.CourseEasyWalkSelector.WalkSelection;
import com.ddemachim.server.domain.course.service.CourseEasyWalkSelector.WalkSelectionStatus;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.FastPlan;
import com.ddemachim.server.domain.course.service.CourseFastPlanner.PlannedStop;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.course.service.CourseQuietPlanner.PlannedQuietStop;
import com.ddemachim.server.domain.course.service.CourseQuietPlanner.QuietPlan;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CoursePreviewService {

    private static final int ARRIVAL_DEADLINE_BUFFER_MINUTES = 10;

    private final CoursePreviewInputResolver inputResolver;
    private final CourseFastPlanner fastPlanner;
    private final CourseEasyWalkSelector easyWalkSelector;
    private final CourseQuietPlanner quietPlanner;
    private final Clock clock;

    @Autowired
    public CoursePreviewService(
            CoursePreviewInputResolver inputResolver,
            CourseFastPlanner fastPlanner,
            CourseEasyWalkSelector easyWalkSelector,
            CourseQuietPlanner quietPlanner) {
        this(inputResolver, fastPlanner, easyWalkSelector, quietPlanner, Clock.systemUTC());
    }

    CoursePreviewService(
            CoursePreviewInputResolver inputResolver,
            CourseFastPlanner fastPlanner,
            Clock clock) {
        this(inputResolver, fastPlanner, null, null, clock);
    }

    CoursePreviewService(
            CoursePreviewInputResolver inputResolver,
            CourseFastPlanner fastPlanner,
            CourseQuietPlanner quietPlanner,
            Clock clock) {
        this(inputResolver, fastPlanner, null, quietPlanner, clock);
    }

    CoursePreviewService(
            CoursePreviewInputResolver inputResolver,
            CourseFastPlanner fastPlanner,
            CourseEasyWalkSelector easyWalkSelector,
            CourseQuietPlanner quietPlanner,
            Clock clock) {
        this.inputResolver = inputResolver;
        this.fastPlanner = fastPlanner;
        this.easyWalkSelector = easyWalkSelector;
        this.quietPlanner = quietPlanner;
        this.clock = clock;
    }

    public CoursePreviewResponse preview(Long memberId, CoursePreviewRequest request) {
        List<ResolvedPlace> resolvedPlaces = inputResolver.resolve(
                memberId,
                request.serviceDate(),
                request.places());
        FastPlan plan = fastPlanner.plan(request, resolvedPlaces);
        List<CoursePreviewResponse.Option> options = new ArrayList<>();
        options.add(toOption(plan));
        if (easyWalkSelector != null && easyWalkSelector.hasEligibleSelectedWalk(plan)) {
            try {
                CoursePreviewResponse.Option easyOption = toOption(easyWalkSelector.select(plan));
                if (easyOption != null) {
                    options.add(easyOption);
                }
            } catch (CourseException exception) {
                if (!isOptionalPlanUnavailable(exception)) {
                    throw exception;
                }
            }
        }
        if (quietPlanner != null) {
            try {
                options.add(toOption(quietPlanner.plan(request, resolvedPlaces)));
            } catch (CourseException exception) {
                if (!isOptionalPlanUnavailable(exception)) {
                    throw exception;
                }
            }
        }
        return new CoursePreviewResponse(
                clock.instant(),
                request.serviceDate(),
                request.desiredStartTime(),
                options);
    }

    private static boolean isOptionalPlanUnavailable(CourseException exception) {
        return exception.getCode() == CourseErrorStatus.FAST_PLAN_UNAVAILABLE;
    }

    private CoursePreviewResponse.Option toOption(FastPlan plan) {
        List<CoursePreviewResponse.Stop> stops = plan.stops().stream()
                .map(stop -> quietPlanner == null ? toStop(stop) : toStopWithCongestion(stop))
                .toList();
        return new CoursePreviewResponse.Option(
                plan.strategy(),
                stops.size(),
                ceilMinutes(plan.totalElapsedSeconds()),
                ceilMinutes(plan.totalTravelSeconds()),
                aggregateDistance(stops),
                null,
                averageCongestion(stops),
                plan.scheduledStart().toLocalTime(),
                plan.scheduledEnd().toLocalTime(),
                stops);
    }

    private CoursePreviewResponse.Option toOption(EasyWalkPlan easyWalkPlan) {
        FastPlan fastPlan = easyWalkPlan.fastPlan();
        List<EasyTransitSelection> transitSelections = easyWalkPlan.transitSelections();
        List<EasyPlannedStop> easyStops = new ArrayList<>(fastPlan.stops().size());
        LocalDateTime currentTime = fastPlan.scheduledStart();
        Integer totalTravelSeconds = 0;

        for (int index = 0; index < fastPlan.stops().size(); index++) {
            PlannedStop fastStop = fastPlan.stops().get(index);
            EasyTransitSelection transitSelection = index < transitSelections.size()
                    ? transitSelections.get(index)
                    : null;
            RouteOption easyRoute = rebuildRoute(fastStop, transitSelection);
            Integer routeDurationSeconds = easyRoute == null ? null : easyRoute.durationSeconds();
            if (fastStop.incomingRoute() == null || fastStop.incomingRoute().durationSeconds() == null) {
                return null;
            }
            Integer scheduleDurationSeconds = routeDurationSeconds == null
                    || routeDurationSeconds < 0
                    ? fastStop.incomingRoute().durationSeconds()
                    : routeDurationSeconds;

            LocalDateTime effectiveArrival = currentTime.plusSeconds(scheduleDurationSeconds);
            ResolvedPlace place = fastStop.resolvedPlace();
            if (place.openTime() != null) {
                LocalDateTime opening = fastPlan.scheduledStart()
                        .toLocalDate()
                        .atTime(place.openTime());
                if (effectiveArrival.isBefore(opening)) {
                    effectiveArrival = opening;
                }
            }
            if (place.arrivalDeadline() != null
                    && effectiveArrival.isAfter(fastPlan.scheduledStart()
                    .toLocalDate()
                    .atTime(place.arrivalDeadline())
                    .minusMinutes(ARRIVAL_DEADLINE_BUFFER_MINUTES))) {
                return null;
            }
            if (place.arrivalDeadline() != null) {
                effectiveArrival = fastPlan.scheduledStart()
                        .toLocalDate()
                        .atTime(place.arrivalDeadline())
                        .minusMinutes(ARRIVAL_DEADLINE_BUFFER_MINUTES);
            }
            LocalDateTime departure = effectiveArrival.plusMinutes(place.dwellMinutes());
            if (place.closeTime() != null
                    && departure.isAfter(fastPlan.scheduledStart().toLocalDate().atTime(place.closeTime()))) {
                return null;
            }
            BigDecimal ascentMeters = ascentMeters(fastStop, transitSelection);
            easyStops.add(new EasyPlannedStop(
                    fastStop,
                    effectiveArrival,
                    departure,
                    easyRoute,
                    ascentMeters));
            totalTravelSeconds = safeAdd(totalTravelSeconds, routeDurationSeconds);
            currentTime = departure;
        }

        List<CoursePreviewResponse.Stop> stops = easyStops.stream()
                .map(this::toStop)
                .toList();
        return new CoursePreviewResponse.Option(
                CourseRouteStrategy.EASY,
                stops.size(),
                ceilMinutes(Duration.between(fastPlan.scheduledStart(), currentTime).toSeconds()),
                ceilMinutes(totalTravelSeconds),
                aggregateDistance(stops),
                aggregateAscent(stops),
                null,
                fastPlan.scheduledStart().toLocalTime(),
                currentTime.toLocalTime(),
                stops,
                elevationComparisons(fastPlan, transitSelections));
    }

    private CoursePreviewResponse.Option toOption(QuietPlan plan) {
        List<CoursePreviewResponse.Stop> stops = plan.stops().stream()
                .map(this::toStop)
                .toList();
        BigDecimal average = stops.stream()
                .map(CoursePreviewResponse.Stop::congestionScore)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(stops.size()), 2, RoundingMode.HALF_UP);
        return new CoursePreviewResponse.Option(
                plan.strategy(),
                stops.size(),
                ceilMinutes(plan.totalElapsedSeconds()),
                ceilMinutes(plan.totalTravelSeconds()),
                aggregateDistance(stops),
                null,
                average,
                plan.scheduledStart().toLocalTime(),
                plan.scheduledEnd().toLocalTime(),
                stops);
    }

    private CoursePreviewResponse.Stop toStop(PlannedStop plannedStop) {
        ResolvedPlace place = plannedStop.resolvedPlace();
        RouteOption incomingRoute = plannedStop.incomingRoute();
        return new CoursePreviewResponse.Stop(
                plannedStop.sequence(),
                place.basketItemId(),
                place.placeName(),
                place.address(),
                place.latitude(),
                place.longitude(),
                place.defaultDwellMinutes(),
                place.dwellMinutes(),
                place.dwellSource(),
                place.arrivalDeadline(),
                place.arrivalDeadline() == null ? null : ARRIVAL_DEADLINE_BUFFER_MINUTES,
                plannedStop.effectiveArrival().toLocalTime(),
                plannedStop.departure().toLocalTime(),
                incomingRoute == null ? null : ceilMinutes(incomingRoute.durationSeconds()),
                routeDistance(incomingRoute),
                null,
                null,
                place.hoursSourceType(),
                place.openTime(),
                place.closeTime(),
                null,
                null,
                incomingRoute == null ? null : incomingRoute.mode(),
                incomingRoute,
                plannedStop.alternativeRoute(),
                incomingRoute);
    }

    private CoursePreviewResponse.Stop toStopWithCongestion(PlannedStop plannedStop) {
        CoursePreviewResponse.Stop stop = toStop(plannedStop);
        var level = quietPlanner.forecast(plannedStop.resolvedPlace(), plannedStop.effectiveArrival());
        BigDecimal score = level == null ? null : BigDecimal.valueOf(level.score());
        return new CoursePreviewResponse.Stop(
                stop.sequenceNo(), stop.basketItemId(), stop.placeName(), stop.address(),
                stop.latitude(), stop.longitude(), stop.defaultDwellMinutes(), stop.dwellMinutes(),
                stop.dwellSource(), stop.arrivalDeadline(), stop.arrivalBufferMinutes(),
                stop.scheduledArrival(), stop.scheduledDeparture(), stop.travelMinutesFromPrevious(),
                stop.travelDistanceMeters(), stop.ascentMeters(), score, stop.hoursSourceType(),
                stop.openTime(), stop.closeTime(), stop.eventId(), stop.eventEndTime(), stop.selectedMode(),
                stop.selectedRoute(), stop.alternativeRoute(), stop.incomingRoute());
    }

    private CoursePreviewResponse.Stop toStop(PlannedQuietStop plannedStop) {
        ResolvedPlace place = plannedStop.resolvedPlace();
        RouteOption incomingRoute = plannedStop.incomingRoute();
        return new CoursePreviewResponse.Stop(
                plannedStop.sequence(),
                place.basketItemId(),
                place.placeName(),
                place.address(),
                place.latitude(),
                place.longitude(),
                place.defaultDwellMinutes(),
                place.dwellMinutes(),
                place.dwellSource(),
                place.arrivalDeadline(),
                place.arrivalDeadline() == null ? null : ARRIVAL_DEADLINE_BUFFER_MINUTES,
                plannedStop.effectiveArrival().toLocalTime(),
                plannedStop.departure().toLocalTime(),
                incomingRoute == null ? null : ceilMinutes(incomingRoute.durationSeconds()),
                routeDistance(incomingRoute),
                null,
                BigDecimal.valueOf(plannedStop.congestionLevel().score()),
                place.hoursSourceType(),
                place.openTime(),
                place.closeTime(),
                null,
                null,
                incomingRoute == null ? null : incomingRoute.mode(),
                incomingRoute,
                null,
                incomingRoute);
    }

    private CoursePreviewResponse.Stop toStop(EasyPlannedStop easyStop) {
        PlannedStop plannedStop = easyStop.fastStop();
        ResolvedPlace place = plannedStop.resolvedPlace();
        RouteOption incomingRoute = easyStop.incomingRoute();
        return new CoursePreviewResponse.Stop(
                plannedStop.sequence(),
                place.basketItemId(),
                place.placeName(),
                place.address(),
                place.latitude(),
                place.longitude(),
                place.defaultDwellMinutes(),
                place.dwellMinutes(),
                place.dwellSource(),
                place.arrivalDeadline(),
                place.arrivalDeadline() == null ? null : ARRIVAL_DEADLINE_BUFFER_MINUTES,
                easyStop.effectiveArrival().toLocalTime(),
                easyStop.departure().toLocalTime(),
                incomingRoute == null ? null : ceilMinutes(incomingRoute.durationSeconds()),
                routeDistance(incomingRoute),
                easyStop.ascentMeters(),
                null,
                place.hoursSourceType(),
                place.openTime(),
                place.closeTime(),
                null,
                null,
                incomingRoute == null ? null : incomingRoute.mode(),
                incomingRoute,
                plannedStop.alternativeRoute(),
                incomingRoute);
    }

    private static RouteOption rebuildRoute(
            PlannedStop fastStop, EasyTransitSelection transitSelection) {
        RouteOption originalRoute = fastStop.incomingRoute();
        if (originalRoute == null
                || transitSelection == null
                || !transitSelection.selectedTransitRoute().equals(fastStop.selectedTransitRoute())) {
            return originalRoute;
        }

        List<RouteLeg> rebuiltLegs = new ArrayList<>(originalRoute.legs());
        for (WalkSelection walkSelection : transitSelection.walkSelections()) {
            if (walkSelection == null
                    || walkSelection.status() == WalkSelectionStatus.TRANSIT_FALLBACK
                    || walkSelection.originalSegment() == null
                    || walkSelection.selectedWalkingRoute() == null) {
                continue;
            }
            int legIndex = walkSelection.originalSegment().legIndex();
            if (legIndex < 0 || legIndex >= rebuiltLegs.size()) {
                continue;
            }
            RouteLeg originalLeg = rebuiltLegs.get(legIndex);
            if (originalLeg == null || originalLeg.mode() != RouteMode.WALK) {
                continue;
            }
            RouteLeg selectedWalkLeg = selectedWalkLeg(walkSelection.selectedWalkingRoute());
            if (selectedWalkLeg == null) {
                continue;
            }
            rebuiltLegs.set(legIndex, new RouteLeg(
                    RouteMode.WALK,
                    originalLeg.routeName(),
                    selectedWalkLeg.durationSeconds(),
                    selectedWalkLeg.distanceMeters(),
                    selectedWalkLeg.geometry(),
                    selectedWalkLeg.steps()));
        }

        return new RouteOption(
                originalRoute.mode(),
                originalRoute.status(),
                sumLegDurations(rebuiltLegs),
                sumLegDistances(rebuiltLegs),
                originalRoute.fareWon(),
                originalRoute.transferCount(),
                sumWalkingDistances(rebuiltLegs),
                originalRoute.unavailableReason(),
                rebuiltLegs);
    }

    private static RouteLeg selectedWalkLeg(RouteOption selectedWalkingRoute) {
        if (selectedWalkingRoute.mode() != RouteMode.WALK) {
            return null;
        }
        return selectedWalkingRoute.legs().stream()
                .filter(leg -> leg != null && leg.mode() == RouteMode.WALK)
                .findFirst()
                .orElse(null);
    }

    private static Integer sumLegDurations(List<RouteLeg> legs) {
        return sumLegMetric(legs, false, true);
    }

    private static Integer sumLegDistances(List<RouteLeg> legs) {
        return sumLegMetric(legs, false, false);
    }

    private static Integer sumWalkingDistances(List<RouteLeg> legs) {
        return sumLegMetric(legs, true, false);
    }

    private static Integer sumLegMetric(
            List<RouteLeg> legs, boolean walkingOnly, boolean duration) {
        if (legs.isEmpty()) {
            return null;
        }
        int total = 0;
        boolean included = false;
        for (RouteLeg leg : legs) {
            if (leg == null) {
                return null;
            }
            if (walkingOnly && leg.mode() != RouteMode.WALK) {
                continue;
            }
            Integer value = duration ? leg.durationSeconds() : leg.distanceMeters();
            if (value == null || value < 0) {
                return null;
            }
            try {
                total = Math.addExact(total, value);
            } catch (ArithmeticException exception) {
                return null;
            }
            included = true;
        }
        return included ? total : walkingOnly ? 0 : null;
    }

    private static BigDecimal ascentMeters(
            PlannedStop fastStop, EasyTransitSelection transitSelection) {
        if (fastStop.selectedTransitRoute().walkSegments().isEmpty()) {
            return BigDecimal.ZERO.setScale(2);
        }
        if (transitSelection == null
                || !transitSelection.selectedTransitRoute().equals(fastStop.selectedTransitRoute())
                || transitSelection.walkSelections().size()
                != fastStop.selectedTransitRoute().walkSegments().size()) {
            return null;
        }

        BigDecimal total = BigDecimal.ZERO;
        for (WalkSelection selection : transitSelection.walkSelections()) {
            if (selection == null
                    || selection.status() != WalkSelectionStatus.PROFILED
                    || selection.elevationProfile() == null
                    || selection.elevationProfile().ascentMeters() == null
                    || !Double.isFinite(selection.elevationProfile().ascentMeters())) {
                return null;
            }
            total = total.add(BigDecimal.valueOf(selection.elevationProfile().ascentMeters()));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private static Integer safeAdd(Integer total, Integer value) {
        if (total == null || value == null || value < 0) {
            return null;
        }
        try {
            return Math.addExact(total, value);
        } catch (ArithmeticException exception) {
            return null;
        }
    }

    private static Integer routeDistance(RouteOption route) {
        if (route == null) {
            return null;
        }
        if (route.distanceMeters() != null) {
            return route.distanceMeters();
        }
        if (route.legs().isEmpty()) {
            return null;
        }

        int total = 0;
        for (RouteLeg leg : route.legs()) {
            if (leg == null || leg.distanceMeters() == null || leg.distanceMeters() < 0) {
                return null;
            }
            total = Math.addExact(total, leg.distanceMeters());
        }
        return total;
    }

    private static Integer aggregateDistance(List<CoursePreviewResponse.Stop> stops) {
        List<Integer> distances = new ArrayList<>(stops.size());
        for (CoursePreviewResponse.Stop stop : stops) {
            if (stop.travelDistanceMeters() == null) {
                return null;
            }
            distances.add(stop.travelDistanceMeters());
        }
        int total = 0;
        for (Integer distance : distances) {
            try {
                total = Math.addExact(total, distance);
            } catch (ArithmeticException exception) {
                return null;
            }
        }
        return total;
    }

    private static BigDecimal aggregateAscent(List<CoursePreviewResponse.Stop> stops) {
        BigDecimal total = BigDecimal.ZERO;
        for (CoursePreviewResponse.Stop stop : stops) {
            if (stop.ascentMeters() == null) {
                return null;
            }
            total = total.add(stop.ascentMeters());
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal averageCongestion(List<CoursePreviewResponse.Stop> stops) {
        if (stops.isEmpty() || stops.stream().anyMatch(stop -> stop.congestionScore() == null)) return null;
        return stops.stream().map(CoursePreviewResponse.Stop::congestionScore)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(stops.size()), 2, RoundingMode.HALF_UP);
    }

    private static List<CoursePreviewResponse.ElevationComparison> elevationComparisons(
            FastPlan fastPlan, List<EasyTransitSelection> selections) {
        List<CoursePreviewResponse.ElevationComparison> result = new ArrayList<>();
        for (int index = 0; index < fastPlan.stops().size(); index++) {
            PlannedStop stop = fastPlan.stops().get(index);
            EasyTransitSelection selection = index < selections.size() ? selections.get(index) : null;
            List<WalkSelection> walks = selection == null ? List.of() : selection.walkSelections();
            result.add(new CoursePreviewResponse.ElevationComparison(
                    stop.sequence(), stop.resolvedPlace().placeName(),
                    sumProfileMetric(walks, true, false), sumProfileMetric(walks, false, false),
                    sumProfileMetric(walks, true, true), sumProfileMetric(walks, false, true),
                    minimumCoverage(walks, true), minimumCoverage(walks, false)));
        }
        return List.copyOf(result);
    }

    private static BigDecimal sumProfileMetric(
            List<WalkSelection> walks, boolean original, boolean steepDistance) {
        if (walks.isEmpty()) return BigDecimal.ZERO.setScale(2);
        double total = 0.0;
        for (WalkSelection walk : walks) {
            var profile = original ? walk.originalElevationProfile() : walk.elevationProfile();
            Double value = profile == null ? null
                    : steepDistance ? profile.steepUphillDistanceMeters() : profile.ascentMeters();
            if (value == null || !Double.isFinite(value)) return null;
            total += value;
        }
        return BigDecimal.valueOf(total).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal minimumCoverage(List<WalkSelection> walks, boolean original) {
        if (walks.isEmpty()) return BigDecimal.valueOf(100).setScale(2);
        double coverage = 100.0;
        for (WalkSelection walk : walks) {
            var profile = original ? walk.originalElevationProfile() : walk.elevationProfile();
            if (profile == null || profile.coveragePercent() == null) return null;
            coverage = Math.min(coverage, profile.coveragePercent());
        }
        return BigDecimal.valueOf(coverage).setScale(2, RoundingMode.HALF_UP);
    }

    private static Integer ceilMinutes(long seconds) {
        long minutes = seconds / 60;
        if (seconds % 60 != 0) {
            minutes++;
        }
        return Math.toIntExact(minutes);
    }

    private static Integer ceilMinutes(Integer seconds) {
        return seconds == null ? null : ceilMinutes(seconds.longValue());
    }

    private record EasyPlannedStop(
            PlannedStop fastStop,
            LocalDateTime effectiveArrival,
            LocalDateTime departure,
            RouteOption incomingRoute,
            BigDecimal ascentMeters) {
    }
}
