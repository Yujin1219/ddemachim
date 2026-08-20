package com.ddemachim.server.domain.place.entity;

import com.ddemachim.server.domain.place.enums.BlogTrendRunStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(
        name = "blog_trend_run",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_blog_trend_run_week",
                columnNames = "run_week"),
        indexes = @Index(name = "idx_blog_trend_run_week", columnList = "run_week"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BlogTrendRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_week", nullable = false)
    private LocalDate runWeek;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private BlogTrendRunStatus status;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    @Column(name = "processed_place_count", nullable = false)
    private int processedPlaceCount;

    @Column(name = "result_count", nullable = false)
    private int resultCount;

    @Column(name = "failure_reason", columnDefinition = "text")
    private String failureReason;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
