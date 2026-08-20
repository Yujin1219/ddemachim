package com.ddemachim.server.domain.place.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
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
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;

class AiPlaceSearchServiceTest {

    @Test
    void nearbySearchKeepsPostgisDistanceAndUsesWalkingRouteTime() {
        PlaceRepository places = mock(PlaceRepository.class);
        PlaceOperatingHoursRepository hours = mock(PlaceOperatingHoursRepository.class);
        CrowdingService crowding = mock(CrowdingService.class);
        CourseRouteProviderClient routes = mock(CourseRouteProviderClient.class);
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
