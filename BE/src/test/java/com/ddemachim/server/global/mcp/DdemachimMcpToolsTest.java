package com.ddemachim.server.global.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.service.CoursePreviewService;
import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.enums.CrowdingLevel;
import com.ddemachim.server.domain.crowding.service.CrowdingService;
import com.ddemachim.server.domain.place.dto.PlaceDetailResponse;
import com.ddemachim.server.domain.place.exception.PlaceNotFoundException;
import com.ddemachim.server.domain.place.service.PlaceQueryService;
import com.ddemachim.server.domain.place.service.AiPlaceSearchService;
import com.ddemachim.server.domain.course.service.AiCourseService;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.service.RouteComparisonService;
import com.ddemachim.server.global.auth.security.MemberAuthentication;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;

@ExtendWith(MockitoExtension.class)
class DdemachimMcpToolsTest {

    @Mock
    private PlaceQueryService placeQueryService;

    @Mock
    private CrowdingService crowdingService;

    @Mock
    private RouteComparisonService routeComparisonService;

    @Mock
    private CoursePreviewService coursePreviewService;

    @Mock
    private AiPlaceSearchService aiPlaceSearchService;

    @Mock
    private AiCourseService aiCourseService;

    private DdemachimMcpTools tools;

    @BeforeEach
    void setUp() {
        tools = new DdemachimMcpTools(
                placeQueryService, crowdingService, routeComparisonService, coursePreviewService,
                aiPlaceSearchService, aiCourseService);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void searchPlaces_delegatesCatalogFiltersAndReturnsPageMetadata() {
        when(aiPlaceSearchService.search(any()))
                .thenReturn(new AiPlaceSearchService.SearchResult(List.of()));

        var response = tools.searchPlaces(new DdemachimMcpTools.SearchPlacesRequest(
                "경복궁", "종로구", List.of("CAFE"), java.time.LocalDate.of(2026, 8, 21), 20));

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.result().places()).isEmpty();
        verify(aiPlaceSearchService).search(any());
    }

    @Test
    void searchPlaces_returnsDeterministicDatabaseFailureWithoutRetrying() {
        when(aiPlaceSearchService.search(any()))
                .thenThrow(new InvalidDataAccessResourceUsageException("duplicate order by"));

        var response = tools.searchPlaces(new DdemachimMcpTools.SearchPlacesRequest(
                "촬영지", "종로구", List.of(), null, 20));

        assertThat(response.isSuccess()).isFalse();
        assertThat(response.code()).isEqualTo("MCP500");
        verify(aiPlaceSearchService, times(1)).search(any());
    }

