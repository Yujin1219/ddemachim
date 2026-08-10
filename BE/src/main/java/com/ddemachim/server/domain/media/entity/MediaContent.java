package com.ddemachim.server.domain.media.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** TMDB 작품(영화/드라마) 메타데이터. */
@Entity
@Table(name = "media_content", uniqueConstraints = @UniqueConstraint(columnNames = {"tmdb_id", "media_type"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MediaContent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tmdb_id", nullable = false)
    private Integer tmdbId;

    /** movie / tv */
    @Column(name = "media_type", nullable = false, length = 10)
    private String mediaType;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(name = "original_title", length = 300)
    private String originalTitle;

    /** TMDB 이미지 CDN 상대 경로. https://image.tmdb.org/t/p/{사이즈}/{posterPath}로 조합해서 사용. */
    @Column(name = "poster_path", columnDefinition = "text")
    private String posterPath;

    @Column(columnDefinition = "text")
    private String overview;

    @Column(name = "release_date")
    private LocalDate releaseDate;
}
