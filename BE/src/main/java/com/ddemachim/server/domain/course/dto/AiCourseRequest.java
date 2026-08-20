package com.ddemachim.server.domain.course.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record AiCourseRequest(
        LocalDate date,
        LocalTime startTime,
        StartLocation startLocation,
        Integer availableMinutes,
        List<Long> requiredPlaceIds,
        List<Long> candidatePlaceIds,
        RoutePreference routePreference,
        SchedulePreference schedulePreference) {

    public record StartLocation(Double latitude, Double longitude, String name) {}

    public enum RoutePreference { FAST, COMFORT }

    public enum SchedulePreference { RELAXED, BALANCED }
}
