package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import java.util.List;

/** TMAP-backed route contract used by course planning, including detailed transit walk legs. */
public interface CourseRouteProviderClient extends RoadRouteProviderClient {

    RouteOption findTransit(Coordinate origin, Coordinate destination);

    default SelectedTransitRoute findSelectedTransit(Coordinate origin, Coordinate destination) {
        return new SelectedTransitRoute(findTransit(origin, destination), List.of());
    }
}
