package com.ddemachim.server.domain.media.dto;

import com.ddemachim.server.domain.media.entity.MediaContent;
import java.time.LocalDate;
import java.util.List;

/** 작품 상세 조회용 응답. */
public record MediaContentDetailResponse(
        Long id,
        Integer tmdbId,
        String mediaType,
        String title,
        String posterPath,
        LocalDate releaseDate,
        String originalTitle,
        String overview,
        List<MediaCreditResponse> credits) {

    public MediaContentDetailResponse(
            Long id,
            Integer tmdbId,
            String mediaType,
            String title,
            String posterPath,
            LocalDate releaseDate,
            String originalTitle,
            String overview) {
        this(id, tmdbId, mediaType, title, posterPath, releaseDate, originalTitle, overview, List.of());
    }

    public static MediaContentDetailResponse from(MediaContent mediaContent) {
        return from(mediaContent, List.of());
    }

    public static MediaContentDetailResponse from(
            MediaContent mediaContent, List<MediaCreditResponse> credits) {
        return new MediaContentDetailResponse(
                mediaContent.getId(),
                mediaContent.getTmdbId(),
                mediaContent.getMediaType(),
                mediaContent.getTitle(),
                mediaContent.getPosterPath(),
                mediaContent.getReleaseDate(),
                mediaContent.getOriginalTitle(),
                mediaContent.getOverview(),
                credits);
    }
}
