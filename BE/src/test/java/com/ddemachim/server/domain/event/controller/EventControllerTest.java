package com.ddemachim.server.domain.event.controller;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.event.dto.EventDetailResponse;
import com.ddemachim.server.domain.event.dto.EventSummaryResponse;
import com.ddemachim.server.domain.event.exception.EventNotFoundException;
import com.ddemachim.server.domain.event.service.EventQueryService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class EventControllerTest {

    @Mock
    private EventQueryService eventQueryService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new EventController(eventQueryService))
                .setControllerAdvice(new ExceptionAdvice())
                .setCustomArgumentResolvers(new PageableHandlerMethodArgumentResolver())
                .build();
    }

    @Test
    void getEvents_returnsSummaryDecisionFieldsInsideCommonSuccessEnvelope() throws Exception {
        Pageable pageable = PageRequest.of(0, 10);
        EventSummaryResponse summary = new EventSummaryResponse(
                42L,
                "서울 전시",
                "EXHIBITION",
                LocalDate.of(2026, 8, 12),
                LocalDate.of(2026, 8, 31),
                "서울시립미술관",
                "https://example.com/event.jpg",
                37.5667,
                126.9784,
                7L,
                "서울시립미술관",
                "무료",
                LocalDate.of(2026, 8, 10),
                "10:00-18:00");
        when(eventQueryService.findEvents(null, pageable))
                .thenReturn(new PageImpl<>(List.of(summary), pageable, 1));

        mockMvc.perform(get("/api/events").param("page", "0").param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.result.content[0].useFee").value("무료"))
                .andExpect(jsonPath("$.result.content[0].applyDate").value("2026-08-10"))
                .andExpect(jsonPath("$.result.content[0].eventTime").value("10:00-18:00"));
    }

    @Test
    void getEvent_returnsDetailInsideCommonSuccessEnvelope() throws Exception {
        EventDetailResponse detail = new EventDetailResponse(
                42L,
                "서울 전시",
                "EXHIBITION",
                LocalDate.of(2026, 8, 12),
                LocalDate.of(2026, 8, 31),
                "서울시립미술관",
                "https://example.com/event.jpg",
                37.5667,
                126.9784,
                7L,
                "서울시립미술관",
                "서울시",
                "누구나",
                "무료",
                "02-000-0000",
                "https://example.com",
                LocalDate.of(2026, 8, 10),
                "10:00-18:00",
                "https://example.com/detail");
        when(eventQueryService.findEvent(42L)).thenReturn(detail);

        mockMvc.perform(get("/api/events/{id}", 42L))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.code").value("COMMON200"))
                .andExpect(jsonPath("$.message").value("성공입니다."))
                .andExpect(jsonPath("$.result.id").value(42))
                .andExpect(jsonPath("$.result.title").value("서울 전시"))
                .andExpect(jsonPath("$.result.placeId").value(7))
                .andExpect(jsonPath("$.result.placeName").value("서울시립미술관"))
                .andExpect(jsonPath("$.result.orgName").value("서울시"))
                .andExpect(jsonPath("$.result.useFee").value("무료"))
                .andExpect(jsonPath("$.result.detailUrl").value("https://example.com/detail"));
    }

    @Test
    void getEvent_returnsCommonNotFoundEnvelopeWhenEventDoesNotExist() throws Exception {
        when(eventQueryService.findEvent(404L)).thenThrow(new EventNotFoundException());

        mockMvc.perform(get("/api/events/{id}", 404L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("EVENT4041"))
                .andExpect(jsonPath("$.message").value("찾을 수 없는 행사입니다."))
                .andExpect(jsonPath("$.result").doesNotExist());
    }
}
