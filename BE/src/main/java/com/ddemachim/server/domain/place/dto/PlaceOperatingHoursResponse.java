package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.PlaceOperatingHours;
import java.time.LocalTime;

/** 요일별 구조화된 영업시간. dayOfWeek: 0=월 .. 6=일. */
public record PlaceOperatingHoursResponse(
        short dayOfWeek, LocalTime openTime, LocalTime closeTime, boolean closed) {

    public static PlaceOperatingHoursResponse from(PlaceOperatingHours hours) {
        return new PlaceOperatingHoursResponse(
                hours.getDayOfWeek(), hours.getOpenTime(), hours.getCloseTime(), hours.isClosed());
    }
}
