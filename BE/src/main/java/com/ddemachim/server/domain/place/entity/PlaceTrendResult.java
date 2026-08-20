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
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(
        name = "place_trend_result",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_place_trend_result_run_place",
                columnNames = {"run_id", "place_id"}),
        indexes = {
            @Index(name = "idx_place_trend_result_place", columnList = "place_id"),
            @Index(name = "idx_place_trend_result_expiry", columnList = "expires_at")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlaceTrendResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private BlogTrendRun run;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private PlaceTrendStatus status;

    @Column(name = "recent_interest_average")
    private Double recentInterestAverage;

    @Column(name = "previous_interest_average")
    private Double previousInterestAverage;

    @Column(name = "interest_change_percent")
    private Double interestChangePercent;

    @Column(name = "measured_at", nullable = false)
    private OffsetDateTime measuredAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
