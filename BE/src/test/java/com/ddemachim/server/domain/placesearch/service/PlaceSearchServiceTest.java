package com.ddemachim.server.domain.placesearch.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.placesearch.dto.KakaoPlaceSearchResponse;
import com.ddemachim.server.domain.placesearch.exception.PlaceSearchException;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PlaceSearchServiceTest {

    @Mock
    private KakaoLocalClient kakaoLocalClient;

    @InjectMocks
    private PlaceSearchService placeSearchService;

    @Test
    void searchKakaoPlaces_trimsQueryAndForwardsLocationParams() {
        KakaoPlaceSearchResponse place = new KakaoPlaceSearchResponse(
                "1", "경복궁", "여행 > 관광,명소", "AT4", "서울 종로구 사직로 161", "서울 종로구 세종로 1-1",
                126.9768, 37.5776, 125, "02-3700-3900", "https://place.map.kakao.com/1");
        when(kakaoLocalClient.search("경복궁", 37.5776, 126.9768, 1000)).thenReturn(List.of(place));

        List<KakaoPlaceSearchResponse> result =
                placeSearchService.searchKakaoPlaces("  경복궁  ", 37.5776, 126.9768, 1000);

        assertThat(result).containsExactly(place);
        verify(kakaoLocalClient).search("경복궁", 37.5776, 126.9768, 1000);
    }

    @Test
    void searchKakaoPlaces_forwardsOmittedLocationParams() {
        when(kakaoLocalClient.search("경복궁", null, null, null)).thenReturn(List.of());

        List<KakaoPlaceSearchResponse> result =
                placeSearchService.searchKakaoPlaces("경복궁", null, null, null);

        assertThat(result).isEmpty();
        verify(kakaoLocalClient).search("경복궁", null, null, null);
    }

    @Test
    void searchKakaoPlaces_rejectsBlankQuery() {
        assertThatThrownBy(() -> placeSearchService.searchKakaoPlaces("   ", null, null, null))
                .isInstanceOf(PlaceSearchException.class)
                .hasMessage("검색어를 1자 이상 100자 이하로 입력해주세요.");
        verifyNoInteractions(kakaoLocalClient);
    }

    @Test
    void searchKakaoPlaces_rejectsOverlongQuery() {
        assertThatThrownBy(() -> placeSearchService.searchKakaoPlaces("가".repeat(101), null, null, null))
                .isInstanceOf(PlaceSearchException.class);
        verifyNoInteractions(kakaoLocalClient);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidLocationParams")
    void searchKakaoPlaces_rejectsInvalidLocationParams(
            String caseName, Double latitude, Double longitude, Integer radius) {
        assertThatThrownBy(() -> placeSearchService.searchKakaoPlaces("경복궁", latitude, longitude, radius))
                .isInstanceOf(PlaceSearchException.class)
                .hasMessage("위도, 경도, 반경 검색 조건이 올바르지 않습니다.");
        verifyNoInteractions(kakaoLocalClient);
    }

    @ParameterizedTest
    @MethodSource("validBoundaryLocationParams")
    void searchKakaoPlaces_acceptsInclusiveLocationBoundaries(
            Double latitude, Double longitude, Integer radius) {
        when(kakaoLocalClient.search("경복궁", latitude, longitude, radius)).thenReturn(List.of());

        assertThat(placeSearchService.searchKakaoPlaces("경복궁", latitude, longitude, radius)).isEmpty();

        verify(kakaoLocalClient).search("경복궁", latitude, longitude, radius);
    }

    private static Stream<Arguments> invalidLocationParams() {
        return Stream.of(
                Arguments.of("위도만 제공", 37.5, null, null),
                Arguments.of("경도만 제공", null, 126.9, null),
                Arguments.of("좌표 없이 반경 제공", null, null, 1000),
                Arguments.of("위도 하한 초과", -90.0001, 126.9, null),
                Arguments.of("위도 상한 초과", 90.0001, 126.9, null),
                Arguments.of("경도 하한 초과", 37.5, -180.0001, null),
                Arguments.of("경도 상한 초과", 37.5, 180.0001, null),
                Arguments.of("음수 반경", 37.5, 126.9, -1),
                Arguments.of("반경 상한 초과", 37.5, 126.9, 20001),
                Arguments.of("유한하지 않은 위도", Double.NaN, 126.9, null),
                Arguments.of("무한대 위도", Double.NEGATIVE_INFINITY, 126.9, null),
                Arguments.of("무한대 경도", 37.5, Double.POSITIVE_INFINITY, null));
    }

    private static Stream<Arguments> validBoundaryLocationParams() {
        return Stream.of(
                Arguments.of(-90.0, -180.0, 0),
                Arguments.of(90.0, 180.0, 20000));
    }
}
