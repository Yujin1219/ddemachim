package com.ddemachim.server.domain.media.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.media.dto.FilmingLocationResponse;
import com.ddemachim.server.domain.media.dto.MediaContentSummaryResponse;
import com.ddemachim.server.domain.media.service.MediaQueryService;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class FilmingLocationDetailControllerTest {

    @Mock
    private MediaQueryService mediaQueryService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new FilmingLocationDetailController(mediaQueryService)).build();
    }

    @Test
    void getDetail_returnsWorkPlaceAndSceneDescriptionInsideTheSuccessEnvelope() throws Exception {
        MediaContentSummaryResponse media = new MediaContentSummaryResponse(
                274L, 12345, "tv", "키스 식스 센스", "/poster.jpg", LocalDate.of(2022, 5, 25));
        FilmingLocationResponse response = new FilmingLocationResponse(
                834L,
                970L,
                "경희궁3길",
                "DRAMA",
                media,
                "두 주인공이 데이트를 마치고 골목을 함께 걷는 장면",
                "AUTO_MATCH",
                BigDecimal.valueOf(0.987));
        when(mediaQueryService.getFilmingLocation(834L)).thenReturn(response);

        mockMvc.perform(get("/api/filming-locations/{id}", 834L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.result.id").value(834))
                .andExpect(jsonPath("$.result.placeName").value("경희궁3길"))
                .andExpect(jsonPath("$.result.mediaContent.id").value(274))
                .andExpect(jsonPath("$.result.mediaContent.title").value("키스 식스 센스"))
                .andExpect(jsonPath("$.result.mediaContent.releaseDate").value("2022-05-25"))
                .andExpect(jsonPath("$.result.sceneDescription")
                        .value("두 주인공이 데이트를 마치고 골목을 함께 걷는 장면"));
    }
}
