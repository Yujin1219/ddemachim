package com.ddemachim.server.domain.place.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.place.dto.PlaceTrendResponse;
import com.ddemachim.server.domain.place.dto.PlaceTrendSummaryResponse;
import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import com.ddemachim.server.domain.place.exception.InvalidPlaceTrendLimitException;
import com.ddemachim.server.domain.place.service.PlaceQueryService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import java.time.LocalDate;
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
class PlaceControllerTest {

    @Mock
    private PlaceQueryService placeQueryService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new PlaceController(placeQueryService))
                .setControllerAdvice(new ExceptionAdvice())
                .build();
    }

    @Test
    void getTrends_returnsStatusAndUpdatedAtOnlyInsideCommonSuccessEnvelope() throws Exception {
        PlaceTrendResponse trend = new PlaceTrendResponse(
                PlaceTrendStatus.TRENDING,
                LocalDate.of(2026, 8, 13));
        PlaceTrendSummaryResponse response = new PlaceTrendSummaryResponse(
                152L,
                "콘웨이커피 안국점",
                "종로구",
                "카페",
                null,
                trend);
        when(placeQueryService.getTrends(6)).thenReturn(List.of(response));

        mockMvc.perform(get("/api/places/trends").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.result[0].placeId").value(152))
                .andExpect(jsonPath("$.result[0].name").value("콘웨이커피 안국점"))
                .andExpect(jsonPath("$.result[0].district").value("종로구"))
                .andExpect(jsonPath("$.result[0].categoryLabel").value("카페"))
                .andExpect(jsonPath("$.result[0].imageUrl").doesNotExist())
                .andExpect(jsonPath("$.result[0].trend.status").value("TRENDING"))
                .andExpect(jsonPath("$.result[0].trend.summary").doesNotExist())
                .andExpect(jsonPath("$.result[0].trend.keywords").doesNotExist())
                .andExpect(jsonPath("$.result[0].trend.updatedAt").value("2026-08-13"));

        verify(placeQueryService).getTrends(6);
    }

    @Test
    void getTrends_passesExplicitLimitToService() throws Exception {
        when(placeQueryService.getTrends(20)).thenReturn(List.of());

        mockMvc.perform(get("/api/places/trends").param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.result").isEmpty());

        verify(placeQueryService).getTrends(20);
    }

    @Test
    void getTrends_returnsTypedBadRequestForInvalidLimit() throws Exception {
        when(placeQueryService.getTrends(21)).thenThrow(new InvalidPlaceTrendLimitException());

        mockMvc.perform(get("/api/places/trends").param("limit", "21"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("PLACE4003"))
                .andExpect(jsonPath("$.result").doesNotExist());
    }
}
