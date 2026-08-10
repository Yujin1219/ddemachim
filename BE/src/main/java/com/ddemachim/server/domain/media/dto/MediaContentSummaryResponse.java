package com.ddemachim.server.domain.media.dto;

import com.ddemachim.server.domain.media.entity.MediaContent;
import java.time.LocalDate;

/** 작품 목록 조회용 응답. */
public record MediaContentSummaryResponse(
        Long id,
        Integer tmdbId,
        String mediaType,
        String title,
        String posterPath,
        LocalDate releaseDate) {

    public static MediaContentSummaryResponse from(MediaContent mediaContent) {
        return new MediaContentSummaryResponse(
                mediaContent.getId(),
                mediaContent.getTmdbId(),
                mediaContent.getMediaType(),
                mediaContent.getTitle(),
                mediaContent.getPosterPath(),
                mediaContent.getReleaseDate());
    }
}
