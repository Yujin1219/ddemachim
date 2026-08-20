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
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 장소별 메뉴 정보. */
@Entity
@Table(name = "place_menu")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlaceMenu {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    @Column(name = "menu_name", nullable = false, length = 255)
    private String menuName;

    @Column(name = "menu_price")
    private Integer menuPrice;

    @Column(name = "image_url", columnDefinition = "text")
    private String imageUrl;
}
