package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.PlaceTrendSnapshot;
import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

/** 공개 가능한 장소 트렌드 정보. 내부 점수와 원천 증거는 포함하지 않는다. */
public record PlaceTrendResponse(
        @Schema(description = "사용자에게 노출할 트렌드 상태", example = "TRENDING")
        PlaceTrendStatus status,
        @Schema(description = "트렌드 스냅샷 관찰일", example = "2026-08-13")
        LocalDate updatedAt) {

    public static PlaceTrendResponse from(PlaceTrendSnapshot snapshot) {
        return new PlaceTrendResponse(snapshot.getStatus(), snapshot.getSnapshotDate());
    }
}
