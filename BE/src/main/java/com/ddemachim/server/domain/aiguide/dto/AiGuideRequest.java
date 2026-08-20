package com.ddemachim.server.domain.aiguide.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public record AiGuideRequest(
        @Schema(description = "사용자가 보낸 자연어 질문", example = "안국에서 조용한 카페를 추천해줘")
        @NotBlank(message = "메시지는 필수입니다.")
        @Size(max = 4_000, message = "메시지는 4,000자 이하여야 합니다.")
        String message,
        @Schema(description = "선택적인 최근 대화 이력. 서버에 저장하지 않으며 최대 12개입니다.")
        @Valid
        @Size(max = 12, message = "대화 이력은 최대 12개까지 보낼 수 있습니다.")
        List<HistoryMessage> history,
        @Schema(description = "브라우저가 권한을 받아 제공한 현재 위치. 없으면 주변 검색에서 좌표를 추측하지 않습니다.")
        @Valid
        CurrentLocation currentLocation,
        @Schema(description = "직전 OpenAI 응답 ID. Tool 결과를 포함한 연속 대화에 사용합니다.")
        @Size(max = 200, message = "이전 응답 ID는 200자 이하여야 합니다.")
        String previousResponseId) {

    public AiGuideRequest(String message, List<HistoryMessage> history) {
        this(message, history, null, null);
    }

    public AiGuideRequest(String message, List<HistoryMessage> history, CurrentLocation currentLocation) {
        this(message, history, currentLocation, null);
    }

    public List<HistoryMessage> safeHistory() {
        return history == null ? List.of() : history;
    }

    public record HistoryMessage(
            @Schema(description = "발화자", example = "USER")
            Role role,
            @Schema(description = "발화 내용")
            @NotBlank(message = "대화 내용은 비어 있을 수 없습니다.")
            @Size(max = 4_000, message = "대화 내용은 4,000자 이하여야 합니다.")
            String content) {
    }

    public enum Role {
        USER,
        ASSISTANT
    }

    public record CurrentLocation(
            @jakarta.validation.constraints.DecimalMin("-90.0")
            @jakarta.validation.constraints.DecimalMax("90.0") Double latitude,
            @jakarta.validation.constraints.DecimalMin("-180.0")
            @jakarta.validation.constraints.DecimalMax("180.0") Double longitude) {
    }
}
