package com.ddemachim.server.domain.crowding.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;

public final class CrowdingRequest {

    private CrowdingRequest() {
    }

    @Schema(description = "좌표 일괄 혼잡도 조회 요청")
    public record Points(
            @Schema(
                    description = "조회 기준 시각. 생략하면 현재 시각을 사용합니다.",
                    example = "2026-08-18T14:17:00+09:00")
            OffsetDateTime at,
            @NotEmpty(message = "조회할 좌표가 필요합니다.")
            @Valid
            @Schema(description = "조회 좌표 목록")
            List<@Valid Point> points) {
    }

    @Schema(description = "참조 ID를 보존하는 조회 좌표")
    public record Point(
            @NotBlank(message = "referenceId는 필수입니다.")
            @Size(max = 200, message = "referenceId는 200자 이하여야 합니다.")
            @Schema(description = "클라이언트 참조 ID", example = "place:101")
            String referenceId,
            @NotNull(message = "위도는 필수입니다.")
            @DecimalMin(value = "-90.0", message = "위도는 -90 이상이어야 합니다.")
            @DecimalMax(value = "90.0", message = "위도는 90 이하여야 합니다.")
            @Schema(description = "위도", example = "37.5759")
            Double latitude,
            @NotNull(message = "경도는 필수입니다.")
            @DecimalMin(value = "-180.0", message = "경도는 -180 이상이어야 합니다.")
            @DecimalMax(value = "180.0", message = "경도는 180 이하여야 합니다.")
            @Schema(description = "경도", example = "126.9768")
            Double longitude) {
    }
}
