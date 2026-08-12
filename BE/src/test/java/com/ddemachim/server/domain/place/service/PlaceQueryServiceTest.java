package com.ddemachim.server.domain.place.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.place.exception.InvalidFilmingContentTypeException;
import com.ddemachim.server.domain.place.repository.PlaceImageRepository;
import com.ddemachim.server.domain.place.repository.PlaceFilmingContentTypeProjection;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;
import com.ddemachim.server.domain.place.entity.Place;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
class PlaceQueryServiceTest {

    @Mock
    private PlaceRepository placeRepository;

    @Mock
    private PlaceImageRepository placeImageRepository;

    @Mock
    private PlaceOperatingHoursRepository placeOperatingHoursRepository;

    @InjectMocks
    private PlaceQueryService placeQueryService;

    @Test
    void search_normalizesFilmingContentTypeAndDelegatesToRepository() {
        Pageable pageable = PageRequest.of(0, 20);
        when(placeRepository.search(null, "종로구", "FILMING_LOCATION", "DRAMA", null, pageable))
                .thenReturn(Page.empty(pageable));

        placeQueryService.search(null, "종로구", "FILMING_LOCATION", " drama ", null, pageable);

        verify(placeRepository).search(null, "종로구", "FILMING_LOCATION", "DRAMA", null, pageable);
    }

    @Test
    void search_rejectsUnsupportedFilmingContentType() {
        Pageable pageable = PageRequest.of(0, 20);

        assertThatThrownBy(() ->
                        placeQueryService.search(null, null, null, "ARTIST", null, pageable))
                .isInstanceOf(InvalidFilmingContentTypeException.class);

        verifyNoInteractions(placeRepository);
    }

    @Test
    void search_includesFilmingContentTypesForEachPlace() {
        Pageable pageable = PageRequest.of(0, 20);
        Place place = new TestPlace();
        ReflectionTestUtils.setField(place, "id", 10L);
        ReflectionTestUtils.setField(place, "name", "테스트 촬영지");
        ReflectionTestUtils.setField(place, "normalizedName", "테스트촬영지");
        PlaceFilmingContentTypeProjection drama = contentType(10L, "DRAMA");
        PlaceFilmingContentTypeProjection movie = contentType(10L, "MOVIE");
        when(placeRepository.search(null, null, "FILMING_LOCATION", null, null, pageable))
                .thenReturn(new PageImpl<>(List.of(place), pageable, 1));
        when(placeRepository.findFilmingContentTypesByPlaceIds(List.of(10L)))
                .thenReturn(List.of(movie, drama));
        when(placeImageRepository.findByPlaceIdInOrderByPlaceIdAscIdAsc(List.of(10L)))
                .thenReturn(List.of());

        var result = placeQueryService.search(
                null, null, "FILMING_LOCATION", null, null, pageable);

        assertThat(result.getContent().getFirst().filmingContentTypes())
                .containsExactly("DRAMA", "MOVIE");
    }

    private static PlaceFilmingContentTypeProjection contentType(Long placeId, String contentType) {
        PlaceFilmingContentTypeProjection projection = mock(PlaceFilmingContentTypeProjection.class);
        when(projection.getPlaceId()).thenReturn(placeId);
        when(projection.getContentType()).thenReturn(contentType);
        return projection;
    }

    private static class TestPlace extends Place {
    }
}
