package com.ddemachim.server.domain.media.entity;

import com.ddemachim.server.domain.place.entity.Place;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Place <-> MediaContent N:M(촬영지-작품), 매칭 신뢰도 포함. */
@Entity
@Table(name = "filming_location", uniqueConstraints = @UniqueConstraint(columnNames = {"source", "source_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FilmingLocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    /** TMDB 매칭 전이면 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "media_content_id")
    private MediaContent mediaContent;

    /** 제목 유사도 기반 매칭 신뢰도(0.000~1.000), 미계산이면 null. */
    @Column(name = "match_confidence", precision = 4, scale = 3)
    private BigDecimal matchConfidence;

    /** AUTO_MATCH / REVIEW_REQUIRED / NO_MATCH */
    @Column(name = "match_status", nullable = false, length = 20)
    private String matchStatus;

    @Column(name = "scene_description")
    private String sceneDescription;

    @Column(nullable = false, length = 30)
    private String source;

    @Column(name = "source_id", nullable = false, length = 100)
    private String sourceId;
}
