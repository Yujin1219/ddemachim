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
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/** 장소별 메뉴 정보. */
@Entity
@Table(
        name = "place_menu",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_place_menu_source_menu",
                columnNames = {"source", "source_menu_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlaceMenu {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    @Column(nullable = false, length = 30)
    private String source;

    @Column(name = "source_menu_id", nullable = false, length = 100)
    private String sourceMenuId;

    @Column(name = "menu_name", nullable = false, length = 255)
    private String menuName;

    @Column(name = "menu_price")
    private Integer menuPrice;

    @Column(name = "image_url", columnDefinition = "text")
    private String imageUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
