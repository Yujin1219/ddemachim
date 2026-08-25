package com.ddemachim.server.domain.course.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "카카오 장소 코스 장바구니 등록 요청")
public record AddKakaoPlaceRequest(
        @Schema(description = "카카오 장소 ID", example = "27560651", requiredMode = Schema.RequiredMode.REQUIRED)
                @NotBlank
                @Size(max = 100)
                @Pattern(regexp = "[0-9]+")
                String providerPlaceId,
        @Schema(description = "장소명", example = "경복궁", requiredMode = Schema.RequiredMode.REQUIRED)
                @NotBlank
                @Size(max = 200)
                String name,
        @Schema(description = "카카오 전체 카테고리명", example = "여행 > 관광,명소 > 궁궐")
                @Size(max = 300)
                String categoryName,
        @Schema(description = "카카오 카테고리 그룹 코드", example = "AT4") @Size(max = 20)
                String categoryGroupCode,
        @Schema(description = "도로명 주소", example = "서울 종로구 사직로 161") @Size(max = 500)
                String roadAddress,
        @Schema(description = "지번 주소", example = "서울 종로구 세종로 1-1") @Size(max = 500)
                String lotAddress,
        @Schema(description = "경도", example = "126.976896737645", requiredMode = Schema.RequiredMode.REQUIRED)
                @NotNull
                @DecimalMin("-180.0")
                @DecimalMax("180.0")
                Double longitude,
        @Schema(description = "위도", example = "37.5776087830657", requiredMode = Schema.RequiredMode.REQUIRED)
                @NotNull
                @DecimalMin("-90.0")
                @DecimalMax("90.0")
                Double latitude,
        @Schema(description = "전화번호", example = "02-3700-3900") @Size(max = 50) String phone,
        @Schema(description = "선택 맥락의 대표 이미지 URL") @Size(max = 2048) String imageUrl) {}
