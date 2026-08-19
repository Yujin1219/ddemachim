package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;

public interface TransitRouteProviderClient {

    RouteOption findTransit(Coordinate origin, Coordinate destination);
}
