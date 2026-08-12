package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

@Schema(description = "코스 장바구니 장소 항목")
public record CourseBasketItemResponse(
        @Schema(description = "장바구니 항목 id", example = "12") Long id,
        @Schema(description = "장소 id", example = "40") Long placeId,
        @Schema(description = "장소명", example = "운현궁") String placeName,
        @Schema(description = "담은 시각") OffsetDateTime createdAt) {

    public static CourseBasketItemResponse from(CourseBasketItem item) {
        return new CourseBasketItemResponse(
                item.getId(), item.getPlace().getId(), item.getPlace().getName(), item.getCreatedAt());
    }
}
