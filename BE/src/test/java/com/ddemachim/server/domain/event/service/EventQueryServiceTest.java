package com.ddemachim.server.domain.event.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.event.dto.EventDetailResponse;
import com.ddemachim.server.domain.event.dto.EventSummaryResponse;
import com.ddemachim.server.domain.event.entity.Event;
import com.ddemachim.server.domain.event.exception.InvalidEventCoordinatesException;
import com.ddemachim.server.domain.event.exception.InvalidEventSortModeException;
import com.ddemachim.server.domain.event.exception.InvalidEventStatusException;
import com.ddemachim.server.domain.event.exception.EventNotFoundException;
import com.ddemachim.server.domain.event.repository.EventRepository;
import com.ddemachim.server.domain.place.entity.Place;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class EventQueryServiceTest {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Seoul");
    private static final ZonedDateTime FIXED_NOW = ZonedDateTime.of(
            2026, 8, 12, 10, 15, 30, 0, BUSINESS_ZONE);
    private static final LocalDate BUSINESS_DATE = FIXED_NOW.toLocalDate();
    private static final LocalTime BUSINESS_TIME = FIXED_NOW.toLocalTime();

    @Mock
    private EventRepository eventRepository;

    private EventQueryService eventQueryService;

    @BeforeEach
    void setUp() {
        eventQueryService = new EventQueryService(
                eventRepository,
                Clock.fixed(FIXED_NOW.toInstant(), BUSINESS_ZONE));
    }

    @Test
    void findEvents_mapsSummaryDecisionFields() {
        Pageable pageable = PageRequest.of(0, 10);
        Event event = mock(Event.class);
        when(eventRepository.searchByStartDate("전시", null, BUSINESS_DATE, BUSINESS_TIME, pageable))
                .thenReturn(new PageImpl<>(List.of(event), pageable, 1));
        when(event.getUseFee()).thenReturn("무료");
        when(event.getApplyDate()).thenReturn(LocalDate.of(2026, 8, 10));
        when(event.getEventTime()).thenReturn("10:00-18:00");
        when(event.getEventStartTime()).thenReturn(LocalTime.of(10, 0));
        when(event.getEventEndTime()).thenReturn(LocalTime.of(18, 0));

        EventSummaryResponse result = eventQueryService.findEvents("전시", pageable)
                .getContent()
                .get(0);

        assertThat(result.useFee()).isEqualTo("무료");
        assertThat(result.applyDate()).isEqualTo(LocalDate.of(2026, 8, 10));
        assertThat(result.eventTime()).isEqualTo("10:00-18:00");
        assertThat(result.eventStartTime()).isEqualTo(LocalTime.of(10, 0));
        assertThat(result.eventEndTime()).isEqualTo(LocalTime.of(18, 0));
        verify(eventRepository).searchByStartDate("전시", null, BUSINESS_DATE, BUSINESS_TIME, pageable);
    }

    @Test
    void findEvents_withoutStatus_passesNoStatusPredicateAndSeoulBusinessDate() {
        Pageable pageable = PageRequest.of(0, 10);
        when(eventRepository.searchByStartDate(null, null, BUSINESS_DATE, BUSINESS_TIME, pageable))
                .thenReturn(new PageImpl<>(List.of(), pageable, 0));

        Page<EventSummaryResponse> result = eventQueryService.findEvents(null, null, pageable);

        assertThat(result).isEmpty();
        verify(eventRepository).searchByStartDate(null, null, BUSINESS_DATE, BUSINESS_TIME, pageable);
    }

    @Test
    void findEvents_acceptsCaseInsensitiveOngoingStatus() {
        Pageable pageable = PageRequest.of(0, 10);
        when(eventRepository.searchByStartDate(
                        "전시", "ONGOING", BUSINESS_DATE, BUSINESS_TIME, pageable))
                .thenReturn(new PageImpl<>(List.of(), pageable, 0));

        Page<EventSummaryResponse> result = eventQueryService.findEvents("전시", " ongoing ", pageable);

        assertThat(result).isEmpty();
        verify(eventRepository).searchByStartDate(
                "전시", "ONGOING", BUSINESS_DATE, BUSINESS_TIME, pageable);
    }

    @Test
    void findEvents_acceptsEndedStatus() {
        Pageable pageable = PageRequest.of(0, 10);
        when(eventRepository.searchByStartDate(null, "ENDED", BUSINESS_DATE, BUSINESS_TIME, pageable))
                .thenReturn(new PageImpl<>(List.of(), pageable, 0));

        Page<EventSummaryResponse> result = eventQueryService.findEvents(null, "ENDED", pageable);

        assertThat(result).isEmpty();
        verify(eventRepository).searchByStartDate(null, "ENDED", BUSINESS_DATE, BUSINESS_TIME, pageable);
    }

    @Test
    void findEvents_usesLatestApplyDateBranchAndIgnoresCoordinates() {
        Pageable pageable = PageRequest.of(0, 10);
        when(eventRepository.searchByLatestApplyDate("전시", null, BUSINESS_DATE, BUSINESS_TIME, pageable))
                .thenReturn(new PageImpl<>(List.of(), pageable, 0));

        Page<EventSummaryResponse> result = eventQueryService.findEvents(
                "전시", null, " latest ", "not-a-coordinate", "also-not-a-coordinate", pageable);

        assertThat(result).isEmpty();
        verify(eventRepository).searchByLatestApplyDate("전시", null, BUSINESS_DATE, BUSINESS_TIME, pageable);
    }

    @Test
    void findEvents_usesNearestBranchWithValidatedCoordinates() {
        Pageable pageable = PageRequest.of(0, 10);
        when(eventRepository.searchByNearestLocation(
                        "전시", "ONGOING", BUSINESS_DATE, BUSINESS_TIME, 37.5665, 126.9780, pageable))
                .thenReturn(new PageImpl<>(List.of(), pageable, 0));

        Page<EventSummaryResponse> result = eventQueryService.findEvents(
                "전시", " ongoing ", "nearest", "37.5665", "126.9780", pageable);

        assertThat(result).isEmpty();
        verify(eventRepository).searchByNearestLocation(
                "전시", "ONGOING", BUSINESS_DATE, BUSINESS_TIME, 37.5665, 126.9780, pageable);
    }

    @Test
    void findEvents_rejectsInvalidSortModeWithTypedEventException() {
        Pageable pageable = PageRequest.of(0, 10);

        assertThatThrownBy(() -> eventQueryService.findEvents(null, null, "POPULAR", null, null, pageable))
                .isInstanceOf(InvalidEventSortModeException.class);
        verifyNoInteractions(eventRepository);
    }

    @Test
    void findEvents_rejectsMissingMalformedAndOutOfRangeNearestCoordinates() {
        Pageable pageable = PageRequest.of(0, 10);

        assertThatThrownBy(() -> eventQueryService.findEvents(null, null, "NEAREST", "37.5", null, pageable))
                .isInstanceOf(InvalidEventCoordinatesException.class);
        assertThatThrownBy(() -> eventQueryService.findEvents(null, null, "NEAREST", "NaN", "126.9", pageable))
                .isInstanceOf(InvalidEventCoordinatesException.class);
        assertThatThrownBy(() -> eventQueryService.findEvents(null, null, "NEAREST", "91", "126.9", pageable))
                .isInstanceOf(InvalidEventCoordinatesException.class);
        verifyNoInteractions(eventRepository);
    }

    @Test
    void findEvents_rejectsInvalidStatusWithTypedEventException() {
        Pageable pageable = PageRequest.of(0, 10);

        assertThatThrownBy(() -> eventQueryService.findEvents(null, "UPCOMING", pageable))
                .isInstanceOf(InvalidEventStatusException.class);
        verifyNoInteractions(eventRepository);
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
        when(event.getEventStartTime()).thenReturn(LocalTime.of(10, 0));
        when(event.getEventEndTime()).thenReturn(LocalTime.of(18, 0));
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
        assertThat(result.eventStartTime()).isEqualTo(LocalTime.of(10, 0));
        assertThat(result.eventEndTime()).isEqualTo(LocalTime.of(18, 0));
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
