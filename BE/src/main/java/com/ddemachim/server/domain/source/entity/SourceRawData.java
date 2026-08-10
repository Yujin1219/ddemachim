package com.ddemachim.server.domain.source.entity;

import com.ddemachim.server.domain.place.entity.PlaceSource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 모든 API/CSV 원본 응답 보존(raw -> staging 단계 추적, 재현/디버깅용). data-pipeline이 적재하는 감사(audit) 로그 성격의 테이블. */
@Entity
@Table(name = "source_raw_data")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SourceRawData {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30)
    private String source;

    @Column(nullable = false, columnDefinition = "text")
    private String endpoint;

    @Column(name = "requested_at", nullable = false)
    private OffsetDateTime requestedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "query_condition", columnDefinition = "jsonb")
    private String queryCondition;

    private Integer page;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_payload", nullable = false, columnDefinition = "jsonb")
    private String rawPayload;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "place_source_id")
    private PlaceSource placeSource;
}
