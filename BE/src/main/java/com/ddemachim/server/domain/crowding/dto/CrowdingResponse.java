package com.ddemachim.server.domain.crowding.dto;

import com.ddemachim.server.domain.crowding.enums.CrowdingLevel;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;

public final class CrowdingResponse {

    private CrowdingResponse() {
    }

    @Schema(description = "viewport 혼잡도 격자")
    public record Grid(
            @Schema(description = "고정 격자 코드", example = "G-3950-11120")
            String gridCode,
            @Schema(
                    description = "GeoJSON Polygon 좌표. 각 좌표는 [경도, 위도] 순서입니다.")
            List<List<List<Double>>> coordinates,
            @Schema(description = "격자 중심 위도", example = "37.5759")
            double centerLatitude,
            @Schema(description = "격자 중심 경도", example = "126.9768")
            double centerLongitude,
            @Schema(description = "MOCK 혼잡도 점수", example = "76")
            int score,
            @Schema(description = "혼잡도 단계", example = "VERY_CROWDED")
            CrowdingLevel level,
            @Schema(description = "혼잡도 한글 라벨", example = "붐빔")
            String levelLabel,
            @Schema(description = "시뮬레이션 값 여부", example = "true")
            boolean mock,
            @Schema(description = "30분 슬롯 시작")
            OffsetDateTime slotStart,
            @Schema(description = "30분 슬롯 종료")
            OffsetDateTime slotEnd) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(description = "좌표별 혼잡도 결과")
    public record Point(
            @Schema(description = "요청에서 받은 참조 ID", example = "place:101")
            String referenceId,
            @Schema(description = "Jongno 격자 포함 여부", example = "true")
            boolean covered,
            @Schema(description = "고정 격자 코드", example = "G-3950-11120")
            String gridCode,
            @Schema(description = "MOCK 혼잡도 점수", example = "42")
            Integer score,
            @Schema(description = "혼잡도 단계", example = "NORMAL")
            CrowdingLevel level,
            @Schema(description = "혼잡도 한글 라벨", example = "보통")
            String levelLabel,
            @Schema(description = "시뮬레이션 값 여부", example = "true")
            Boolean mock,
            @Schema(description = "30분 슬롯 시작")
            OffsetDateTime slotStart,
            @Schema(description = "30분 슬롯 종료")
            OffsetDateTime slotEnd) {
    }
}
