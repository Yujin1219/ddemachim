package com.ddemachim.server.domain.place.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

@Entity
@Table(
        name = "blog_trend_observation",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_blog_trend_observation_identity",
                columnNames = {"collection_date", "query", "post_url"}),
        indexes = {
            @Index(
                    name = "idx_blog_trend_observation_place_date",
                    columnList = "place_id, collection_date"),
            @Index(name = "idx_blog_trend_observation_author", columnList = "author")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BlogTrendObservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    @Column(name = "collection_date", nullable = false)
    private LocalDate collectionDate;

    @Column(nullable = false, length = 300)
    private String query;

    @Column(name = "post_url", nullable = false, columnDefinition = "text")
    private String postUrl;

    @Column(nullable = false, columnDefinition = "text")
    private String author;

    @Column(name = "author_name", length = 200)
    private String authorName;

    @Column(name = "published_at")
    private LocalDate publishedAt;

    @Column(name = "collected_at", nullable = false)
    private OffsetDateTime collectedAt;

    @Column(length = 50)
    private String region;

    @Column(length = 100)
    private String intent;

    @Column(name = "intent_category", length = 30)
    private String intentCategory;

    @Column(name = "search_rank")
    private Integer searchRank;

    @Column(name = "observed_place_name", length = 200)
    private String observedPlaceName;

    @Column(name = "is_ad_suspected", nullable = false)
    private boolean adSuspected;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "ad_signals", columnDefinition = "text[]")
    private String[] adSignals;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
