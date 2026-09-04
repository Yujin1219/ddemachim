package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceCategory;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.mockito.ArgumentCaptor;

class AiCourseServiceTest {

    @Test
    void rejectsMoreThanTwentyDistinctPlacesBeforeDatabaseLookup() {
        PlaceRepository places = mock(PlaceRepository.class);
        PlaceOperatingHoursRepository hours = mock(PlaceOperatingHoursRepository.class);
        CoursePreviewService planner = mock(CoursePreviewService.class);
        AiCourseService service = new AiCourseService(places, hours, planner);
        List<Long> placeIds = java.util.stream.LongStream.rangeClosed(1, 21).boxed().toList();

        assertThatThrownBy(() -> service.create(new AiCourseRequest(
                LocalDate.of(2026, 8, 24), LocalTime.of(10, 0),
                new AiCourseRequest.StartLocation(37.570, 126.970, "출발지"), 600,
                List.of(), placeIds,
                AiCourseRequest.RoutePreference.FAST, AiCourseRequest.SchedulePreference.BALANCED)))
                .isInstanceOf(CourseException.class);

        org.mockito.Mockito.verifyNoInteractions(places, hours, planner);
    }

    @Test
    void createsCourseFromPlaceIdsWithoutBasketLookup() {
        PlaceRepository places = mock(PlaceRepository.class);
        PlaceOperatingHoursRepository hours = mock(PlaceOperatingHoursRepository.class);
        CoursePreviewService planner = mock(CoursePreviewService.class);
        Place required = place(31L, "대림미술관", 37.577, 126.972, 90);
        Place candidate = place(42L, "서촌카페", 37.578, 126.973, 60);
        when(places.findAllById(any())).thenReturn(List.of(required, candidate));
        when(hours.findByPlaceIdInAndDayOfWeek(any(), any(Short.class))).thenReturn(List.of());
        CoursePreviewResponse.Stop first = mock(CoursePreviewResponse.Stop.class);
        when(first.sequenceNo()).thenReturn(1);
        when(first.placeId()).thenReturn(31L);
        when(first.placeName()).thenReturn("대림미술관");
        when(first.scheduledArrival()).thenReturn(LocalTime.of(14, 10));
        when(first.scheduledDeparture()).thenReturn(LocalTime.of(15, 40));
        when(first.dwellMinutes()).thenReturn(90);
        CoursePreviewResponse.Option option = new CoursePreviewResponse.Option(
                CourseRouteStrategy.FAST, 1, 100, 10, 700, null, null,
                LocalTime.of(14, 0), LocalTime.of(15, 40), List.of(first));
        when(planner.previewResolved(any(), any())).thenReturn(new CoursePreviewResponse(
                Instant.parse("2026-08-20T00:00:00Z"), LocalDate.of(2026, 8, 21),
                LocalTime.of(14, 0), List.of(option)));

        AiCourseService service = new AiCourseService(places, hours, planner);
        var result = service.create(new AiCourseRequest(
                LocalDate.of(2026, 8, 21), LocalTime.of(14, 0),
                new AiCourseRequest.StartLocation(37.576, 126.971, "경복궁역"), 240,
                List.of(31L), List.of(42L), AiCourseRequest.RoutePreference.FAST,
                AiCourseRequest.SchedulePreference.RELAXED));

        assertThat(result.requiredPlaceIds()).containsExactly(31L);
        assertThat(result.stops()).singleElement().extracting(stop -> stop.placeId()).isEqualTo(31L);
        assertThat(result.preview()).isNotNull();
        assertThat(result.preview().options()).containsExactly(option);
        ArgumentCaptor<List<CoursePreviewInputResolver.ResolvedPlace>> resolved = ArgumentCaptor.forClass(List.class);
        verify(planner).previewResolved(any(), resolved.capture());
        assertThat(resolved.getValue()).allSatisfy(place -> {
            assertThat(place.basketItemId()).isNull();
            assertThat(place.placeId()).isIn(31L, 42L);
        });
    }

