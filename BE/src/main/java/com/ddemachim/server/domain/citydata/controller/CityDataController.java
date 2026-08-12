package com.ddemachim.server.domain.citydata.controller;

import com.ddemachim.server.domain.citydata.dto.CityDataCongestionResponse;
import com.ddemachim.server.domain.citydata.service.CityDataCongestionService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "서울 실시간 도시데이터(CityData)", description = "서울시 주요장소 혼잡도 캐시 조회 API")
@RestController
@RequestMapping("/api/citydata")
@RequiredArgsConstructor
public class CityDataController {

    private final CityDataCongestionService cityDataCongestionService;

    @Operation(
            summary = "종로구 주요장소 현재 혼잡도 조회",
            description = "서울시 실시간 도시데이터를 백엔드 메모리 캐시에서 조회합니다. "
                    + "캐시는 서버에서 5분마다 갱신하며, 서울시 API 키가 없거나 갱신이 지연되면 stale=true를 반환합니다.")
    @GetMapping("/congestion/jongno")
    public ApiResponse<CityDataCongestionResponse> getJongnoCongestion() {
        return ApiResponse.onSuccess(cityDataCongestionService.getJongnoCongestion());
    }
}
