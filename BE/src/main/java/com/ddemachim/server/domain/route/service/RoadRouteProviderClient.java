package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import java.util.List;

public interface RoadRouteProviderClient {

    RouteOption findWalking(Coordinate origin, Coordinate destination);

    default RouteOption findWalkingVariant(
            Coordinate origin,
            Coordinate destination,
            PedestrianSearchOption searchOption) {
        return findWalking(origin, destination);
    }

    RouteOption findTransit(Coordinate origin, Coordinate destination);

    default SelectedTransitRoute findSelectedTransit(Coordinate origin, Coordinate destination) {
        return new SelectedTransitRoute(findTransit(origin, destination), List.of());
    }

    RouteOption findTaxi(Coordinate origin, Coordinate destination);
}
