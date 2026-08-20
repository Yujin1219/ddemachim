package com.ddemachim.server.domain.aiguide.service;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;

public interface AiGuideLlmClient {

    LlmReply complete(AiGuideRequest request);

    record LlmReply(String answer, String responseId) {
    }
}
