package com.ddemachim.server.domain.media.controller;

import com.ddemachim.server.domain.media.dto.FilmingLocationResponse;
import com.ddemachim.server.domain.media.service.MediaQueryService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "촬영지(FilmingLocation)", description = "장소 ↔ 작품 매칭(촬영지) 조회 API")
@RestController
@RequestMapping("/api/places/{placeId}/filming-locations")
@RequiredArgsConstructor
public class FilmingLocationController {

    private final MediaQueryService mediaQueryService;

    @Operation(
            summary = "장소별 촬영지(출연 작품) 목록 조회",
            description = "해당 장소가 등장한 작품 목록을 조회합니다. TMDB 매칭 신뢰도가 낮아 검토 대기 중인 항목은 제외하고, "
                    + "자동 확정(AUTO_MATCH)된 작품과 원천 촬영지 장면 설명을 반환합니다.")
    @GetMapping
    public ApiResponse<List<FilmingLocationResponse>> getFilmingLocations(
            @Parameter(description = "장소 id (place.id)") @PathVariable Long placeId) {
        return ApiResponse.onSuccess(mediaQueryService.getFilmingLocationsByPlace(placeId));
    }
}
