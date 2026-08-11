package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.Place;

/** 지도 마커 표시용 장소 응답. */
public record PlaceMapResponse(
        Long id,
        String name,
        Double latitude,
        Double longitude,
        String[] tags) {

    public static PlaceMapResponse from(Place place) {
        Double latitude = place.getLocation() != null ? place.getLocation().getY() : null;
        Double longitude = place.getLocation() != null ? place.getLocation().getX() : null;

        return new PlaceMapResponse(
                place.getId(),
                place.getName(),
                latitude,
                longitude,
                place.getTags());
    }
}
