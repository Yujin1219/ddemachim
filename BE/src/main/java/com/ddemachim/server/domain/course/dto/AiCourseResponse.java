package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.route.enums.RouteMode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record AiCourseResponse(
        LocalDate date,
        LocalTime requestedStartTime,
        LocalTime scheduledEnd,
        Integer totalDurationMinutes,
        Integer totalTravelMinutes,
        CourseRouteStrategy appliedStrategy,
        List<Long> requiredPlaceIds,
        List<Long> excludedCandidatePlaceIds,
        List<Stop> stops,
        CoursePreviewResponse preview) {

    public record Stop(
            Integer sequence,
            Long placeId,
            String name,
            LocalTime arrivalTime,
            LocalTime departureTime,
            Integer stayMinutes,
            Integer travelMinutesFromPrevious,
            Integer travelDistanceMeters,
            BigDecimal congestionScore,
            BigDecimal ascentMeters,
            RouteMode travelMode) {}
}
