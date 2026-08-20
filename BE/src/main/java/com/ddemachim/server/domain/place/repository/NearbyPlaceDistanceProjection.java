package com.ddemachim.server.domain.place.repository;

public interface NearbyPlaceDistanceProjection {
    Long getPlaceId();

    Double getDistanceMeters();
}
