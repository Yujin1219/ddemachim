package com.ddemachim.server.domain.media.controller;

import com.ddemachim.server.domain.media.dto.FilmingLocationResponse;
import com.ddemachim.server.domain.media.service.MediaQueryService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "촬영지(FilmingLocation)", description = "촬영 장면 상세 조회 API")
@RestController
@RequestMapping("/api/filming-locations")
@RequiredArgsConstructor
public class FilmingLocationDetailController {

    private final MediaQueryService mediaQueryService;

    @Operation(summary = "촬영 장면 상세 조회", description = "촬영지 매칭 id로 작품, 장소, 장면 설명을 조회합니다.")
    @GetMapping("/{id}")
    public ApiResponse<FilmingLocationResponse> getDetail(
            @Parameter(description = "촬영지 매칭 id") @PathVariable Long id) {
        return ApiResponse.onSuccess(mediaQueryService.getFilmingLocation(id));
    }
}
