package com.ddemachim.server.domain.place.controller;

import com.ddemachim.server.domain.place.dto.PlaceDetailResponse;
import com.ddemachim.server.domain.place.dto.PlaceMapResponse;
import com.ddemachim.server.domain.place.dto.PlaceSummaryResponse;
import com.ddemachim.server.domain.place.service.PlaceQueryService;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "장소(Place)", description = "종로구 장소(음식점/카페/관광지 등) 조회 API")
@RestController
@RequestMapping("/api/places")
@RequiredArgsConstructor
public class PlaceController {

    private final PlaceQueryService placeQueryService;

    @Operation(
            summary = "장소 목록 조회",
            description = "카테고리/자치구/이름 키워드로 필터링해 장소 목록을 페이지 단위로 조회합니다. "
                    + "필터 파라미터는 전부 선택값이며, 비워두면 전체 대상으로 조회합니다.")
    @GetMapping
    public ApiResponse<Page<PlaceSummaryResponse>> search(
            @Parameter(description = "카테고리 코드 (예: RESTAURANT, CAFE 또는 CAFE,DESSERT 등 place_category.code 값)")
            @RequestParam(required = false) String category,
            @Parameter(description = "자치구명 (예: 종로구)")
            @RequestParam(required = false) String district,
            @Parameter(description = "태그 코드 (예: FILMING_LOCATION)")
            @RequestParam(required = false) String tag,
            @Parameter(description = "장소명 검색 키워드 (부분 일치)")
            @RequestParam(required = false) String keyword,
            Pageable pageable) {
        return ApiResponse.onSuccess(placeQueryService.search(category, district, tag, keyword, pageable));
    }

    @Operation(
            summary = "지도 영역 내 장소 조회",
            description = "지도에 표시할 장소를 위도/경도 bbox 범위로 조회합니다. "
                    + "좌표가 없는 장소는 제외되며, limit을 비우면 최대 300건을 반환합니다.")
    @GetMapping("/map")
    public ApiResponse<List<PlaceMapResponse>> getPlacesInBounds(
            @Parameter(description = "카테고리 코드 (예: RESTAURANT, CAFE)")
                    @RequestParam(required = false) String category,
            @Parameter(description = "태그 코드 (예: FILMING_LOCATION)")
                    @RequestParam(required = false) String tag,
            @Parameter(description = "최소 위도 (-90 이상)") @RequestParam Double minLat,
            @Parameter(description = "최대 위도 (90 이하)") @RequestParam Double maxLat,
            @Parameter(description = "최소 경도 (-180 이상)") @RequestParam Double minLng,
            @Parameter(description = "최대 경도 (180 이하)") @RequestParam Double maxLng,
            @Parameter(description = "최대 반환 건수 (기본 300, 최대 500)")
                    @RequestParam(required = false) Integer limit) {
        return ApiResponse.onSuccess(
                placeQueryService.getPlacesInBounds(category, tag, minLat, maxLat, minLng, maxLng, limit));
    }

    @Operation(
            summary = "장소 상세 조회",
            description = "장소 id로 상세 정보(주소, 연락처, 설명, 운영시간, 이미지 목록 등)를 조회합니다. "
                    + "존재하지 않는 id면 404를 반환합니다.")
    @GetMapping("/{id}")
    public ApiResponse<PlaceDetailResponse> getDetail(
            @Parameter(description = "장소 id") @PathVariable Long id) {
        return ApiResponse.onSuccess(placeQueryService.getDetail(id));
    }
}
