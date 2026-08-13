package com.ddemachim.server.domain.route.dto;

import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import java.time.Instant;
import java.util.List;

public record RouteComparisonResponse(Instant generatedAt, List<RouteOption> routes) {

    public RouteComparisonResponse {
        routes = routes == null ? List.of() : List.copyOf(routes);
    }

    public record RouteOption(
            RouteMode mode,
            RouteStatus status,
            Integer durationSeconds,
            Integer distanceMeters,
            Integer fareWon,
            Integer transferCount,
            Integer walkDistanceMeters,
            RouteUnavailableReason unavailableReason,
            List<RouteLeg> legs) {

        public RouteOption {
            legs = legs == null ? List.of() : List.copyOf(legs);
        }

        public static RouteOption unavailable(RouteMode mode, RouteUnavailableReason reason) {
            return new RouteOption(
                    mode,
                    RouteStatus.UNAVAILABLE,
                    null,
                    null,
                    null,
                    null,
                    null,
                    reason,
                    List.of());
        }
    }

    public record RouteLeg(
            RouteMode mode,
            String routeName,
            Integer durationSeconds,
            Integer distanceMeters,
            LineStringGeometry geometry) {
    }

    public record LineStringGeometry(String type, List<List<Double>> coordinates) {

        public LineStringGeometry(List<List<Double>> coordinates) {
            this("LineString", coordinates);
        }

        public LineStringGeometry {
            type = type == null || type.isBlank() ? "LineString" : type;
            coordinates = coordinates == null
                    ? List.of()
                    : coordinates.stream().map(List::copyOf).toList();
        }
    }
}
