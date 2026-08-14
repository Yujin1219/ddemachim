package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.Place;
import io.swagger.v3.oas.annotations.media.Schema;

/** 장소 트렌드 목록에서 사용하는 장소와 공개 트렌드의 조합. */
public record PlaceTrendSummaryResponse(
        @Schema(description = "장소 id", example = "152") Long placeId,
        @Schema(description = "장소명", example = "콘웨이커피 안국점") String name,
        @Schema(description = "자치구", example = "종로구") String district,
        @Schema(description = "카테고리 표시명", example = "카페") String categoryLabel,
        @Schema(description = "대표 이미지 URL") String imageUrl,
        PlaceTrendResponse trend) {

    public static PlaceTrendSummaryResponse of(Place place, PlaceTrendResponse trend) {
        return new PlaceTrendSummaryResponse(
                place.getId(),
                place.getName(),
                place.getDistrict(),
                place.getCategory() != null ? place.getCategory().getLabelKo() : null,
                place.getImageUrl(),
                trend);
    }
}
