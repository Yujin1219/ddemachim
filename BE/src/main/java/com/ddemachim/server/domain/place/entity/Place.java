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
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

@Entity
@Table(name = "place")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Place {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "normalized_name", nullable = false, length = 200)
    private String normalizedName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private PlaceCategory category;

    @Column(name = "road_address", columnDefinition = "text")
    private String roadAddress;

    @Column(name = "lot_address", columnDefinition = "text")
    private String lotAddress;

    @Column(length = 30)
    private String district;

    @Column(length = 30)
    private String neighborhood;

    /** 좌표(경도, 위도). 좌표 없는 소스로만 만들어진 place는 null일 수 있다. */
    @Column(columnDefinition = "geometry(Point,4326)")
    private Point location;

    @Column(length = 50)
    private String phone;

    @Column(columnDefinition = "text")
    private String website;

    @Column(columnDefinition = "text")
    private String description;

    /** 요일별로 구조화하기 애매한 원문 운영시간(구조화된 값은 PlaceOperatingHours 참고). */
    @Column(name = "operating_hours_raw", columnDefinition = "text")
    private String operatingHoursRaw;

    @Column(name = "operating_days_raw", columnDefinition = "text")
    private String operatingDaysRaw;

    @Column(name = "closed_days_raw", columnDefinition = "text")
    private String closedDaysRaw;

    @Column(name = "transit_info", columnDefinition = "text")
    private String transitInfo;

    @Column(columnDefinition = "text")
    private String accessibility;

    @Column(name = "default_dwell_minutes", nullable = false)
    private Integer defaultDwellMinutes = 60;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]")
    private String[] tags;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
