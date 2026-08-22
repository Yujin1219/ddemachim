package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.enums.CourseStatus;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record CourseSummaryResponse(
        Long id,
        String title,
        CourseStatus status,
        LocalDate serviceDate,
        LocalTime scheduledStart,
        LocalTime scheduledEnd,
        Integer stopCount,
        Integer totalDurationMinutes,
        String firstPlaceName,
        String firstPlaceImageUrl,
        List<RouteCoordinate> routeCoordinates) {

    public record RouteCoordinate(Double longitude, Double latitude) {}
}
