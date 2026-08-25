package com.ddemachim.server.domain.aiguide.service;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;
import com.ddemachim.server.domain.aiguide.dto.AiGuideResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AiGuideService {

    private final AiGuideLlmClient llmClient;

    public AiGuideResponse chat(AiGuideRequest request) {
        AiGuideLlmClient.LlmReply reply = llmClient.complete(request);
        return new AiGuideResponse(
                reply.answer(), reply.responseId(), reply.recommendedPlaceIds(), reply.courseProposal());
    }
}
