package com.ddemachim.server.domain.place.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.crowding.service.CrowdingService;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceCategory;
import com.ddemachim.server.domain.place.repository.NearbyPlaceDistanceProjection;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.service.CourseRouteProviderClient;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;

class AiPlaceSearchServiceTest {

    private PlaceRepository places;
    private PlaceOperatingHoursRepository hours;
    private CrowdingService crowding;
    private CourseRouteProviderClient routes;

    @BeforeEach
    void setUp() {
        places = mock(PlaceRepository.class);
        hours = mock(PlaceOperatingHoursRepository.class);
        crowding = mock(CrowdingService.class);
        routes = mock(CourseRouteProviderClient.class);
    }

    @Test
    void filmingRequestUsesFilmingLocationTagWhenLlmSendsUnsupportedCategory() {
        Place place = place();
        when(places.searchForAi(any(), any(), any(), anyInt())).thenReturn(List.of(place));
        when(hours.findByPlaceIdInAndDayOfWeek(any(), any(Short.class))).thenReturn(List.of());
        AiPlaceSearchService service = new AiPlaceSearchService(
                places, hours, crowding, routes,
                Clock.fixed(Instant.parse("2026-08-20T07:00:00Z"), ZoneId.of("Asia/Seoul")));

        var result = service.search(new AiPlaceSearchService.SearchCondition(
                "종로 촬영지", "종로", List.of("FILMING"), null, 10));

        ArgumentCaptor<String> categoryFilter = ArgumentCaptor.forClass(String.class);
        verify(places).searchForAi(eq("FILMING_LOCATION"), eq("종로"), categoryFilter.capture(), eq(10));
        assertThat(categoryFilter.getValue()).isEqualTo("FILMING_LOCATION");
        assertThat(result.places()).hasSize(1);
    }

    @Test
    void stationAreaUsesTheCatalogAreaWithoutTheStationSuffix() {
        Place place = place();
        when(places.searchForAi(any(), any(), any(), anyInt())).thenReturn(List.of(place));
        when(hours.findByPlaceIdInAndDayOfWeek(any(), any(Short.class))).thenReturn(List.of());
        AiPlaceSearchService service = new AiPlaceSearchService(
                places, hours, crowding, routes,
                Clock.fixed(Instant.parse("2026-08-20T07:00:00Z"), ZoneId.of("Asia/Seoul")));

        var result = service.search(new AiPlaceSearchService.SearchCondition(
                "카페", "안국역", List.of("CAFE"), null, 10));

        verify(places).searchForAi(eq("카페"), eq("안국"), eq("CAFE"), eq(10));
        assertThat(result.places()).hasSize(1);
    }

    @Test
    void koreanPlaceCategoriesMapToCatalogCodes() {
        when(places.searchForAi(any(), any(), any(), anyInt())).thenReturn(List.of());
        AiPlaceSearchService service = new AiPlaceSearchService(
                places, hours, crowding, routes,
                Clock.fixed(Instant.parse("2026-08-20T07:00:00Z"), ZoneId.of("Asia/Seoul")));

        service.search(new AiPlaceSearchService.SearchCondition(
                null, "종로구", List.of("카페", "맛집", "전시", "행사"), null, 10));

        verify(places).searchForAi(null, "종로구", "CAFE,RESTAURANT,EXHIBITION,POPUP", 10);
    }

    @Test
    void trendingAliasesMapToBlogTrendTag() {
        when(places.searchForAi(any(), any(), any(), anyInt())).thenReturn(List.of());
        AiPlaceSearchService service = new AiPlaceSearchService(
                places, hours, crowding, routes,
                Clock.fixed(Instant.parse("2026-08-20T07:00:00Z"), ZoneId.of("Asia/Seoul")));

        service.search(new AiPlaceSearchService.SearchCondition(
                "종로에서 요즘 뜨는 곳", "종로구", List.of(), null, 10));

        verify(places).searchForAi(eq("종로에서 요즘 뜨는 곳"), eq("종로구"), eq("BLOG_TREND"), eq(10));
    }

    @Test
    void nearbySearchKeepsPostgisDistanceAndUsesWalkingRouteTime() {
        NearbyPlaceDistanceProjection row = mock(NearbyPlaceDistanceProjection.class);
        when(row.getPlaceId()).thenReturn(51L);
        when(row.getDistanceMeters()).thenReturn(320.0);
        when(places.findNearbyForAi(any(Double.class), any(Double.class), any(), any(), any(Integer.class), any(Integer.class)))
                .thenReturn(List.of(row));
        Place place = place();
        when(places.findAllById(any())).thenReturn(List.of(place));
        when(hours.findByPlaceIdInAndDayOfWeek(any(), any(Short.class))).thenReturn(List.of());
        when(crowding.getPointCrowding(any())).thenReturn(List.of());
        when(routes.findWalking(any(), any())).thenReturn(new RouteOption(
                RouteMode.WALK, RouteStatus.AVAILABLE, 300, 320, null, null, 320, null, List.of()));
        AiPlaceSearchService service = new AiPlaceSearchService(
                places, hours, crowding, routes,
                Clock.fixed(Instant.parse("2026-08-20T07:00:00Z"), ZoneId.of("Asia/Seoul")));

        var result = service.searchNearby(new AiPlaceSearchService.NearbyCondition(
                37.577, 126.972, "RESTAURANT", 1_000, "맛집", false, 10, null));

        assertThat(result.places()).singleElement().satisfies(found -> {
            assertThat(found.placeId()).isEqualTo(51L);
            assertThat(found.distanceMeters()).isEqualTo(320);
            assertThat(found.walkingMinutes()).isEqualTo(5);
            assertThat(found.open()).isNull();
        });
    }

    @Test
    void nearbySearchMapsKoreanFoodCategory() {
        when(places.findNearbyForAi(any(Double.class), any(Double.class), any(), any(), any(Integer.class), any(Integer.class)))
                .thenReturn(List.of());
        AiPlaceSearchService service = new AiPlaceSearchService(
                places, hours, crowding, routes,
                Clock.fixed(Instant.parse("2026-08-20T07:00:00Z"), ZoneId.of("Asia/Seoul")));

        service.searchNearby(new AiPlaceSearchService.NearbyCondition(
                37.577, 126.972, "맛집", 1_000, null, false, 10, null));

        verify(places).findNearbyForAi(eq(37.577), eq(126.972), eq("RESTAURANT"), eq(null), eq(1_000), eq(20));
    }

    private static Place place() {
        Place place = mock(Place.class);
        PlaceCategory category = mock(PlaceCategory.class);
        when(category.getCode()).thenReturn("RESTAURANT");
        when(place.getId()).thenReturn(51L);
        when(place.getName()).thenReturn("종로식당");
        when(place.getCategory()).thenReturn(category);
        when(place.getTags()).thenReturn(new String[]{"한식", "조용한"});
        GeometryFactory factory = new GeometryFactory(new PrecisionModel(), 4326);
        when(place.getLocation()).thenReturn(factory.createPoint(new Coordinate(126.973, 37.578)));
        return place;
    }
}
