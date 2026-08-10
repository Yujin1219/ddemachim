package com.ddemachim.server.domain.place.entity;

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
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** place와 원본 소스(TOURAPI/REDTABLE/SEOUL_TOUR/FILMING_LOCATION 등)의 매핑. place PK를 외부 ID로 쓰지 않기 위한 추적 테이블. */
@Entity
@Table(name = "place_source", uniqueConstraints = @UniqueConstraint(columnNames = {"source", "source_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlaceSource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    @Column(nullable = false, length = 30)
    private String source;

    @Column(name = "source_id", nullable = false, length = 100)
    private String sourceId;

    @Column(name = "has_coordinates", nullable = false)
    private boolean hasCoordinates;

    @Column(name = "last_synced_at", nullable = false)
    private OffsetDateTime lastSyncedAt;
}
