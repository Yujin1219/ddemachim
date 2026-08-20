package com.ddemachim.server.domain.aiguide.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AiGuideServiceTest {

    @Mock
    private AiGuideLlmClient llmClient;

    @Test
    void chat_forwardsHistoryWithoutForwardingUserAuthorization() {
        AiGuideRequest request = new AiGuideRequest(
                "조용한 카페를 알려줘",
                List.of(new AiGuideRequest.HistoryMessage(AiGuideRequest.Role.USER, "안국에 갈 거야")));
        when(llmClient.complete(eq(request)))
                .thenReturn(new AiGuideLlmClient.LlmReply("북촌의 조용한 카페를 찾아볼게요.", "resp_123"));

        var response = new AiGuideService(llmClient).chat(request);

        assertThat(response.answer()).contains("북촌");
        assertThat(response.responseId()).isEqualTo("resp_123");
        verify(llmClient).complete(request);
    }
}
