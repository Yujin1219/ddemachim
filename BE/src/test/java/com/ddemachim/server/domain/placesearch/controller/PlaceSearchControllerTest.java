package com.ddemachim.server.domain.placesearch.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.placesearch.dto.KakaoPlaceSearchResponse;
import com.ddemachim.server.domain.placesearch.exception.PlaceSearchErrorStatus;
import com.ddemachim.server.domain.placesearch.exception.PlaceSearchException;
import com.ddemachim.server.domain.placesearch.service.PlaceSearchService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class PlaceSearchControllerTest {

    @Mock
    private PlaceSearchService placeSearchService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new PlaceSearchController(placeSearchService))
                .setControllerAdvice(new ExceptionAdvice())
                .build();
    }

    @Test
    void searchKakaoPlaces_mapsLocationParamsAndWrapsResultsInCommonResponse() throws Exception {
        KakaoPlaceSearchResponse place = new KakaoPlaceSearchResponse(
                "1", "경복궁", "여행 > 관광,명소", "AT4", "서울 종로구 사직로 161", "서울 종로구 세종로 1-1",
                126.9768, 37.5776, 321, "02-3700-3900", "https://place.map.kakao.com/1");
        when(placeSearchService.searchKakaoPlaces("경복궁", 37.5776, 126.9768, 1000))
                .thenReturn(List.of(place));

        mockMvc.perform(get("/api/place-search/kakao")
                        .queryParam("query", "경복궁")
                        .queryParam("latitude", "37.5776")
                        .queryParam("longitude", "126.9768")
                        .queryParam("radius", "1000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.code").value("COMMON200"))
                .andExpect(jsonPath("$.result[0].providerPlaceId").value("1"))
                .andExpect(jsonPath("$.result[0].distanceMeters").value(321));

        verify(placeSearchService).searchKakaoPlaces("경복궁", 37.5776, 126.9768, 1000);
    }

    @Test
    void searchKakaoPlaces_keepsQueryOnlyFallback() throws Exception {
        when(placeSearchService.searchKakaoPlaces("경복궁", null, null, null)).thenReturn(List.of());

        mockMvc.perform(get("/api/place-search/kakao").queryParam("query", "경복궁"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.result").isArray())
                .andExpect(jsonPath("$.result").isEmpty());

        verify(placeSearchService).searchKakaoPlaces("경복궁", null, null, null);
    }

    @Test
    void searchKakaoPlaces_forwardsCoordinatesWithoutRadius() throws Exception {
        when(placeSearchService.searchKakaoPlaces("경복궁", 37.5776, 126.9768, null))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/place-search/kakao")
                        .queryParam("query", "경복궁")
                        .queryParam("latitude", "37.5776")
                        .queryParam("longitude", "126.9768"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").isEmpty());

        verify(placeSearchService).searchKakaoPlaces("경복궁", 37.5776, 126.9768, null);
    }

    @Test
    void searchKakaoPlaces_returnsTypedBadRequestForInvalidLocationParams() throws Exception {
        when(placeSearchService.searchKakaoPlaces("경복궁", 37.5, null, null))
                .thenThrow(new PlaceSearchException(PlaceSearchErrorStatus.INVALID_LOCATION_PARAMETERS));

        mockMvc.perform(get("/api/place-search/kakao")
                        .queryParam("query", "경복궁")
                        .queryParam("latitude", "37.5"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("PLACESEARCH4002"))
                .andExpect(jsonPath("$.message").value("위도, 경도, 반경 검색 조건이 올바르지 않습니다."));
    }
}
