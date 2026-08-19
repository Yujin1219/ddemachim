package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import java.util.List;
import java.util.Objects;

public record TransitWalkSegment(
        int walkOrdinal,
        int legIndex,
        Coordinate start,
        Coordinate end,
        int durationSeconds,
        int distanceMeters,
        List<Coordinate> geometry) {

    public TransitWalkSegment {
        start = Objects.requireNonNull(start);
        end = Objects.requireNonNull(end);
        geometry = geometry == null ? List.of() : List.copyOf(geometry);
    }
}
