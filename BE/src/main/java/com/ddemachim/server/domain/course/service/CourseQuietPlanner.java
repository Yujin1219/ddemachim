package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.enums.CourseCongestionLevel;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.domain.route.service.CourseRouteProviderClient;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CourseQuietPlanner {

    private static final Duration ARRIVAL_DEADLINE_BUFFER = Duration.ofMinutes(10);

    private final CourseRouteProviderClient routeProviderClient;
    private final CourseCongestionForecastProvider congestionForecastProvider;

    public CourseQuietPlanner(
            CourseRouteProviderClient routeProviderClient,
            CourseCongestionForecastProvider congestionForecastProvider) {
        this.routeProviderClient = routeProviderClient;
        this.congestionForecastProvider = congestionForecastProvider;
    }

    public QuietPlan plan(CoursePreviewRequest request, List<ResolvedPlace> resolvedPlaces) {
        if (resolvedPlaces == null || resolvedPlaces.isEmpty()) {
            throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        }
        LocalDateTime start = request.serviceDate().atTime(request.desiredStartTime());
        LocalDateTime currentTime = start;
        Coordinate currentCoordinate = new Coordinate(request.start().latitude(), request.start().longitude());
        List<ResolvedPlace> remaining = new ArrayList<>(resolvedPlaces);
        List<PlannedQuietStop> stops = new ArrayList<>();
        long totalTravelSeconds = 0;

        while (!remaining.isEmpty()) {
            Candidate selected = null;
            for (ResolvedPlace place : remaining) {
                RouteOption route = findQuietRoute(
                        currentCoordinate, new Coordinate(place.latitude(), place.longitude()));
                Candidate candidate = feasibleCandidate(request, currentTime, place, route);
                if (candidate != null && (selected == null || candidate.costSeconds() < selected.costSeconds())) {
                    selected = candidate;
                }
            }
            if (selected == null) {
                throw new CourseException(CourseErrorStatus.FAST_PLAN_UNAVAILABLE);
            }
            stops.add(new PlannedQuietStop(
                    stops.size() + 1,
                    selected.place(),
                    selected.effectiveArrival(),
                    selected.departure(),
                    selected.route(),
                    selected.congestionLevel()));
            totalTravelSeconds += selected.route().durationSeconds();
            currentTime = selected.departure();
            currentCoordinate = new Coordinate(selected.place().latitude(), selected.place().longitude());
            remaining.remove(selected.place());
        }
        return new QuietPlan(
                CourseRouteStrategy.QUIET,
                start,
                currentTime,
                Duration.between(start, currentTime).toSeconds(),
                totalTravelSeconds,
                stops);
    }

    private RouteOption findQuietRoute(Coordinate origin, Coordinate destination) {
        try {
            RouteOption transit = routeProviderClient.findTransit(origin, destination);
            if (transit != null && transit.status() == RouteStatus.AVAILABLE) {
                return transit;
            }
        } catch (RouteProviderException exception) {
            // Keep the quiet alternative available when a transit lookup is unavailable.
        }
        try {
            return routeProviderClient.findWalking(origin, destination);
        } catch (RouteProviderException exception) {
            return null;
        }
    }

    CourseCongestionLevel forecast(ResolvedPlace place, LocalDateTime expectedArrival) {
        CourseCongestionLevel level = congestionForecastProvider.forecast(place, expectedArrival);
        return level == null ? CourseCongestionLevel.NORMAL : level;
    }

    private Candidate feasibleCandidate(
            CoursePreviewRequest request,
            LocalDateTime currentTime,
            ResolvedPlace place,
            RouteOption route) {
        if (place.closed() || route == null || route.status() != RouteStatus.AVAILABLE
                || route.durationSeconds() == null || route.durationSeconds() <= 0) {
            return null;
        }
        LocalDateTime arrival = currentTime.plusSeconds(route.durationSeconds());
        if (place.openTime() != null) {
            LocalDateTime opening = request.serviceDate().atTime(place.openTime());
            if (arrival.isBefore(opening)) {
                arrival = opening;
            }
        }
        if (place.arrivalDeadline() != null) {
            LocalDateTime latestArrival = request.serviceDate().atTime(place.arrivalDeadline())
                    .minus(ARRIVAL_DEADLINE_BUFFER);
            if (arrival.isAfter(latestArrival)) return null;
        }
        LocalDateTime departure = arrival.plusMinutes(place.dwellMinutes());
        if (request.availableMinutes() != null
                && departure.isAfter(request.serviceDate().atTime(request.desiredStartTime())
                .plusMinutes(request.availableMinutes()))) {
            return null;
        }
        if (place.closeTime() != null
                && departure.isAfter(request.serviceDate().atTime(place.closeTime()))) {
            return null;
        }
        CourseCongestionLevel level = forecast(place, arrival);
        long costSeconds = route.durationSeconds() + level.penaltyMinutes() * 60L;
        return new Candidate(place, route, arrival, departure, level, costSeconds);
    }

    public record QuietPlan(
            CourseRouteStrategy strategy,
            LocalDateTime scheduledStart,
            LocalDateTime scheduledEnd,
            long totalElapsedSeconds,
            long totalTravelSeconds,
            List<PlannedQuietStop> stops) {
        public QuietPlan {
            stops = stops == null ? List.of() : List.copyOf(stops);
        }
    }

    public record PlannedQuietStop(
            int sequence,
            ResolvedPlace resolvedPlace,
            LocalDateTime effectiveArrival,
            LocalDateTime departure,
            RouteOption incomingRoute,
            CourseCongestionLevel congestionLevel) {
    }

    private record Candidate(
            ResolvedPlace place,
            RouteOption route,
            LocalDateTime effectiveArrival,
            LocalDateTime departure,
            CourseCongestionLevel congestionLevel,
            long costSeconds) {
    }
}
