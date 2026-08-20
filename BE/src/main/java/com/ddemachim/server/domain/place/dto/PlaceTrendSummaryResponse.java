package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.Place;
import io.swagger.v3.oas.annotations.media.Schema;

/** 장소 트렌드 목록에서 사용하는 장소와 공개 트렌드의 조합. */
public record PlaceTrendSummaryResponse(
        @Schema(description = "장소 id", example = "152") Long placeId,
        @Schema(description = "장소명", example = "콘웨이커피 안국점") String name,
        @Schema(description = "자치구", example = "종로구") String district,
        @Schema(description = "카테고리 표시명", example = "카페") String categoryLabel,
        @Schema(description = "위도 (WGS84, 장소 위치의 Y 좌표)", example = "37.5711") Double latitude,
        @Schema(description = "경도 (WGS84, 장소 위치의 X 좌표)", example = "126.9856") Double longitude,
        @Schema(description = "대표 이미지 URL") String imageUrl,
        PlaceTrendResponse trend) {

    public static PlaceTrendSummaryResponse of(Place place, PlaceTrendResponse trend) {
        Double latitude = place.getLocation() != null ? place.getLocation().getY() : null;
        Double longitude = place.getLocation() != null ? place.getLocation().getX() : null;

        return new PlaceTrendSummaryResponse(
                place.getId(),
                place.getName(),
                place.getDistrict(),
                place.getCategory() != null ? place.getCategory().getLabelKo() : null,
                latitude,
                longitude,
                place.getImageUrl(),
                trend);
    }
}
