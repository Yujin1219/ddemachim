package com.ddemachim.server.domain.event.controller;

import com.ddemachim.server.domain.event.dto.EventDetailResponse;
import com.ddemachim.server.domain.event.dto.EventSummaryResponse;
import com.ddemachim.server.domain.event.service.EventQueryService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "문화행사(Event)", description = "TourAPI 축제/공연/행사, 서울시 문화행사 정보 조회 API. 진행중/예정인 행사만 적재되어 있습니다.")
@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
public class EventController {

    private final EventQueryService eventQueryService;

    @Operation(
            summary = "문화행사 목록 조회",
            description = "제목 키워드로 필터링해 문화행사 목록을 시작일 오름차순(가까운 행사부터)으로 페이지 단위 조회합니다.")
    @GetMapping
    public ApiResponse<Page<EventSummaryResponse>> getEvents(
            @Parameter(description = "행사 제목 검색 키워드 (부분 일치)")
            @RequestParam(required = false) String keyword,
            Pageable pageable) {
        return ApiResponse.onSuccess(eventQueryService.findEvents(keyword, pageable));
    }

    @Operation(
            summary = "문화행사 상세 조회",
            description = "행사 id로 상세 정보(주최기관, 이용대상/요금, 문의처, 홈페이지, 상세페이지 URL 등)를 조회합니다. "
                    + "존재하지 않는 id면 404를 반환합니다.")
    @GetMapping("/{id}")
    public ApiResponse<EventDetailResponse> getEvent(
            @Parameter(description = "행사 id") @PathVariable Long id) {
        return ApiResponse.onSuccess(eventQueryService.findEvent(id));
    }
}
