package com.ddemachim.server.domain.aiguide.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import java.util.List;

public record AiGuideResponse(
        @Schema(description = "OpenAI Responses API가 생성한 최종 한국어 답변")
        String answer,
        @Schema(description = "외부 응답 식별자. 대화 저장에는 사용하지 않습니다.", nullable = true)
        String responseId,
        @Schema(description = "AI가 MCP 검색으로 확인한 추천 장소 ID 목록", nullable = true)
        List<Long> recommendedPlaceIds,
        @Schema(description = "사용자 확인을 기다리는 구조화된 AI 코스 조건", nullable = true)
        AiCourseRequest courseProposal) {

    public AiGuideResponse(String answer, String responseId, List<Long> recommendedPlaceIds) {
        this(answer, responseId, recommendedPlaceIds, null);
    }
}
