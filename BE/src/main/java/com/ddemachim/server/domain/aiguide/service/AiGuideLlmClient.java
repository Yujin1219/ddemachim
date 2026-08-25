package com.ddemachim.server.domain.aiguide.service;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;
import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import java.util.List;

public interface AiGuideLlmClient {

    LlmReply complete(AiGuideRequest request);

    record LlmReply(
            String answer,
            String responseId,
            List<Long> recommendedPlaceIds,
            AiCourseRequest courseProposal) {
        LlmReply(String answer, String responseId) {
            this(answer, responseId, List.of(), null);
        }

        LlmReply(String answer, String responseId, List<Long> recommendedPlaceIds) {
            this(answer, responseId, recommendedPlaceIds, null);
        }
    }
}
