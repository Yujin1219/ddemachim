package com.ddemachim.server.domain.aiguide.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.aiguide.dto.AiGuideResponse;
import com.ddemachim.server.domain.aiguide.service.AiGuideService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class AiGuideControllerTest {

    @Mock
    private AiGuideService aiGuideService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new AiGuideController(aiGuideService))
                .setControllerAdvice(new ExceptionAdvice())
                .build();
    }

    @Test
    void chats_returnsCommonEnvelopeWithoutForwardingBearerHeader() throws Exception {
        when(aiGuideService.chat(any()))
                .thenReturn(new AiGuideResponse("안국 카페를 찾아볼게요.", "resp_1"));

        mockMvc.perform(post("/api/v1/ai-guide/chats")
                        .header("Authorization", "Bearer user-jwt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"안국에서 카페를 추천해줘\",\"history\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.code").value("COMMON200"))
                .andExpect(jsonPath("$.result.answer").value("안국 카페를 찾아볼게요."))
                .andExpect(jsonPath("$.result.responseId").value("resp_1"));

        verify(aiGuideService).chat(any());
    }

    @Test
    void chats_rejectsBlankMessageBeforeCallingService() throws Exception {
        mockMvc.perform(post("/api/v1/ai-guide/chats")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON400"));

        verifyNoInteractions(aiGuideService);
    }
}
