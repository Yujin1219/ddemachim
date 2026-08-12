package com.ddemachim.server.domain.citydata.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.citydata.dto.CityDataCongestionResponse;
import com.ddemachim.server.domain.citydata.service.CityDataCongestionService;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class CityDataControllerTest {

    @Mock
    private CityDataCongestionService cityDataCongestionService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new CityDataController(cityDataCongestionService))
                .build();
    }

    @Test
    void getJongnoCongestion_returnsCommonSuccessEnvelope() throws Exception {
        when(cityDataCongestionService.getJongnoCongestion())
                .thenReturn(new CityDataCongestionResponse(
                        LocalDateTime.of(2026, 8, 12, 15, 35),
                        false,
                        List.of(new CityDataCongestionResponse.Area(
                                "POI078",
                                "인사동",
                                "발달상권",
                                "보통",
                                "이동에 큰 불편이 없어요.",
                                12000,
                                14000,
                                LocalDateTime.of(2026, 8, 12, 15, 30)))));

        mockMvc.perform(get("/api/citydata/congestion/jongno"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.result.stale").value(false))
                .andExpect(jsonPath("$.result.areas[0].areaCode").value("POI078"))
                .andExpect(jsonPath("$.result.areas[0].congestionLevel").value("보통"))
                .andExpect(jsonPath("$.result.areas[0].populationMin").value(12000));
    }
}
