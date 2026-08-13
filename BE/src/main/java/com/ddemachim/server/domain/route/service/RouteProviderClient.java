package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;

public interface RouteProviderClient {

    RouteOption findWalking(Coordinate origin, Coordinate destination);

    RouteOption findTransit(Coordinate origin, Coordinate destination);

    RouteOption findTaxi(Coordinate origin, Coordinate destination);
}
