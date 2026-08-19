package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.Place;
import java.util.List;

/** 기존 상세 API 형태를 유지하면서 Place의 대표 이미지 컬럼을 노출한다. */
public record PlaceImageResponse(Long id, String source, String sourceUrl, String attribution) {

    public static List<PlaceImageResponse> from(Place place) {
        if (place.getImageUrl() == null || place.getImageUrl().isBlank()) {
            return List.of();
        }
        return List.of(new PlaceImageResponse(
                place.getId(),
                place.getImageSource(),
                place.getImageUrl(),
                place.getImageAttribution()));
    }
}
