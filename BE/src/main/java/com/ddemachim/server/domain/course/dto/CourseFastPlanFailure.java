package com.ddemachim.server.domain.course.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * Safe, request-preserving details returned with COURSE4222. Every requested stop is represented;
 * the planner never removes a place in order to manufacture a partial itinerary.
 */
@Schema(description = "빠른 코스를 만들 수 없을 때 장소별로 반환하는 조정 안내")
public record CourseFastPlanFailure(
        @Schema(description = "원래 요청한 장소 수", example = "3") Integer requestedStopCount,
        @Schema(description = "원래 요청 순서의 장소별 진단") List<StopDiagnostic> diagnostics) {

    public CourseFastPlanFailure {
        diagnostics = diagnostics == null ? List.of() : List.copyOf(diagnostics);
    }

    public record StopDiagnostic(
            @Schema(description = "요청한 장바구니 장소 ID", example = "10") Long basketItemId,
            @Schema(description = "장소명", example = "경복궁") String placeName,
            @Schema(description = "계획을 막은 대표 이유", example = "ARRIVAL_DEADLINE_EXCEEDED")
                    DiagnosticReason reason,
            @Schema(description = "장소를 삭제하지 않고 사용자가 조정할 수 있는 제안", example = "RELAX_ARRIVAL_DEADLINE")
                    AdjustmentProposal adjustmentProposal) {
    }

    public enum DiagnosticReason {
        PLACE_CLOSED,
        ROUTE_NOT_FOUND,
        ROUTE_UNAVAILABLE,
        ROUTE_PROVIDER_UNAVAILABLE,
        ROUTE_PROVIDER_NOT_CONFIGURED,
        ROUTE_PROVIDER_TIMEOUT,
        ARRIVAL_DEADLINE_EXCEEDED,
        OPERATING_HOURS_EXCEEDED,
        NO_FEASIBLE_ORDER
    }

    public enum AdjustmentProposal {
        CHANGE_SERVICE_DATE,
        RELAX_ARRIVAL_DEADLINE,
        ADJUST_VISIT_DURATION,
        CHECK_ROUTE_AVAILABILITY,
        ADJUST_START_TIME
    }
}
