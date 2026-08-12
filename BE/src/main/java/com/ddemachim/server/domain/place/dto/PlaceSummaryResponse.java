package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.Place;
import java.util.List;

/** 장소 목록 조회용 응답. */
public record PlaceSummaryResponse(
        Long id,
        String name,
        String categoryCode,
        String categoryLabel,
        String roadAddress,
        String district,
        Double latitude,
        Double longitude,
        String phone,
        String[] tags,
        List<String> filmingContentTypes,
        String thumbnailUrl) {

    public static PlaceSummaryResponse of(
            Place place, List<String> filmingContentTypes, String thumbnailUrl) {
        Double latitude = place.getLocation() != null ? place.getLocation().getY() : null;
        Double longitude = place.getLocation() != null ? place.getLocation().getX() : null;

        return new PlaceSummaryResponse(
                place.getId(),
                place.getName(),
                place.getCategory() != null ? place.getCategory().getCode() : null,
                place.getCategory() != null ? place.getCategory().getLabelKo() : null,
                place.getRoadAddress(),
                place.getDistrict(),
                latitude,
                longitude,
                place.getPhone(),
                place.getTags(),
                filmingContentTypes,
                thumbnailUrl);
    }
}
