package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.PlaceTrendResult;
import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/** 공개 가능한 장소 트렌드 정보. 내부 점수와 원천 증거는 포함하지 않는다. */
public record PlaceTrendResponse(
        @Schema(description = "사용자에게 노출할 트렌드 상태", example = "TRENDING")
        PlaceTrendStatus status,
        @Schema(description = "최근 Search Trend 평균", example = "72.5", nullable = true)
        Double recentInterestAverage,
        @Schema(description = "이전 Search Trend 평균", example = "65.0", nullable = true)
        Double previousInterestAverage,
        @Schema(description = "최근 평균과 이전 평균의 변화율(%)", example = "11.538", nullable = true)
        Double interestChangePercent,
        @Schema(description = "Search Trend 측정 시각", example = "2026-08-13T09:00:00+09:00")
        OffsetDateTime measuredAt,
        @Schema(description = "기존 클라이언트 호환용 측정일(Asia/Seoul 기준)", example = "2026-08-13")
        LocalDate updatedAt) {

    private static final ZoneId SEOUL_ZONE = ZoneId.of("Asia/Seoul");

    public PlaceTrendResponse(
            PlaceTrendStatus status,
            Double recentInterestAverage,
            Double previousInterestAverage,
            Double interestChangePercent,
            OffsetDateTime measuredAt) {
        this(
                status,
                recentInterestAverage,
                previousInterestAverage,
                interestChangePercent,
                measuredAt,
                toSeoulDate(measuredAt));
    }

    public static PlaceTrendResponse from(PlaceTrendResult result) {
        return new PlaceTrendResponse(
                result.getStatus(),
                result.getRecentInterestAverage(),
                result.getPreviousInterestAverage(),
                result.getInterestChangePercent(),
                result.getMeasuredAt());
    }

    private static LocalDate toSeoulDate(OffsetDateTime measuredAt) {
        return measuredAt == null ? null : measuredAt.atZoneSameInstant(SEOUL_ZONE).toLocalDate();
    }
}
