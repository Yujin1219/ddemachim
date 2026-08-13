package com.ddemachim.server.domain.placesearch.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "카카오 장소 검색 결과")
public record KakaoPlaceSearchResponse(
        @Schema(description = "카카오 장소 ID", example = "27560651") String providerPlaceId,
        @Schema(description = "장소명", example = "경복궁") String name,
        @Schema(description = "카카오 전체 카테고리명", example = "여행 > 관광,명소 > 궁궐") String categoryName,
        @Schema(description = "카카오 카테고리 그룹 코드", example = "AT4") String categoryGroupCode,
        @Schema(description = "도로명 주소", example = "서울 종로구 사직로 161") String roadAddress,
        @Schema(description = "지번 주소", example = "서울 종로구 세종로 1-1") String lotAddress,
        @Schema(description = "경도", example = "126.976896737645") Double longitude,
        @Schema(description = "위도", example = "37.5776087830657") Double latitude,
        @Schema(description = "기준 좌표로부터의 거리(미터)", example = "321", nullable = true) Integer distanceMeters,
        @Schema(description = "전화번호", example = "02-3700-3900") String phone,
        @Schema(description = "카카오 장소 상세 URL") String placeUrl) {}
