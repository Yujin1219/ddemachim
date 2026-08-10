package com.ddemachim.server.domain.event.dto;

import com.ddemachim.server.domain.event.entity.Event;
import java.time.LocalDate;

public record EventSummaryResponse(
        Long id,
        String title,
        String eventType,
        LocalDate startDate,
        LocalDate endDate,
        String venueName,
        String mainImage,
        Double latitude,
        Double longitude,
        Long placeId,
        String placeName) {

    public static EventSummaryResponse from(Event event) {
        return new EventSummaryResponse(
                event.getId(),
                event.getTitle(),
                event.getEventType(),
                event.getStartDate(),
                event.getEndDate(),
                event.getVenueName(),
                event.getMainImage(),
                event.getLocation() != null ? event.getLocation().getY() : null,
                event.getLocation() != null ? event.getLocation().getX() : null,
                event.getPlace() != null ? event.getPlace().getId() : null,
                event.getPlace() != null ? event.getPlace().getName() : null);
    }
}
