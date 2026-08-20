package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.PlaceMenu;

/** 장소 상세 메뉴 응답. */
public record PlaceMenuResponse(
        Long id,
        String name,
        Integer price,
        String imageUrl) {

    public static PlaceMenuResponse from(PlaceMenu menu) {
        return new PlaceMenuResponse(
                menu.getId(),
                menu.getMenuName(),
                menu.getMenuPrice(),
                menu.getImageUrl());
    }
}
