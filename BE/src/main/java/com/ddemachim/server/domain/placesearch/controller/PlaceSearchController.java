package com.ddemachim.server.domain.placesearch.controller;

import com.ddemachim.server.domain.placesearch.dto.KakaoPlaceSearchResponse;
import com.ddemachim.server.domain.placesearch.service.PlaceSearchService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "외부 장소 검색", description = "DB에 저장하지 않는 외부 장소 검색 API")
@RestController
@RequestMapping("/api/place-search")
@RequiredArgsConstructor
public class PlaceSearchController {

    private final PlaceSearchService placeSearchService;

    @Operation(summary = "카카오 장소 검색", description = "카카오 장소를 검색하고 좌표를 반환합니다. 검색만으로 장소를 저장하지 않습니다.")
    @GetMapping("/kakao")
    public ApiResponse<List<KakaoPlaceSearchResponse>> searchKakaoPlaces(
            @Parameter(description = "장소 검색어", example = "경복궁") @RequestParam String query,
            @Parameter(description = "기준 위도", example = "37.5776") @RequestParam(required = false) Double latitude,
            @Parameter(description = "기준 경도", example = "126.9768") @RequestParam(required = false) Double longitude,
            @Parameter(description = "검색 반경(미터)", example = "1000") @RequestParam(required = false) Integer radius) {
        return ApiResponse.onSuccess(placeSearchService.searchKakaoPlaces(query, latitude, longitude, radius));
    }
}
