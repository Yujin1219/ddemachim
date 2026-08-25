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
import com.ddemachim.server.domain.place.entity.PlaceCategory;
import com.ddemachim.server.domain.place.entity.PlaceMenu;
import com.ddemachim.server.domain.place.entity.PlaceTrendResult;
import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import com.ddemachim.server.domain.place.exception.InvalidFilmingContentTypeException;
import com.ddemachim.server.domain.place.exception.InvalidPlaceTrendLimitException;
import com.ddemachim.server.domain.place.repository.PlaceFilmingContentTypeProjection;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceMenuRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.place.repository.PlaceTrendResultRepository;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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
    private PlaceMenuRepository placeMenuRepository;

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
        when(placeTrendResultRepository.findLatestStoredResults(PageRequest.of(0, 6)))
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
        verify(placeTrendResultRepository).findLatestStoredResults(PageRequest.of(0, 6));
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
        when(placeTrendResultRepository.findLatestStoredResults(PageRequest.of(0, 50)))
                .thenReturn(List.of());

        assertThat(placeQueryService.getTrends(50)).isEmpty();

        verify(placeTrendResultRepository).findLatestStoredResults(PageRequest.of(0, 50));
    }

    @Test
    void getDetail_returnsNullTrendWhenThereIsNoVisibleResult() {
        Place place = place(55L, "관찰 중인 장소", "종로구");
        when(placeRepository.findById(55L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(55L)).thenReturn(List.of());
        when(placeMenuRepository.findByPlaceIdOrderById(55L)).thenReturn(List.of());
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(55L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(55L);

        assertThat(result.trend()).isNull();
        verify(placeTrendResultRepository).findFirstVisibleByPlaceId(55L);
    }

    @Test
    void getDetail_fillsAnEmptyCafeMenuFromOneStableCafeOrDessertDonor() {
        Place place = place(55L, "메뉴 없는 카페", "종로구");
        PlaceCategory category = category("CAFE", "카페");
        List<PlaceMenu> donorMenus = List.of(
                menu(201L, "카페라테", 5_500),
                menu(202L, "바스크 치즈케이크", 7_000));
        when(place.getCategory()).thenReturn(category);
        when(placeRepository.findById(55L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(55L)).thenReturn(List.of());
        when(placeMenuRepository.findByPlaceIdOrderById(55L)).thenReturn(List.of());
        when(placeMenuRepository.findDistinctPlaceIdsWithMenusByCategoryCodes(
                Set.of("CAFE", "DESSERT"), 55L)).thenReturn(List.of(12L, 18L));
        when(placeMenuRepository.findByPlaceIdOrderById(18L)).thenReturn(donorMenus);
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(55L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(55L);

        assertThat(result.menus()).extracting("name")
                .containsExactly("카페라테", "바스크 치즈케이크");
    }

    @Test
    void getDetail_keepsARealMenuInsteadOfLookingForADemoDonor() {
        Place place = place(56L, "메뉴 있는 음식점", "종로구");
        PlaceCategory category = category("RESTAURANT", "음식점");
        PlaceMenu actualMenu = menu(301L, "비빔밥", 11_000);
        when(place.getCategory()).thenReturn(category);
        when(placeRepository.findById(56L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(56L)).thenReturn(List.of());
        when(placeMenuRepository.findByPlaceIdOrderById(56L)).thenReturn(List.of(actualMenu));
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(56L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(56L);

        assertThat(result.menus()).extracting("name").containsExactly("비빔밥");
        verify(placeMenuRepository, org.mockito.Mockito.never())
                .findDistinctPlaceIdsWithMenusByCategoryCodes(Set.of("RESTAURANT"), 56L);
    }

    @Test
    void getDetail_fillsAnEmptyRestaurantMenuOnlyFromARestaurantDonor() {
        Place place = place(58L, "메뉴 없는 음식점", "종로구");
        PlaceCategory category = category("RESTAURANT", "음식점");
        PlaceMenu donorMenu = menu(401L, "제육볶음", 12_000);
        when(place.getCategory()).thenReturn(category);
        when(placeRepository.findById(58L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(58L)).thenReturn(List.of());
        when(placeMenuRepository.findByPlaceIdOrderById(58L)).thenReturn(List.of());
        when(placeMenuRepository.findDistinctPlaceIdsWithMenusByCategoryCodes(
                Set.of("RESTAURANT"), 58L)).thenReturn(List.of(31L, 32L));
        when(placeMenuRepository.findByPlaceIdOrderById(31L)).thenReturn(List.of(donorMenu));
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(58L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(58L);

        assertThat(result.menus()).extracting("name").containsExactly("제육볶음");
    }

    @Test
    void getDetail_treatsALegacyEtcCafeAsACafeMenuTarget() {
        Place place = place(59L, "꿈꾸는커피", "종로구");
        PlaceCategory category = category("ETC", "기타");
        PlaceMenu donorMenu = menu(501L, "바닐라 라떼", 5_800);
        when(place.getCategory()).thenReturn(category);
        when(placeRepository.findById(59L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(59L)).thenReturn(List.of());
        when(placeMenuRepository.findByPlaceIdOrderById(59L)).thenReturn(List.of());
        when(placeMenuRepository.findDistinctPlaceIdsWithMenusByCategoryCodes(
                Set.of("CAFE", "DESSERT"), 59L)).thenReturn(List.of(42L));
        when(placeMenuRepository.findByPlaceIdOrderById(42L)).thenReturn(List.of(donorMenu));
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(59L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(59L);

        assertThat(result.menus()).extracting("name").containsExactly("바닐라 라떼");
    }

    @Test
    void getDetail_treatsALegacyEtcFoodPlaceAsARestaurantMenuTarget() {
        Place place = place(60L, "능전", "종로구");
        PlaceCategory category = category("ETC", "기타");
        PlaceMenu donorMenu = menu(601L, "김치찌개", 10_000);
        when(place.getCategory()).thenReturn(category);
        when(place.getTags()).thenReturn(new String[0]);
        when(placeRepository.findById(60L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(60L)).thenReturn(List.of());
        when(placeMenuRepository.findByPlaceIdOrderById(60L)).thenReturn(List.of());
        when(placeMenuRepository.findDistinctPlaceIdsWithMenusByCategoryCodes(
                Set.of("RESTAURANT"), 60L)).thenReturn(List.of(43L));
        when(placeMenuRepository.findByPlaceIdOrderById(43L)).thenReturn(List.of(donorMenu));
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(60L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(60L);

        assertThat(result.menus()).extracting("name").containsExactly("김치찌개");
    }

    @Test
    void getDetail_doesNotTreatALegacyEtcFilmingLocationAsAFoodPlace() {
        Place place = place(61L, "서울 부암동 개인주택", "종로구");
        PlaceCategory category = category("ETC", "기타");
        when(place.getCategory()).thenReturn(category);
        when(place.getTags()).thenReturn(new String[] {"FILMING_LOCATION"});
        when(placeRepository.findById(61L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(61L)).thenReturn(List.of());
        when(placeMenuRepository.findByPlaceIdOrderById(61L)).thenReturn(List.of());
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(61L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(61L);

        assertThat(result.menus()).isEmpty();
    }

    @Test
    void getDetail_leavesAnEmptyNonFoodPlaceMenuEmpty() {
        Place place = place(57L, "메뉴 없는 관광지", "종로구");
        PlaceCategory category = category("ATTRACTION", "관광지");
        when(place.getCategory()).thenReturn(category);
        when(placeRepository.findById(57L)).thenReturn(Optional.of(place));
        when(placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(57L)).thenReturn(List.of());
        when(placeMenuRepository.findByPlaceIdOrderById(57L)).thenReturn(List.of());
        when(placeTrendResultRepository.findFirstVisibleByPlaceId(57L)).thenReturn(Optional.empty());

        PlaceDetailResponse result = placeQueryService.getDetail(57L);

        assertThat(result.menus()).isEmpty();
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
        when(placeMenuRepository.findByPlaceIdOrderById(56L)).thenReturn(List.of());
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

    private static PlaceCategory category(String code, String label) {
        PlaceCategory category = mock(PlaceCategory.class);
        when(category.getCode()).thenReturn(code);
        when(category.getLabelKo()).thenReturn(label);
        return category;
    }

    private static PlaceMenu menu(Long id, String name, Integer price) {
        PlaceMenu menu = mock(PlaceMenu.class);
        when(menu.getId()).thenReturn(id);
        when(menu.getMenuName()).thenReturn(name);
        when(menu.getMenuPrice()).thenReturn(price);
        return menu;
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
