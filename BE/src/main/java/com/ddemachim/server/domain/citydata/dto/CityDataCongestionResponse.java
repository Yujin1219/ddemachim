package com.ddemachim.server.domain.citydata.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import java.util.List;

@Schema(description = "종로구 주요장소 혼잡도 캐시 응답")
public record CityDataCongestionResponse(
        @Schema(description = "마지막 성공 갱신 시각", example = "2026-08-12T15:35:00")
        LocalDateTime updatedAt,
        @Schema(description = "마지막 성공 갱신이 지연되었거나 아직 성공 갱신이 없는지 여부", example = "false")
        boolean stale,
        @Schema(description = "종로구와 겹치는 서울시 주요장소 혼잡도 목록")
        List<Area> areas
) {

    @Schema(description = "주요장소 혼잡도")
    public record Area(
            @Schema(description = "서울시 주요장소 코드", example = "POI078")
            String areaCode,
            @Schema(description = "서울시 주요장소명", example = "인사동")
            String areaName,
            @Schema(description = "서울시 주요장소 분류", example = "발달상권")
            String category,
            @Schema(description = "현재 혼잡도", example = "보통")
            String congestionLevel,
            @Schema(description = "혼잡도 안내 문구")
            String congestionMessage,
            @Schema(description = "현재 인구 지표 최소값", example = "12000")
            Integer populationMin,
            @Schema(description = "현재 인구 지표 최대값", example = "14000")
            Integer populationMax,
            @Schema(description = "서울시 인구 데이터 기준 시각", example = "2026-08-12T15:30:00")
            LocalDateTime populationTime
    ) {
    }
}
