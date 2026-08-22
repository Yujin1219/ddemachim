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
import com.ddemachim.server.domain.placesearch.service.PlaceSearchService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;

class AiPlaceReferenceSearchServiceTest {

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
        when(places.searchForAi("경복궁", null, null, 10)).thenReturn(List.of(gyeongbokgung));
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
