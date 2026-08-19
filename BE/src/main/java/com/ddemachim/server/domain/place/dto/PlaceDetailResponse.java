package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.Place;
import java.util.List;

/** 장소 상세 조회용 응답. */
public record PlaceDetailResponse(
        Long id,
        String name,
        String categoryCode,
        String categoryLabel,
        String roadAddress,
        String lotAddress,
        String district,
        String neighborhood,
        Double latitude,
        Double longitude,
        String phone,
        String website,
        String description,
        String operatingHoursRaw,
        String operatingDaysRaw,
        String closedDaysRaw,
        String transitInfo,
        String accessibility,
        String[] tags,
        List<PlaceOperatingHoursResponse> operatingHours,
        String imageUrl,
        String imageSource,
        String imageAttribution,
        PlaceTrendResponse trend) {

    public static PlaceDetailResponse of(
            Place place,
            List<PlaceOperatingHoursResponse> operatingHours) {
        Double latitude = place.getLocation() != null ? place.getLocation().getY() : null;
        Double longitude = place.getLocation() != null ? place.getLocation().getX() : null;

        return new PlaceDetailResponse(
                place.getId(),
                place.getName(),
                place.getCategory() != null ? place.getCategory().getCode() : null,
                place.getCategory() != null ? place.getCategory().getLabelKo() : null,
                place.getRoadAddress(),
                place.getLotAddress(),
                place.getDistrict(),
                place.getNeighborhood(),
                latitude,
                longitude,
                place.getPhone(),
                place.getWebsite(),
                place.getDescription(),
                place.getOperatingHoursRaw(),
                place.getOperatingDaysRaw(),
                place.getClosedDaysRaw(),
                place.getTransitInfo(),
                place.getAccessibility(),
                place.getTags(),
                operatingHours,
                PlaceImageResponse.from(place));
    }
}
