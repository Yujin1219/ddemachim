package com.ddemachim.server.domain.aiguide.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record AiGuideResponse(
        @Schema(description = "OpenAI Responses API가 생성한 최종 한국어 답변")
        String answer,
        @Schema(description = "외부 응답 식별자. 대화 저장에는 사용하지 않습니다.", nullable = true)
        String responseId) {
}
