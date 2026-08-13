package com.ddemachim.server.domain.media.dto;

import com.ddemachim.server.domain.media.entity.MediaCredit;
import io.swagger.v3.oas.annotations.media.Schema;

/** 작품 상세에 포함되는 감독·출연진 크레딧 응답. */
@Schema(description = "작품 크레딧 응답")
public record MediaCreditResponse(
        @Schema(description = "인물 식별자", example = "1") Long personId,
        @Schema(description = "TMDB 인물 식별자", example = "500") Integer tmdbPersonId,
        @Schema(description = "TMDB 원본 인물 이름", example = "John Doe") String name,
        @Schema(description = "한글 인물 이름", example = "홍길동", nullable = true) String nameKo,
        @Schema(description = "TMDB 프로필 이미지 상대 경로", example = "/profile.jpg") String profilePath,
        @Schema(description = "크레딧 역할", allowableValues = {"CAST", "DIRECTOR"}) String role,
        @Schema(description = "원본 출연 배역명", example = "John Smith") String characterName,
        @Schema(description = "한글 출연 배역명", example = "주인공", nullable = true) String characterNameKo,
        @Schema(description = "출연 순서", example = "0", nullable = true) Integer castOrder) {

    /** 기존 응답 생성 호출부와의 소스 호환성을 유지한다. */
    public MediaCreditResponse(
            Long personId,
            Integer tmdbPersonId,
            String name,
            String profilePath,
            String role,
            String characterName,
            Integer castOrder) {
        this(personId, tmdbPersonId, name, null, profilePath, role, characterName, null, castOrder);
    }

    /** 한글 인물명이 추가된 기존 응답 생성 호출부와의 소스 호환성을 유지한다. */
    public MediaCreditResponse(
            Long personId,
            Integer tmdbPersonId,
            String name,
            String nameKo,
            String profilePath,
            String role,
            String characterName,
            Integer castOrder) {
        this(personId, tmdbPersonId, name, nameKo, profilePath, role, characterName, null, castOrder);
    }

    public static MediaCreditResponse from(MediaCredit mediaCredit) {
        return new MediaCreditResponse(
                mediaCredit.getPerson().getId(),
                mediaCredit.getPerson().getTmdbPersonId(),
                mediaCredit.getPerson().getName(),
                mediaCredit.getPerson().getNameKo(),
                mediaCredit.getPerson().getProfilePath(),
                mediaCredit.getRole().name(),
                mediaCredit.getCharacterName(),
                mediaCredit.getCharacterNameKo(),
                mediaCredit.getCastOrder());
    }
}