    @Test
    void getCrowding_resolvesPlaceCoordinatesAndDelegatesPointRequest() {
        PlaceDetailResponse place = org.mockito.Mockito.mock(PlaceDetailResponse.class);
        when(place.latitude()).thenReturn(37.5759);
        when(place.longitude()).thenReturn(126.9768);
        when(placeQueryService.getDetail(101L)).thenReturn(place);
        CrowdingResponse.Point point = new CrowdingResponse.Point(
                "place:101", true, "G-1", 42, CrowdingLevel.NORMAL, "보통", true,
                OffsetDateTime.parse("2026-08-20T16:00:00+09:00"),
                OffsetDateTime.parse("2026-08-20T16:30:00+09:00"));
        when(crowdingService.getPointCrowding(any())).thenReturn(List.of(point));

        var response = tools.getCrowding(new DdemachimMcpTools.CrowdingToolRequest(
                101L, point.slotStart()));

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.result().placeId()).isEqualTo(101L);
        assertThat(response.result().crowding().score()).isEqualTo(42);
    }

    @Test
    void getPlaceDetail_missingPlaceReturnsStructuredDomainError() {
        when(placeQueryService.getDetail(999L)).thenThrow(new PlaceNotFoundException());

        var response = tools.getPlaceDetail(new DdemachimMcpTools.PlaceDetailRequest(999L));

        assertThat(response.isSuccess()).isFalse();
        assertThat(response.code()).isEqualTo("PLACE4041");
        assertThat(response.result()).isNull();
    }

    @Test
    void getTravelTime_filtersExistingComparisonByRequestedMode() {
        PlaceDetailResponse origin = org.mockito.Mockito.mock(PlaceDetailResponse.class);
        PlaceDetailResponse destination = org.mockito.Mockito.mock(PlaceDetailResponse.class);
        when(origin.latitude()).thenReturn(37.57);
        when(origin.longitude()).thenReturn(126.97);
        when(destination.latitude()).thenReturn(37.58);
        when(destination.longitude()).thenReturn(126.98);
        when(placeQueryService.getDetail(1L)).thenReturn(origin);
        when(placeQueryService.getDetail(2L)).thenReturn(destination);
        RouteComparisonResponse comparison = new RouteComparisonResponse(
                java.time.Instant.parse("2026-08-20T07:00:00Z"),
                List.of(new RouteComparisonResponse.RouteOption(
                        RouteMode.WALK, RouteStatus.AVAILABLE, 600, 700, null, null,
                        700, null, List.of())));
        when(routeComparisonService.compare(any())).thenReturn(comparison);

        var response = tools.getTravelTime(new DdemachimMcpTools.TravelTimeRequest(
                1L, 2L, RouteMode.WALK));

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.result().routes()).hasSize(1);
        assertThat(response.result().routes().getFirst().mode()).isEqualTo(RouteMode.WALK);
    }

    @Test
    void createCourse_usesAuthenticatedPrincipalAndFiltersExistingStrategy() {
        SecurityContextHolder.getContext().setAuthentication(
                new MemberAuthentication(42L, List.of()));
        CoursePreviewResponse.Option fast = new CoursePreviewResponse.Option(
                CourseRouteStrategy.FAST, 1, 60, 10, 500, null, null,
                java.time.LocalTime.of(10, 0), java.time.LocalTime.of(11, 0), List.of());
        when(coursePreviewService.preview(any(), any())).thenReturn(new CoursePreviewResponse(
                java.time.Instant.parse("2026-08-20T01:00:00Z"),
                java.time.LocalDate.of(2026, 8, 20), java.time.LocalTime.of(10, 0), List.of(fast)));

        var response = tools.createCourse(new DdemachimMcpTools.CreateCourseRequest(
                java.time.LocalDate.of(2026, 8, 20),
                java.time.LocalTime.of(10, 0),
                new DdemachimMcpTools.CourseStartRequest(
                        com.ddemachim.server.domain.course.enums.CourseStartType.CURRENT_LOCATION,
                        null, 37.57, 126.97),
                List.of(new DdemachimMcpTools.CoursePlaceRequest(9L, 60, null)),
                CourseRouteStrategy.FAST));

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.result().options()).singleElement()
                .extracting(CoursePreviewResponse.Option::strategy)
                .isEqualTo(CourseRouteStrategy.FAST);
    }

    @Test
    void createCourse_withoutAuthentication_returnsStructuredError() {
        var response = tools.createCourse(new DdemachimMcpTools.CreateCourseRequest(
                java.time.LocalDate.of(2026, 8, 20),
                java.time.LocalTime.of(10, 0),
                new DdemachimMcpTools.CourseStartRequest(
                        com.ddemachim.server.domain.course.enums.CourseStartType.CURRENT_LOCATION,
                        null, 37.57, 126.97),
                List.of(new DdemachimMcpTools.CoursePlaceRequest(9L, 60, null)),
                null));

        assertThat(response.isSuccess()).isFalse();
        assertThat(response.code()).isEqualTo("MCP401");
    }

    @Test
    void nearbySearchWithoutCoordinatesRequestsLocationInsteadOfInventingIt() {
        var response = tools.searchNearbyPlaces(new DdemachimMcpTools.SearchNearbyPlacesRequest(
                null, null, "RESTAURANT", 1_000, "맛집", true, 10, null));

        assertThat(response.isSuccess()).isFalse();
        assertThat(response.code()).isEqualTo("MCP400");
        assertThat(response.message()).contains("현재 위치", "지역/역");
        verify(aiPlaceSearchService, times(0)).searchNearby(any());
    }

    @Test
    void aiCourseDoesNotRequireAuthenticationOrBasketItems() {
        var request = new com.ddemachim.server.domain.course.dto.AiCourseRequest(
                java.time.LocalDate.of(2026, 8, 21), java.time.LocalTime.of(14, 0),
                new com.ddemachim.server.domain.course.dto.AiCourseRequest.StartLocation(
                        37.577, 126.972, "경복궁역"),
                240, List.of(31L), List.of(42L),
                com.ddemachim.server.domain.course.dto.AiCourseRequest.RoutePreference.FAST,
                com.ddemachim.server.domain.course.dto.AiCourseRequest.SchedulePreference.RELAXED);
        when(aiCourseService.create(request)).thenReturn(null);

        var response = tools.createAiCourse(request);

        assertThat(response.isSuccess()).isTrue();
        verify(aiCourseService).create(request);
    }
}
