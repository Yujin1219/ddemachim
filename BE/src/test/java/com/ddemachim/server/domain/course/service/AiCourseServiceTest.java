package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.place.entity.Place;
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
        ArgumentCaptor<List<CoursePreviewInputResolver.ResolvedPlace>> resolved = ArgumentCaptor.forClass(List.class);
        verify(planner).previewResolved(any(), resolved.capture());
        assertThat(resolved.getValue()).allSatisfy(place -> {
            assertThat(place.basketItemId()).isNull();
            assertThat(place.placeId()).isIn(31L, 42L);
        });
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
}
