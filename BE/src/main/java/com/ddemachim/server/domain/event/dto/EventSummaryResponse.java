package com.ddemachim.server.domain.event.dto;

import com.ddemachim.server.domain.event.entity.Event;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.LocalTime;

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
        String placeName,
        String useFee,
        LocalDate applyDate,
        String eventTime,
        @Schema(
                description = "Asia/Seoul 기준 행사 시작 시각. 원문에서 보수적으로 파악한 첫 시작 시각이며 없으면 null입니다.",
                example = "10:00:00")
        LocalTime eventStartTime,
        @Schema(
                description = "Asia/Seoul 기준 행사 종료 시각. 명시적인 종료 범위 또는 '까지' 표현에서만 추출하며 없으면 null입니다.",
                example = "18:00:00")
        LocalTime eventEndTime) {

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
                event.getPlace() != null ? event.getPlace().getName() : null,
                event.getUseFee(),
                event.getApplyDate(),
                event.getEventTime(),
                event.getEventStartTime(),
                event.getEventEndTime());
    }
}
