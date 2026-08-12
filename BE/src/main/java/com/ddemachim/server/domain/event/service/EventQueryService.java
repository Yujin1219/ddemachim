package com.ddemachim.server.domain.event.service;

import com.ddemachim.server.domain.event.dto.EventDetailResponse;
import com.ddemachim.server.domain.event.dto.EventSummaryResponse;
import com.ddemachim.server.domain.event.entity.Event;
import com.ddemachim.server.domain.event.enums.EventStatus;
import com.ddemachim.server.domain.event.enums.EventSortMode;
import com.ddemachim.server.domain.event.exception.InvalidEventCoordinatesException;
import com.ddemachim.server.domain.event.exception.EventNotFoundException;
import com.ddemachim.server.domain.event.repository.EventRepository;
import java.time.LocalDate;
import java.time.ZoneId;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EventQueryService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Seoul");

    private final EventRepository eventRepository;

    public Page<EventSummaryResponse> findEvents(String keyword, Pageable pageable) {
        return findEvents(keyword, null, null, null, null, pageable);
    }

    public Page<EventSummaryResponse> findEvents(String keyword, String status, Pageable pageable) {
        return findEvents(keyword, status, null, null, null, pageable);
    }

    public Page<EventSummaryResponse> findEvents(
            String keyword,
            String status,
            String sortMode,
            String latitude,
            String longitude,
            Pageable pageable) {
        EventStatus eventStatus = EventStatus.from(status);
        EventSortMode eventSortMode = EventSortMode.from(sortMode);
        LocalDate businessDate = LocalDate.now(BUSINESS_ZONE);
        String statusName = eventStatus == null ? null : eventStatus.name();

        if (eventSortMode == null) {
            return eventRepository.searchByStartDate(keyword, statusName, businessDate, pageable)
                    .map(EventSummaryResponse::from);
        }
        if (eventSortMode == EventSortMode.LATEST) {
            return eventRepository.searchByLatestApplyDate(keyword, statusName, businessDate, pageable)
                    .map(EventSummaryResponse::from);
        }

        Coordinates coordinates = parseCoordinates(latitude, longitude);
        return eventRepository.searchByNearestLocation(
                        keyword,
                        statusName,
                        businessDate,
                        coordinates.latitude(),
                        coordinates.longitude(),
                        pageable)
                .map(EventSummaryResponse::from);
    }

    public EventDetailResponse findEvent(Long id) {
        Event event = eventRepository.findById(id).orElseThrow(EventNotFoundException::new);
        return EventDetailResponse.from(event);
    }

    private Coordinates parseCoordinates(String latitudeText, String longitudeText) {
        if (latitudeText == null || longitudeText == null
                || latitudeText.isBlank() || longitudeText.isBlank()) {
            throw new InvalidEventCoordinatesException();
        }

        try {
            double latitude = Double.parseDouble(latitudeText.trim());
            double longitude = Double.parseDouble(longitudeText.trim());
            if (!isLatitude(latitude) || !isLongitude(longitude)) {
                throw new InvalidEventCoordinatesException();
            }
            return new Coordinates(latitude, longitude);
        } catch (NumberFormatException exception) {
            throw new InvalidEventCoordinatesException();
        }
    }

    private boolean isLatitude(double latitude) {
        return Double.isFinite(latitude) && latitude >= -90 && latitude <= 90;
    }

    private boolean isLongitude(double longitude) {
        return Double.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    }

    private record Coordinates(double latitude, double longitude) {}
}
