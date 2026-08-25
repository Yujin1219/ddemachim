package com.ddemachim.server.domain.place.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.placesearch.dto.KakaoPlaceSearchResponse;
import com.ddemachim.server.domain.placesearch.service.PlaceSearchService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;

class AiPlaceReferenceSearchServiceTest {

    @Test
    void ignoresSavedCandidateWhenReferenceOnlyMatchesItsMetadata() {
        PlaceRepository places = mock(PlaceRepository.class);
        PlaceSearchService kakaoSearch = mock(PlaceSearchService.class);
        AiPlaceSearchService nearbySearch = mock(AiPlaceSearchService.class);
        Place unrelatedRestaurant = mock(Place.class);
        GeometryFactory factory = new GeometryFactory(new PrecisionModel(), 4326);
        when(unrelatedRestaurant.getName()).thenReturn("또마참숲돼지갈비");
        when(unrelatedRestaurant.getLocation()).thenReturn(
                factory.createPoint(new Coordinate(126.9840, 37.5760)));
        when(places.findFirstByNameIgnoreCaseAndLocationIsNotNullOrderByIdAsc("안국"))
                .thenReturn(Optional.empty());
        when(places.searchForAi("안국", null, null, 10)).thenReturn(List.of(unrelatedRestaurant));
        KakaoPlaceSearchResponse angukStation = new KakaoPlaceSearchResponse(
                "1", "안국역 3호선", "교통 > 지하철역", "SW8", "서울 종로구 율곡로 62", null,
                126.9854, 37.5765, null, null, "https://place.map.kakao.com/1");
        when(kakaoSearch.searchKakaoPlaces("안국", null, null, null)).thenReturn(List.of(angukStation));
        when(nearbySearch.searchNearby(any())).thenReturn(new AiPlaceSearchService.NearbyResult(List.of()));
        AiPlaceReferenceSearchService service = new AiPlaceReferenceSearchService(places, kakaoSearch, nearbySearch);

        var result = service.search(new AiPlaceReferenceSearchService.NearReferenceCondition(
                "안국", "CAFE", 1000, null, null, 10, null));

        assertThat(result.reference().name()).isEqualTo("안국역 3호선");
        assertThat(result.reference().source()).isEqualTo("KAKAO");
        verify(nearbySearch).searchNearby(new AiPlaceSearchService.NearbyCondition(
                37.5765, 126.9854, "CAFE", 1000, null, null, 10, null));
    }

    @Test
    void searchesSavedCatalogAroundTheResolvedReferencePlace() {
        PlaceRepository places = mock(PlaceRepository.class);
        PlaceSearchService kakaoSearch = mock(PlaceSearchService.class);
        AiPlaceSearchService nearbySearch = mock(AiPlaceSearchService.class);
        Place gyeongbokgung = mock(Place.class);
        GeometryFactory factory = new GeometryFactory(new PrecisionModel(), 4326);
        when(gyeongbokgung.getName()).thenReturn("경복궁");
        when(gyeongbokgung.getRoadAddress()).thenReturn("서울 종로구 사직로 161");
        when(gyeongbokgung.getLocation()).thenReturn(factory.createPoint(new Coordinate(126.9769, 37.5776)));
        when(places.findFirstByNameIgnoreCaseAndLocationIsNotNullOrderByIdAsc("경복궁"))
                .thenReturn(Optional.of(gyeongbokgung));
        when(nearbySearch.searchNearby(any())).thenReturn(new AiPlaceSearchService.NearbyResult(List.of()));
        AiPlaceReferenceSearchService service = new AiPlaceReferenceSearchService(places, kakaoSearch, nearbySearch);

        var result = service.search(new AiPlaceReferenceSearchService.NearReferenceCondition(
                "경복궁", "CAFE", 1000, "카페", false, 10, null));

        assertThat(result.reference().source()).isEqualTo("DDEMACHIM");
        assertThat(result.reference().latitude()).isEqualTo(37.5776);
        assertThat(result.reference().longitude()).isEqualTo(126.9769);
        verify(nearbySearch).searchNearby(new AiPlaceSearchService.NearbyCondition(
                37.5776, 126.9769, "CAFE", 1000, "카페", false, 10, null));
        verifyNoInteractions(kakaoSearch);
    }
}
