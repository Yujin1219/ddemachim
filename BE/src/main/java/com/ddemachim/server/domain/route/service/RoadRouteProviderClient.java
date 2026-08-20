package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;

public interface RoadRouteProviderClient {

    RouteOption findWalking(Coordinate origin, Coordinate destination);

    default RouteOption findWalkingVariant(
            Coordinate origin,
            Coordinate destination,
            PedestrianSearchOption searchOption) {
        return findWalking(origin, destination);
    }

    RouteOption findTaxi(Coordinate origin, Coordinate destination);
}
