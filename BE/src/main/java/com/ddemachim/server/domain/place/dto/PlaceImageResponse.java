package com.ddemachim.server.domain.place.dto;

import com.ddemachim.server.domain.place.entity.PlaceImage;

public record PlaceImageResponse(Long id, String source, String sourceUrl, String attribution) {

    public static PlaceImageResponse from(PlaceImage image) {
        return new PlaceImageResponse(
                image.getId(), image.getSource(), image.getSourceUrl(), image.getAttribution());
    }
}
