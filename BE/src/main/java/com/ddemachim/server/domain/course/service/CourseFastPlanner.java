package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.domain.route.service.RouteProviderClient;
import com.ddemachim.server.domain.route.service.SelectedTransitRoute;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CourseFastPlanner {

    private static final Duration ARRIVAL_DEADLINE_BUFFER = Duration.ofMinutes(10);

    private final RouteProviderClient routeProviderClient;

    public CourseFastPlanner(RouteProviderClient routeProviderClient) {
        this.routeProviderClient = routeProviderClient;
    }

    public FastPlan plan(CoursePreviewRequest request, List<ResolvedPlace> resolvedPlaces) {
        if (resolvedPlaces == null || resolvedPlaces.isEmpty()) {
            throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        }

        LocalDateTime scheduledStart = request.serviceDate().atTime(request.desiredStartTime());
        LocalDateTime desiredEnd = request.serviceDate().atTime(request.desiredEndTime());
        LocalDateTime currentTime = scheduledStart;
        Coordinate currentCoordinate = new Coordinate(
                request.start().latitude(), request.start().longitude());
        List<ResolvedPlace> remaining = new ArrayList<>(resolvedPlaces);
        List<PlannedStop> stops = new ArrayList<>();
        long totalTravelSeconds = 0L;

        while (!remaining.isEmpty()) {
            Candidate selected = null;
            for (ResolvedPlace place : remaining) {
                SelectedTransitRoute selectedTransit;
                try {
                    selectedTransit = routeProviderClient.findSelectedTransit(
                            currentCoordinate,
                            new Coordinate(place.latitude(), place.longitude()));
                } catch (RouteProviderException exception) {
                    continue;
                }

                Candidate candidate = feasibleCandidate(
                        request, desiredEnd, currentTime, place, selectedTransit);
                if (candidate != null
                        && (selected == null
                        || candidate.route().durationSeconds() < selected.route().durationSeconds())) {
                    selected = candidate;
                }
            }

            if (selected == null) {
                throw new CourseException(CourseErrorStatus.FAST_PLAN_UNAVAILABLE);
            }

            ResolvedPlace selectedPlace = selected.place();
            stops.add(new PlannedStop(
                    stops.size() + 1,
                    selectedPlace,
                    selected.effectiveArrival(),
                    selected.departure(),
                    selected.route(),
                    selected.selectedTransit()));
            totalTravelSeconds += selected.route().durationSeconds();
            currentTime = selected.departure();
            currentCoordinate = new Coordinate(selectedPlace.latitude(), selectedPlace.longitude());
            remaining.remove(selectedPlace);
        }

        return new FastPlan(
                CourseRouteStrategy.FAST,
                scheduledStart,
                currentTime,
                Duration.between(scheduledStart, currentTime).toSeconds(),
                totalTravelSeconds,
                stops);
    }

    private Candidate feasibleCandidate(
            CoursePreviewRequest request,
            LocalDateTime desiredEnd,
            LocalDateTime currentTime,
            ResolvedPlace place,
            SelectedTransitRoute selectedTransit) {
        RouteOption route = selectedTransit == null ? null : selectedTransit.option();
        if (place.closed()
                || route == null
                || route.status() != RouteStatus.AVAILABLE
                || route.durationSeconds() == null
                || route.durationSeconds() <= 0) {
            return null;
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
                return null;
            }
        }

        LocalDateTime departure = effectiveArrival.plusMinutes(place.dwellMinutes());
        if (place.closeTime() != null
                && departure.isAfter(request.serviceDate().atTime(place.closeTime()))) {
            return null;
        }
        if (departure.isAfter(desiredEnd)) {
            return null;
        }
        return new Candidate(place, selectedTransit, effectiveArrival, departure);
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
            SelectedTransitRoute selectedTransitRoute) {

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
                    new SelectedTransitRoute(incomingRoute, List.of()));
        }
    }

    private record Candidate(
            ResolvedPlace place,
            SelectedTransitRoute selectedTransit,
            LocalDateTime effectiveArrival,
            LocalDateTime departure) {

        private RouteOption route() {
            return selectedTransit.option();
        }
    }
}
