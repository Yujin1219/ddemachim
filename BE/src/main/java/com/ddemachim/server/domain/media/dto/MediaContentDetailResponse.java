package com.ddemachim.server.domain.media.dto;

import com.ddemachim.server.domain.media.entity.MediaContent;
import java.time.LocalDate;

/** 작품 상세 조회용 응답. */
public record MediaContentDetailResponse(
        Long id,
        Integer tmdbId,
        String mediaType,
        String title,
        String posterPath,
        LocalDate releaseDate,
        String originalTitle,
        String overview) {

    public static MediaContentDetailResponse from(MediaContent mediaContent) {
        return new MediaContentDetailResponse(
                mediaContent.getId(),
                mediaContent.getTmdbId(),
                mediaContent.getMediaType(),
                mediaContent.getTitle(),
                mediaContent.getPosterPath(),
                mediaContent.getReleaseDate(),
                mediaContent.getOriginalTitle(),
                mediaContent.getOverview());
    }
}
