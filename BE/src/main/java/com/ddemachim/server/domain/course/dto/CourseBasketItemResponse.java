package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import com.ddemachim.server.domain.course.enums.CourseBasketItemSource;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.UserPlace;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

@Schema(description = "코스 장바구니 장소 항목")
public record CourseBasketItemResponse(
        @Schema(description = "장바구니 항목 id", example = "12") Long id,
        @Schema(description = "때마침 장소 id. 카카오 장소인 경우 null", example = "40") Long placeId,
        @Schema(description = "장소명", example = "운현궁") String placeName,
        @Schema(description = "장소 출처", example = "DDEMACHIM") CourseBasketItemSource source,
        @Schema(description = "회원 장소 id. 때마침 장소인 경우 null", example = "50") Long userPlaceId,
        @Schema(description = "외부 제공자 장소 ID", example = "27560651") String providerPlaceId,
        @Schema(description = "카테고리명", example = "여행 > 관광,명소 > 궁궐") String categoryName,
        @Schema(description = "도로명 주소", example = "서울 종로구 사직로 161") String roadAddress,
        @Schema(description = "지번 주소", example = "서울 종로구 세종로 1-1") String lotAddress,
        @Schema(description = "경도", example = "126.976896737645") Double longitude,
        @Schema(description = "위도", example = "37.5776087830657") Double latitude,
        @Schema(description = "전화번호", example = "02-3700-3900") String phone,
        @Schema(description = "장소 상세 URL", example = "https://place.map.kakao.com/27560651") String placeUrl,
        @Schema(description = "담은 시각") OffsetDateTime createdAt) {

    public static CourseBasketItemResponse from(CourseBasketItem item) {
        if (item.getPlace() != null) {
            return fromPlace(item, item.getPlace());
        }
        if (item.getUserPlace() != null) {
            return fromUserPlace(item, item.getUserPlace());
        }
        throw new IllegalStateException("장바구니 항목에 장소가 없습니다.");
    }

    private static CourseBasketItemResponse fromPlace(CourseBasketItem item, Place place) {
        Double longitude = place.getLocation() != null ? place.getLocation().getX() : null;
        Double latitude = place.getLocation() != null ? place.getLocation().getY() : null;
        return new CourseBasketItemResponse(
                item.getId(),
                place.getId(),
                place.getName(),
                CourseBasketItemSource.DDEMACHIM,
                null,
                null,
                place.getCategory() != null ? place.getCategory().getLabelKo() : null,
                place.getRoadAddress(),
                place.getLotAddress(),
                longitude,
                latitude,
                place.getPhone(),
                place.getWebsite(),
                item.getCreatedAt());
    }

    private static CourseBasketItemResponse fromUserPlace(CourseBasketItem item, UserPlace userPlace) {
        return new CourseBasketItemResponse(
                item.getId(),
                null,
                userPlace.getName(),
                CourseBasketItemSource.KAKAO,
                userPlace.getId(),
                userPlace.getProviderPlaceId(),
                userPlace.getCategoryName(),
                userPlace.getRoadAddress(),
                userPlace.getLotAddress(),
                userPlace.getLongitude(),
                userPlace.getLatitude(),
                userPlace.getPhone(),
                userPlace.getPlaceUrl(),
                item.getCreatedAt());
    }
}
