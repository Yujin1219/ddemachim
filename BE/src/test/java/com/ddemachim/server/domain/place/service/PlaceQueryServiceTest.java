package com.ddemachim.server.domain.place.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.place.dto.PlaceDetailResponse;
import com.ddemachim.server.domain.place.dto.PlaceTrendSummaryResponse;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceTrendResult;
import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import com.ddemachim.server.domain.place.exception.InvalidFilmingContentTypeException;
import com.ddemachim.server.domain.place.exception.InvalidPlaceTrendLimitException;
import com.ddemachim.server.domain.place.repository.PlaceFilmingContentTypeProjection;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.place.repository.PlaceTrendResultRepository;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.locationtech.jts.geom.Point;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class PlaceQueryServiceTest {

    @Mock
    private PlaceRepository placeRepository;

    @Mock
    private PlaceOperatingHoursRepository placeOperatingHoursRepository;

    @Mock
    private PlaceTrendResultRepository placeTrendResultRepository;

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
        ReflectionTestUtils.setField(place, "imageUrl", "https://example.com/place.jpg");
        PlaceFilmingContentTypeProjection drama = contentType(10L, "DRAMA");
        PlaceFilmingContentTypeProjection movie = contentType(10L, "MOVIE");
        when(placeRepository.search(null, null, "FILMING_LOCATION", null, null, pageable))
                .thenReturn(new PageImpl<>(List.of(place), pageable, 1));
        when(placeRepository.findFilmingContentTypesByPlaceIds(List.of(10L)))
                .thenReturn(List.of(movie, drama));

        var result = placeQueryService.search(
                null, null, "FILMING_LOCATION", null, null, pageable);

        assertThat(result.getContent().getFirst().filmingContentTypes())
                .containsExactly("DRAMA", "MOVIE");
        assertThat(result.getContent().getFirst().imageUrl())
                .isEqualTo("https://example.com/place.jpg");
    }

    @Test
    void getTrends_projectsAllFinalTrendMetrics() {
        Place place = place(10L, "콘웨이커피 안국점", "종로구");
        Point location = mock(Point.class);
        when(location.getY()).thenReturn(37.5711);
        when(location.getX()).thenReturn(126.9856);
        when(place.getLocation()).thenReturn(location);
        OffsetDateTime measuredAt = measuredAt();
        PlaceTrendResult result = trendResult(
                PlaceTrendStatus.TRENDING,
                72.5,
                65.0,
                11.538,
                measuredAt);
        when(result.getPlace()).thenReturn(place);
        when(placeTrendResultRepository.findLatestVisibleResults(PageRequest.of(0, 6)))
                .thenReturn(List.of(result));

        List<PlaceTrendSummaryResponse> trends = placeQueryService.getTrends(6);

        assertThat(trends).hasSize(1);
        assertThat(trends.getFirst().placeId()).isEqualTo(10L);
        assertThat(trends.getFirst().name()).isEqualTo("콘웨이커피 안국점");
        assertThat(trends.getFirst().latitude()).isEqualTo(37.5711);
        assertThat(trends.getFirst().longitude()).isEqualTo(126.9856);
        assertThat(trends.getFirst().imageUrl()).isNull();
        assertThat(trends.getFirst().trend().status()).isEqualTo(PlaceTrendStatus.TRENDING);
        assertThat(trends.getFirst().trend().recentInterestAverage()).isEqualTo(72.5);
        assertThat(trends.getFirst().trend().previousInterestAverage()).isEqualTo(65.0);
        assertThat(trends.getFirst().trend().interestChangePercent()).isEqualTo(11.538);
        assertThat(trends.getFirst().trend().measuredAt()).isEqualTo(measuredAt);
        assertThat(trends.getFirst().trend().updatedAt()).isEqualTo(LocalDate.of(2026, 8, 13));
        verify(placeTrendResultRepository).findLatestVisibleResults(PageRequest.of(0, 6));
    }

    @Test
    void getTrends_rejectsLimitsOutsideThePublicRange() {
        assertThatThrownBy(() -> placeQueryService.getTrends(0))
                .isInstanceOf(InvalidPlaceTrendLimitException.class);
        assertThatThrownBy(() -> placeQueryService.getTrends(51))
                .isInstanceOf(InvalidPlaceTrendLimitException.class);

        verifyNoInteractions(placeTrendResultRepository);
    }

    @Test
    void getTrends_acceptsMaximumPublicLimit() {
        when(placeTrendResultRepository.findLatestVisibleResults(PageRequest.of(0, 50)))
                .thenReturn(List.of());

        assertThat(placeQueryService.getTrends(50)).isEmpty();

        verify(placeTrendResultRepository).findLatestVisibleResults(PageRequest.of(0, 50));
    }

    @Test
    void getDetail_returnsNullTrendWhenThereIsNoVisibleResult() {
        Place place = place(55L, "관찰 중인 장소", "종로구");
        when(placeRepository.findById(55L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(55L)).thenReturn(List.of());
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(55L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(55L);

        assertThat(result.trend()).isNull();
        verify(placeTrendResultRepository).findFirstVisibleByPlaceId(55L);
    }

    @Test
    void getDetail_projectsAllFinalTrendMetrics() {
        Place place = place(56L, "주목할 장소", "종로구");
        OffsetDateTime measuredAt = OffsetDateTime.of(2026, 8, 12, 16, 0, 0, 0, ZoneOffset.UTC);
        PlaceTrendResult result = trendResult(
                PlaceTrendStatus.WATCH,
                null,
                44.0,
                null,
                measuredAt);
        when(placeRepository.findById(56L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(56L)).thenReturn(List.of());
        when(place.getImageUrl()).thenReturn("https://example.com/place.jpg");
        when(place.getImageSource()).thenReturn("KAKAO");
        when(place.getImageAttribution()).thenReturn("Kakao Local");
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(56L)).thenReturn(Optional.of(result));

        PlaceDetailResponse response = placeQueryService.getDetail(56L);

        assertThat(response.trend().status()).isEqualTo(PlaceTrendStatus.WATCH);
        assertThat(response.trend().recentInterestAverage()).isNull();
        assertThat(response.trend().previousInterestAverage()).isEqualTo(44.0);
        assertThat(response.trend().interestChangePercent()).isNull();
        assertThat(response.trend().measuredAt()).isEqualTo(measuredAt);
        assertThat(response.trend().updatedAt()).isEqualTo(LocalDate.of(2026, 8, 13));
        assertThat(response.imageUrl()).isEqualTo("https://example.com/place.jpg");
        assertThat(response.imageSource()).isEqualTo("KAKAO");
        assertThat(response.imageAttribution()).isEqualTo("Kakao Local");
    }

    private static PlaceFilmingContentTypeProjection contentType(Long placeId, String contentType) {
        PlaceFilmingContentTypeProjection projection = mock(PlaceFilmingContentTypeProjection.class);
        when(projection.getPlaceId()).thenReturn(placeId);
        when(projection.getContentType()).thenReturn(contentType);
        return projection;
    }

    private static Place place(Long id, String name, String district) {
        Place place = mock(Place.class);
        when(place.getId()).thenReturn(id);
        when(place.getName()).thenReturn(name);
        when(place.getDistrict()).thenReturn(district);
        return place;
    }

    private static PlaceTrendResult trendResult(
            PlaceTrendStatus status,
            Double recentInterestAverage,
            Double previousInterestAverage,
            Double interestChangePercent,
            OffsetDateTime measuredAt) {
        PlaceTrendResult result = mock(PlaceTrendResult.class);
        when(result.getStatus()).thenReturn(status);
        when(result.getRecentInterestAverage()).thenReturn(recentInterestAverage);
        when(result.getPreviousInterestAverage()).thenReturn(previousInterestAverage);
        when(result.getInterestChangePercent()).thenReturn(interestChangePercent);
        when(result.getMeasuredAt()).thenReturn(measuredAt);
        return result;
    }

    private static OffsetDateTime measuredAt() {
        return OffsetDateTime.of(2026, 8, 13, 9, 0, 0, 0, ZoneOffset.ofHours(9));
    }

    private static class TestPlace extends Place {
    }
}
