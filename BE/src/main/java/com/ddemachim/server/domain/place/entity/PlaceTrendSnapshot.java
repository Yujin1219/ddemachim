package com.ddemachim.server.domain.place.entity;

import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
        name = "place_trend_snapshot",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_place_trend_snapshot_identity",
                columnNames = {"place_id", "snapshot_date"}),
        indexes = {
            @Index(
                    name = "idx_place_trend_snapshot_status_date",
                    columnList = "status, snapshot_date"),
            @Index(
                    name = "idx_place_trend_snapshot_place_date",
                    columnList = "place_id, snapshot_date")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlaceTrendSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    @Column(name = "snapshot_date", nullable = false)
    private LocalDate snapshotDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PlaceTrendStatus status;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]")
    private String[] aliases;

    @Column(name = "unique_posts", nullable = false)
    private int uniquePosts;

    @Column(name = "unique_authors", nullable = false)
    private int uniqueAuthors;

    @Column(name = "unique_queries", nullable = false)
    private int uniqueQueries;

    @Column(name = "unique_intent_categories", nullable = false)
    private int uniqueIntentCategories;

    @Column(name = "collection_days", nullable = false)
    private int collectionDays;

    @Column(name = "recent_observed_posts", nullable = false)
    private int recentObservedPosts;

    @Column(name = "average_observed_rank")
    private Double averageObservedRank;

    @Column(name = "first_observed_at")
    private OffsetDateTime firstObservedAt;

    @Column(name = "latest_observed_at")
    private OffsetDateTime latestObservedAt;

    @Column(name = "ad_suspected_ratio", nullable = false)
    private double adSuspectedRatio;

    @Column(name = "minimum_evidence_passed", nullable = false)
    private boolean minimumEvidencePassed;

    @Column(name = "watch_signal_count", nullable = false)
    private int watchSignalCount;

    @Column(name = "trend_available", nullable = false)
    private boolean trendAvailable;

    @Column(name = "trend_rising", nullable = false)
    private boolean trendRising;

    @Column(name = "trend_ratio")
    private Double trendRatio;

    @Column(name = "recent_trend_value")
    private Double recentTrendValue;

    @Column(name = "previous_trend_value")
    private Double previousTrendValue;

    @Column(name = "recent_nonzero_observations")
    private Integer recentNonzeroObservations;

    @Column(name = "baseline_nonzero_observations")
    private Integer baselineNonzeroObservations;

    @Column(name = "trend_reason", length = 80)
    private String trendReason;

    @Column(name = "trend_checked_at")
    private OffsetDateTime trendCheckedAt;

    @Column(nullable = false, columnDefinition = "text")
    private String semantics;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
