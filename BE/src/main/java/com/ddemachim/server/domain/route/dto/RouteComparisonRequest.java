package com.ddemachim.server.domain.route.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public record RouteComparisonRequest(
        @NotNull @Valid Coordinate origin,
        @NotNull @Valid Coordinate destination) {

    public record Coordinate(
            @DecimalMin("-90.0") @DecimalMax("90.0") double latitude,
            @DecimalMin("-180.0") @DecimalMax("180.0") double longitude) {
    }
}
