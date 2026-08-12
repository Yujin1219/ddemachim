package com.ddemachim.server.domain.event.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.event.dto.EventDetailResponse;
import com.ddemachim.server.domain.event.dto.EventSummaryResponse;
import com.ddemachim.server.domain.event.entity.Event;
import com.ddemachim.server.domain.event.exception.EventNotFoundException;
import com.ddemachim.server.domain.event.repository.EventRepository;
import com.ddemachim.server.domain.place.entity.Place;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class EventQueryServiceTest {

    @Mock
    private EventRepository eventRepository;

    @InjectMocks
    private EventQueryService eventQueryService;

    @Test
    void findEvents_mapsSummaryDecisionFields() {
        Pageable pageable = PageRequest.of(0, 10);
        Event event = mock(Event.class);
        when(eventRepository.search("전시", pageable))
                .thenReturn(new PageImpl<>(List.of(event), pageable, 1));
        when(event.getUseFee()).thenReturn("무료");
        when(event.getApplyDate()).thenReturn(LocalDate.of(2026, 8, 10));
        when(event.getEventTime()).thenReturn("10:00-18:00");

        EventSummaryResponse result = eventQueryService.findEvents("전시", pageable)
                .getContent()
                .get(0);

        assertThat(result.useFee()).isEqualTo("무료");
        assertThat(result.applyDate()).isEqualTo(LocalDate.of(2026, 8, 10));
        assertThat(result.eventTime()).isEqualTo("10:00-18:00");
        verify(eventRepository).search("전시", pageable);
    }

    @Test
    void findEvent_mapsDetailFieldsAndLinkedPlace() {
        Event event = mock(Event.class);
        Place place = mock(Place.class);
        when(eventRepository.findById(42L)).thenReturn(Optional.of(event));
        when(event.getId()).thenReturn(42L);
        when(event.getTitle()).thenReturn("서울 전시");
        when(event.getEventType()).thenReturn("EXHIBITION");
        when(event.getStartDate()).thenReturn(LocalDate.of(2026, 8, 12));
        when(event.getEndDate()).thenReturn(LocalDate.of(2026, 8, 31));
        when(event.getVenueName()).thenReturn("서울시립미술관");
        when(event.getMainImage()).thenReturn("https://example.com/event.jpg");
        when(event.getLocation())
                .thenReturn(new GeometryFactory().createPoint(new Coordinate(126.9784, 37.5667)));
        when(event.getPlace()).thenReturn(place);
        when(place.getId()).thenReturn(7L);
        when(place.getName()).thenReturn("서울시립미술관");
        when(event.getOrgName()).thenReturn("서울시");
        when(event.getUseTarget()).thenReturn("누구나");
        when(event.getUseFee()).thenReturn("무료");
        when(event.getInquiry()).thenReturn("02-000-0000");
        when(event.getHomepageUrl()).thenReturn("https://example.com");
        when(event.getApplyDate()).thenReturn(LocalDate.of(2026, 8, 10));
        when(event.getEventTime()).thenReturn("10:00-18:00");
        when(event.getDetailUrl()).thenReturn("https://example.com/detail");

        EventDetailResponse result = eventQueryService.findEvent(42L);

        assertThat(result.id()).isEqualTo(42L);
        assertThat(result.title()).isEqualTo("서울 전시");
        assertThat(result.startDate()).isEqualTo(LocalDate.of(2026, 8, 12));
        assertThat(result.endDate()).isEqualTo(LocalDate.of(2026, 8, 31));
        assertThat(result.latitude()).isEqualTo(37.5667);
        assertThat(result.longitude()).isEqualTo(126.9784);
        assertThat(result.placeId()).isEqualTo(7L);
        assertThat(result.placeName()).isEqualTo("서울시립미술관");
        assertThat(result.orgName()).isEqualTo("서울시");
        assertThat(result.useFee()).isEqualTo("무료");
        assertThat(result.eventTime()).isEqualTo("10:00-18:00");
        assertThat(result.detailUrl()).isEqualTo("https://example.com/detail");
        verify(eventRepository).findById(42L);
    }

    @Test
    void findEvent_throwsEventNotFoundWhenIdDoesNotExist() {
        when(eventRepository.findById(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> eventQueryService.findEvent(404L))
                .isInstanceOf(EventNotFoundException.class);
    }
}
