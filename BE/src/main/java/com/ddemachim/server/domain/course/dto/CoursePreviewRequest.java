package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Schema(description = "코스 미리보기 생성 요청")
@JsonIgnoreProperties({"desiredEndTime"})
public record CoursePreviewRequest(
        @Schema(description = "코스를 진행할 날짜", example = "2026-08-18", requiredMode = Schema.RequiredMode.REQUIRED)
                @NotNull(message = "코스 날짜는 필수입니다.")
                LocalDate serviceDate,
        @Schema(description = "출발 희망 시각", example = "10:00", requiredMode = Schema.RequiredMode.REQUIRED)
                @NotNull(message = "출발 희망 시각은 필수입니다.")
                LocalTime desiredStartTime,
        @Schema(description = "검색 또는 현재 위치로 확정된 출발점", requiredMode = Schema.RequiredMode.REQUIRED)
                @NotNull(message = "출발 위치는 필수입니다.")
                @Valid
                Start start,
        @Schema(description = "코스에 포함할 장바구니 장소와 사용자 설정", requiredMode = Schema.RequiredMode.REQUIRED)
                @NotEmpty(message = "코스에 포함할 장소가 한 개 이상 필요합니다.")
                @Size(max = 5, message = "코스에 포함할 장소는 최대 5개입니다.")
                List<@NotNull @Valid Place> places,
        @Schema(description = "AI 코스에서만 사용하는 최대 이용 가능 시간(분)", nullable = true)
                @Min(value = 30, message = "사용 가능 시간은 30분 이상이어야 합니다.")
                @Max(value = 1440, message = "사용 가능 시간은 1440분 이하여야 합니다.")
                Integer availableMinutes) {

    public CoursePreviewRequest(LocalDate serviceDate, LocalTime desiredStartTime, Start start, List<Place> places) {
        this(serviceDate, desiredStartTime, start, places, null);
    }

    @AssertTrue(message = "같은 장바구니 장소를 중복해서 요청할 수 없습니다.")
    @Schema(hidden = true)
    public boolean isBasketItemIdsUnique() {
        if (places == null) {
            return true;
        }

        Set<Long> basketItemIds = new HashSet<>();
        for (Place place : places) {
            if (place != null
                    && place.basketItemId() != null
                    && !basketItemIds.add(place.basketItemId())) {
                return false;
            }
        }
        return true;
    }

    @Schema(description = "코스 출발점")
    public record Start(
            @Schema(description = "출발점 설정 방식", example = "CURRENT_LOCATION", requiredMode = Schema.RequiredMode.REQUIRED)
                    @NotNull(message = "출발점 설정 방식은 필수입니다.")
                    CourseStartType type,
            @Schema(description = "출발점 표시명", example = "안국역 1번 출구")
                    @Size(max = 200, message = "출발점 표시명은 200자 이하여야 합니다.")
                    String name,
            @Schema(description = "위도", example = "37.5764", requiredMode = Schema.RequiredMode.REQUIRED)
                    @NotNull(message = "출발점 위도는 필수입니다.")
                    @DecimalMin(value = "-90.0", message = "위도는 -90 이상이어야 합니다.")
                    @DecimalMax(value = "90.0", message = "위도는 90 이하여야 합니다.")
                    Double latitude,
            @Schema(description = "경도", example = "126.9850", requiredMode = Schema.RequiredMode.REQUIRED)
                    @NotNull(message = "출발점 경도는 필수입니다.")
                    @DecimalMin(value = "-180.0", message = "경도는 -180 이상이어야 합니다.")
                    @DecimalMax(value = "180.0", message = "경도는 180 이하여야 합니다.")
                    Double longitude) {

        @AssertTrue(message = "검색한 장소를 출발점으로 사용할 때는 표시명이 필요합니다.")
        @Schema(hidden = true)
        public boolean isSearchedPlaceNameValid() {
            return type == null
                    || type != CourseStartType.SEARCHED_PLACE
                    || (name != null && !name.isBlank());
        }
    }

    @Schema(description = "코스에 포함할 장소별 설정")
    public record Place(
            @Schema(description = "코스 장바구니 항목 ID", example = "1", requiredMode = Schema.RequiredMode.REQUIRED)
                    @NotNull(message = "장바구니 항목 ID는 필수입니다.")
                    @Positive(message = "장바구니 항목 ID는 양수여야 합니다.")
                    Long basketItemId,
            @Schema(description = "사용자가 확정한 체류시간(분)", example = "60", requiredMode = Schema.RequiredMode.REQUIRED)
                    @NotNull(message = "체류시간은 필수입니다.")
                    @Min(value = 1, message = "체류시간은 1분 이상이어야 합니다.")
                    @Max(value = 1440, message = "체류시간은 1440분 이하여야 합니다.")
                    Integer dwellMinutes,
            @Schema(description = "해당 장소에 도착해야 하는 최종 시각. 제한이 없으면 생략", example = "15:00")
                    LocalTime arrivalDeadline) {
    }
}
