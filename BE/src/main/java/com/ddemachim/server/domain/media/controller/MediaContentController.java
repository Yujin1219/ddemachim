package com.ddemachim.server.domain.media.controller;

import com.ddemachim.server.domain.media.dto.FilmingLocationResponse;
import com.ddemachim.server.domain.media.dto.FilmingWorkSummaryResponse;
import com.ddemachim.server.domain.media.dto.MediaContentDetailResponse;
import com.ddemachim.server.domain.media.dto.MediaContentSummaryResponse;
import com.ddemachim.server.domain.media.service.MediaQueryService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "작품(MediaContent)", description = "TMDB에서 매칭된 영화/드라마 작품 조회 API")
@RestController
@RequestMapping("/api/media-contents")
@RequiredArgsConstructor
public class MediaContentController {

    private final MediaQueryService mediaQueryService;

    @Operation(summary = "작품 목록 조회", description = "TMDB와 매칭된 영화/드라마 작품 목록을 페이지 단위로 조회합니다.")
    @GetMapping
    public ApiResponse<Page<MediaContentSummaryResponse>> search(Pageable pageable) {
        return ApiResponse.onSuccess(mediaQueryService.search(pageable));
    }

    @Operation(
            summary = "작품별 촬영지 목록 조회",
            description = "자동 확정된 촬영지 매칭을 작품 단위로 묶어 대표 장소와 함께 페이지로 반환합니다.")
    @GetMapping("/filming-works")
    public ApiResponse<Page<FilmingWorkSummaryResponse>> getFilmingWorks(
            @Parameter(description = "DRAMA, VARIETY, MOVIE")
                    @RequestParam(required = false)
                    String contentType,
            @Parameter(description = "작품 제목 검색 키워드 (부분 일치)")
                    @RequestParam(required = false)
                    String keyword,
            Pageable pageable) {
        return ApiResponse.onSuccess(mediaQueryService.getFilmingWorks(contentType, keyword, pageable));
    }

    @Operation(
            summary = "작품 상세 조회",
            description = "작품 id로 상세 정보(원제, 줄거리, 감독·출연진 크레딧 등)를 조회합니다. "
                    + "크레딧은 감독을 먼저, 출연진은 출연 순서 오름차순(순서가 없으면 뒤)으로 반환합니다. "
                    + "존재하지 않는 id면 404를 반환합니다.")
    @GetMapping("/{id}")
    public ApiResponse<MediaContentDetailResponse> getDetail(
            @Parameter(description = "작품 id (media_content.id)") @PathVariable Long id) {
        return ApiResponse.onSuccess(mediaQueryService.getDetail(id));
    }

    @Operation(
            summary = "작품별 촬영지 목록 조회",
            description = "해당 작품이 촬영된 장소 목록을 조회합니다. TMDB 매칭 신뢰도가 낮아 검토 대기 중인 항목은 제외하고, "
                    + "자동 확정(AUTO_MATCH)된 촬영지만 반환합니다.")
    @GetMapping("/{mediaContentId}/filming-locations")
    public ApiResponse<List<FilmingLocationResponse>> getFilmingLocations(
            @Parameter(description = "작품 id (media_content.id)") @PathVariable Long mediaContentId) {
        return ApiResponse.onSuccess(mediaQueryService.getFilmingLocationsByMediaContent(mediaContentId));
    }
}
