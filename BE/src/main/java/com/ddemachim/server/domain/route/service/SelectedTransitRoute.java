package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import java.util.List;
import java.util.Objects;

public record SelectedTransitRoute(RouteOption option, List<TransitWalkSegment> walkSegments) {

    public SelectedTransitRoute {
        option = Objects.requireNonNull(option);
        walkSegments = walkSegments == null ? List.of() : List.copyOf(walkSegments);
    }
}
