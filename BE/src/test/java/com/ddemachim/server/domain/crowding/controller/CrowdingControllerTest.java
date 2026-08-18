package com.ddemachim.server.domain.crowding.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.enums.CrowdingLevel;
import com.ddemachim.server.domain.crowding.exception.CrowdingErrorStatus;
import com.ddemachim.server.domain.crowding.exception.CrowdingException;
import com.ddemachim.server.domain.crowding.service.CrowdingService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class CrowdingControllerTest {

    private static final OffsetDateTime SLOT_START =
            OffsetDateTime.parse("2026-08-18T14:00:00+09:00");
    private static final OffsetDateTime SLOT_END = SLOT_START.plusMinutes(30);

    @Mock
    private CrowdingService crowdingService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new CrowdingController(crowdingService))
                .setControllerAdvice(new ExceptionAdvice())
                .build();
    }

    @Test
    void gridsReturnCommonEnvelopeKoreanLabelAndLongitudeLatitudeCoordinates() throws Exception {
        when(crowdingService.getViewportGrids(
                        37.57,
                        37.58,
                        126.97,
                        126.98,
                        OffsetDateTime.parse("2026-08-18T14:17:00+09:00")))
                .thenReturn(List.of(new CrowdingResponse.Grid(
                        "G-100-100",
                        List.of(List.of(
                                List.of(126.97, 37.57),
                                List.of(126.98, 37.57),
                                List.of(126.98, 37.58),
                                List.of(126.97, 37.58),
                                List.of(126.97, 37.57))),
                        37.575,
                        126.975,
                        76,
                        CrowdingLevel.VERY_CROWDED,
                        "붐빔",
                        true,
                        SLOT_START,
                        SLOT_END)));

        mockMvc.perform(get("/api/v1/crowding/grids")
                        .param("minLat", "37.57")
                        .param("maxLat", "37.58")
                        .param("minLng", "126.97")
                        .param("maxLng", "126.98")
                        .param("at", "2026-08-18T14:17:00+09:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.code").value("COMMON200"))
                .andExpect(jsonPath("$.result[0].gridCode").value("G-100-100"))
                .andExpect(jsonPath("$.result[0].coordinates[0][0][0]").value(126.97))
                .andExpect(jsonPath("$.result[0].coordinates[0][0][1]").value(37.57))
                .andExpect(jsonPath("$.result[0].score").value(76))
                .andExpect(jsonPath("$.result[0].level").value("VERY_CROWDED"))
                .andExpect(jsonPath("$.result[0].levelLabel").value("붐빔"))
                .andExpect(jsonPath("$.result[0].mock").value(true))
                .andExpect(jsonPath("$.result[0].slotStart").value("2026-08-18T14:00:00+09:00"))
                .andExpect(jsonPath("$.result[0].slotEnd").value("2026-08-18T14:30:00+09:00"));
    }

    @Test
    void pointsPreserveReferencesAndOmitFabricatedFieldsWhenUncovered() throws Exception {
        when(crowdingService.getPointCrowding(any())).thenReturn(List.of(
                new CrowdingResponse.Point(
                        "place:101",
                        true,
                        "G-100-100",
                        25,
                        CrowdingLevel.RELAXED,
                        "여유",
                        true,
                        SLOT_START,
                        SLOT_END),
                new CrowdingResponse.Point(
                        "place:outside",
                        false,
                        null,
                        null,
                        null,
                        null,
                        true,
                        SLOT_START,
                        SLOT_END)));

        mockMvc.perform(post("/api/v1/crowding/points")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "at": "2026-08-18T14:17:00+09:00",
                                  "points": [
                                    {"referenceId":"place:101","latitude":37.575,"longitude":126.975},
                                    {"referenceId":"place:outside","latitude":37.7,"longitude":127.2}
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.result[0].referenceId").value("place:101"))
                .andExpect(jsonPath("$.result[0].covered").value(true))
                .andExpect(jsonPath("$.result[0].gridCode").value("G-100-100"))
                .andExpect(jsonPath("$.result[0].levelLabel").value("여유"))
                .andExpect(jsonPath("$.result[0].mock").value(true))
                .andExpect(jsonPath("$.result[1].referenceId").value("place:outside"))
                .andExpect(jsonPath("$.result[1].covered").value(false))
                .andExpect(jsonPath("$.result[1].score").doesNotExist())
                .andExpect(jsonPath("$.result[1].level").doesNotExist())
                .andExpect(jsonPath("$.result[1].mock").value(true))
                .andExpect(jsonPath("$.result[1].slotStart").value("2026-08-18T14:00:00+09:00"))
                .andExpect(jsonPath("$.result[1].slotEnd").value("2026-08-18T14:30:00+09:00"));
    }

    @Test
    void invalidPointBodyReturnsTypedBadRequestBeforeService() throws Exception {
        mockMvc.perform(post("/api/v1/crowding/points")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "points": [
                                    {"referenceId":"place:101","latitude":91,"longitude":126.975}
                                  ]
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("CROWDING4003"));

        verifyNoInteractions(crowdingService);
    }

    @Test
    void invalidBoundsReturnTypedBadRequestEnvelope() throws Exception {
        when(crowdingService.getViewportGrids(
                        37.60,
                        37.50,
                        126.90,
                        127.10,
                        null))
                .thenThrow(new CrowdingException(CrowdingErrorStatus.INVALID_BOUNDS));

        mockMvc.perform(get("/api/v1/crowding/grids")
                        .param("minLat", "37.60")
                        .param("maxLat", "37.50")
                        .param("minLng", "126.90")
                        .param("maxLng", "127.10"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("CROWDING4001"));
    }
}
