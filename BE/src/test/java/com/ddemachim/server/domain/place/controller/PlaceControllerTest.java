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
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
    void getTrends_returnsFinalTrendMetricsInsideCommonSuccessEnvelope() throws Exception {
        OffsetDateTime measuredAt = OffsetDateTime.of(2026, 8, 13, 9, 0, 0, 0, ZoneOffset.ofHours(9));
        PlaceTrendResponse trend = new PlaceTrendResponse(
                PlaceTrendStatus.TRENDING,
                72.5,
                65.0,
                11.538,
                measuredAt);
        PlaceTrendSummaryResponse response = new PlaceTrendSummaryResponse(
                152L,
                "콘웨이커피 안국점",
                "종로구",
                "카페",
                37.5711,
                126.9856,
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
                .andExpect(jsonPath("$.result[0].latitude").value(37.5711))
                .andExpect(jsonPath("$.result[0].longitude").value(126.9856))
                .andExpect(jsonPath("$.result[0].imageUrl").doesNotExist())
                .andExpect(jsonPath("$.result[0].trend.status").value("TRENDING"))
                .andExpect(jsonPath("$.result[0].trend.recentInterestAverage").value(72.5))
                .andExpect(jsonPath("$.result[0].trend.previousInterestAverage").value(65.0))
                .andExpect(jsonPath("$.result[0].trend.interestChangePercent").value(11.538))
                .andExpect(jsonPath("$.result[0].trend.measuredAt").value("2026-08-13T09:00:00+09:00"))
                .andExpect(jsonPath("$.result[0].trend.updatedAt").value("2026-08-13"));

        verify(placeQueryService).getTrends(6);
    }

    @Test
    void getTrends_passesExplicitLimitToService() throws Exception {
        when(placeQueryService.getTrends(50)).thenReturn(List.of());

        mockMvc.perform(get("/api/places/trends").param("limit", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.result").isEmpty());

        verify(placeQueryService).getTrends(50);
    }

    @Test
    void getTrends_returnsTypedBadRequestForInvalidLimit() throws Exception {
        when(placeQueryService.getTrends(51)).thenThrow(new InvalidPlaceTrendLimitException());

        mockMvc.perform(get("/api/places/trends").param("limit", "51"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("PLACE4003"))
                .andExpect(jsonPath("$.result").doesNotExist());
    }
}
