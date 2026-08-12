package com.ddemachim.server.domain.media.dto;

import com.ddemachim.server.domain.media.entity.MediaContent;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

@Schema(description = "작품별 촬영지 목록 카드 응답")
public record FilmingWorkSummaryResponse(
        Long mediaId,
        String title,
        String mediaType,
        List<String> contentTypes,
        String posterPath,
        LocalDate releaseDate,
        long filmingPlaceCount,
        List<RepresentativePlace> representativePlaces) {

    public static FilmingWorkSummaryResponse of(
            MediaContent mediaContent,
            List<String> contentTypes,
            long filmingPlaceCount,
            List<RepresentativePlace> representativePlaces) {
        return new FilmingWorkSummaryResponse(
                mediaContent.getId(),
                mediaContent.getTitle(),
                mediaContent.getMediaType(),
                contentTypes,
                mediaContent.getPosterPath(),
                mediaContent.getReleaseDate(),
                filmingPlaceCount,
                representativePlaces);
    }

    @Schema(description = "카드에 미리 보여줄 대표 촬영 장소")
    public record RepresentativePlace(Long placeId, String placeName, String thumbnailUrl) {}
}
