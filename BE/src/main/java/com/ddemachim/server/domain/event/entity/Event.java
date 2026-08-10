package com.ddemachim.server.domain.event.entity;

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
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.locationtech.jts.geom.Point;

/** 기간이 있는 전시/축제/행사/팝업. place와 달리 상시 존재하는 공간이 아니라서 별도 테이블로 분리. */
@Entity
@Table(name = "event", uniqueConstraints = @UniqueConstraint(columnNames = {"source", "source_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 장소명이 place와 정확히 매칭될 때만 연결. 매칭 안 되면 null(venueName 원문으로 표시). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "place_id")
    private Place place;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(name = "event_type", length = 30)
    private String eventType;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(nullable = false, length = 30)
    private String source;

    @Column(name = "source_id", nullable = false, length = 100)
    private String sourceId;

    @Column(name = "venue_name", columnDefinition = "text")
    private String venueName;

    @Column(name = "org_name", length = 200)
    private String orgName;

    @Column(name = "use_target", columnDefinition = "text")
    private String useTarget;

    @Column(name = "use_fee", columnDefinition = "text")
    private String useFee;

    @Column(columnDefinition = "text")
    private String inquiry;

    @Column(name = "homepage_url", columnDefinition = "text")
    private String homepageUrl;

    @Column(name = "main_image", columnDefinition = "text")
    private String mainImage;

    @Column(name = "apply_date")
    private LocalDate applyDate;

    @Column(name = "event_time", columnDefinition = "text")
    private String eventTime;

    @Column(name = "detail_url", columnDefinition = "text")
    private String detailUrl;

    @Column(columnDefinition = "geometry(Point,4326)")
    private Point location;
}
