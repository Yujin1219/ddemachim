package com.ddemachim.server.domain.aiguide.service;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;
import java.util.List;

public interface AiGuideLlmClient {

    LlmReply complete(AiGuideRequest request);

    record LlmReply(String answer, String responseId, List<Long> recommendedPlaceIds) {
        LlmReply(String answer, String responseId) {
            this(answer, responseId, List.of());
        }
    }
}