    @Test
    void filmingCourseUsesMultipleCategoriesBeforeRepeatingRestaurants() {
        PlaceRepository places = mock(PlaceRepository.class);
        PlaceOperatingHoursRepository hours = mock(PlaceOperatingHoursRepository.class);
        CoursePreviewService planner = mock(CoursePreviewService.class);
        List<Place> candidates = List.of(
                filmingPlace(1L, "식당 1", "RESTAURANT", 126.971),
                filmingPlace(2L, "식당 2", "RESTAURANT", 126.972),
                filmingPlace(3L, "식당 3", "RESTAURANT", 126.973),
                filmingPlace(4L, "식당 4", "RESTAURANT", 126.974),
                filmingPlace(5L, "촬영 카페", "CAFE", 126.990),
                filmingPlace(6L, "촬영 건물", "ETC", 126.991),
                filmingPlace(7L, "촬영 상점", "SHOPPING", 126.992));
        when(places.findAllById(any())).thenReturn(candidates);
        when(hours.findByPlaceIdInAndDayOfWeek(any(), any(Short.class))).thenReturn(List.of());
        CoursePreviewResponse.Stop stop = mock(CoursePreviewResponse.Stop.class);
        when(stop.sequenceNo()).thenReturn(1);
        when(stop.placeId()).thenReturn(1L);
        when(stop.placeName()).thenReturn("코스");
        CoursePreviewResponse.Option option = new CoursePreviewResponse.Option(
                CourseRouteStrategy.FAST, 1, 300, 30, 1000, null, null,
                LocalTime.of(11, 0), LocalTime.of(16, 0), List.of(stop));
        when(planner.previewResolved(any(), any())).thenReturn(new CoursePreviewResponse(
                Instant.parse("2026-08-24T02:00:00Z"), LocalDate.of(2026, 8, 24),
                LocalTime.of(11, 0), List.of(option)));

        AiCourseService service = new AiCourseService(places, hours, planner);
        service.create(new AiCourseRequest(
                LocalDate.of(2026, 8, 24), LocalTime.of(11, 0),
                new AiCourseRequest.StartLocation(37.57, 126.970, "출발지"), 600,
                List.of(), candidates.stream().map(Place::getId).toList(),
                AiCourseRequest.RoutePreference.FAST, AiCourseRequest.SchedulePreference.BALANCED));

        ArgumentCaptor<List<CoursePreviewInputResolver.ResolvedPlace>> selected = ArgumentCaptor.forClass(List.class);
        verify(planner).previewResolved(any(), selected.capture());
        assertThat(selected.getValue()).extracting(item -> item.place().getCategory().getCode())
                .startsWith("ETC", "SHOPPING", "CAFE")
                .hasSize(7);
    }

    @Test
    void selectsMoreThanFiveAiCoursePlacesWhenTheTimeBudgetAllowsThem() {
        PlaceRepository places = mock(PlaceRepository.class);
        PlaceOperatingHoursRepository hours = mock(PlaceOperatingHoursRepository.class);
        CoursePreviewService planner = mock(CoursePreviewService.class);
        List<Place> candidates = List.of(
                place(1L, "장소 1", 37.570, 126.971, 30),
                place(2L, "장소 2", 37.570, 126.972, 30),
                place(3L, "장소 3", 37.570, 126.973, 30),
                place(4L, "장소 4", 37.570, 126.974, 30),
                place(5L, "장소 5", 37.570, 126.975, 30),
                place(6L, "장소 6", 37.570, 126.976, 30));
        when(places.findAllById(any())).thenReturn(candidates);
        when(hours.findByPlaceIdInAndDayOfWeek(any(), any(Short.class))).thenReturn(List.of());
        CoursePreviewResponse.Option option = new CoursePreviewResponse.Option(
                CourseRouteStrategy.FAST, 0, 240, 30, 1000, null, null,
                LocalTime.of(10, 0), LocalTime.of(14, 0), List.of());
        when(planner.previewResolved(any(), any())).thenReturn(new CoursePreviewResponse(
                Instant.parse("2026-08-24T01:00:00Z"), LocalDate.of(2026, 8, 24),
                LocalTime.of(10, 0), List.of(option)));

        AiCourseService service = new AiCourseService(places, hours, planner);
        service.create(new AiCourseRequest(
                LocalDate.of(2026, 8, 24), LocalTime.of(10, 0),
                new AiCourseRequest.StartLocation(37.570, 126.970, "출발지"), 600,
                List.of(), candidates.stream().map(Place::getId).toList(),
                AiCourseRequest.RoutePreference.FAST, AiCourseRequest.SchedulePreference.BALANCED));

        ArgumentCaptor<List<CoursePreviewInputResolver.ResolvedPlace>> selected = ArgumentCaptor.forClass(List.class);
        verify(planner).previewResolved(any(), selected.capture());
        assertThat(selected.getValue()).extracting(CoursePreviewInputResolver.ResolvedPlace::placeId)
                .containsExactly(1L, 2L, 3L, 4L, 5L, 6L);
    }

    private static Place place(long id, String name, double latitude, double longitude, int dwell) {
        Place place = mock(Place.class);
        when(place.getId()).thenReturn(id);
        when(place.getName()).thenReturn(name);
        when(place.getRoadAddress()).thenReturn("서울 종로구");
        when(place.getDefaultDwellMinutes()).thenReturn(dwell);
        GeometryFactory factory = new GeometryFactory(new PrecisionModel(), 4326);
        when(place.getLocation()).thenReturn(factory.createPoint(new Coordinate(longitude, latitude)));
        return place;
    }

    private static Place filmingPlace(long id, String name, String categoryCode, double longitude) {
        Place place = place(id, name, 37.57, longitude, 30);
        PlaceCategory category = mock(PlaceCategory.class);
        when(category.getCode()).thenReturn(categoryCode);
        when(place.getCategory()).thenReturn(category);
        when(place.getTags()).thenReturn(new String[]{"FILMING_LOCATION"});
        return place;
    }
}
