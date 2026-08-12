package com.ddemachim.server.domain.media.dto;

import com.ddemachim.server.domain.media.entity.FilmingLocation;
import java.math.BigDecimal;

/** 촬영지-작품 매칭 조회용 응답. */
public record FilmingLocationResponse(
        Long id,
        Long placeId,
        String placeName,
        String contentType,
        MediaContentSummaryResponse mediaContent,
        String sceneDescription,
        String matchStatus,
        BigDecimal matchConfidence) {

    public static FilmingLocationResponse from(FilmingLocation filmingLocation) {
        return new FilmingLocationResponse(
                filmingLocation.getId(),
                filmingLocation.getPlace().getId(),
                filmingLocation.getPlace().getName(),
                filmingLocation.getContentType(),
                filmingLocation.getMediaContent() != null
                        ? MediaContentSummaryResponse.from(filmingLocation.getMediaContent())
                        : null,
                filmingLocation.getSceneDescription(),
                filmingLocation.getMatchStatus(),
                filmingLocation.getMatchConfidence());
    }
}
