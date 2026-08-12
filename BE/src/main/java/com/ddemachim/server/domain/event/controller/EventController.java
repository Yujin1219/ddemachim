package com.ddemachim.server.domain.event.controller;

import com.ddemachim.server.domain.event.dto.EventDetailResponse;
import com.ddemachim.server.domain.event.dto.EventSummaryResponse;
import com.ddemachim.server.domain.event.service.EventQueryService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "문화행사(Event)", description = "TourAPI 축제/공연/행사, 서울시 문화행사 정보 조회 API.")
@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
public class EventController {

    private final EventQueryService eventQueryService;

    @Operation(
            summary = "문화행사 목록 조회",
            description = "제목 키워드와 행사 상태로 필터링해 문화행사 목록을 페이지 단위 조회합니다. "
                    + "모든 상태 판정은 Asia/Seoul 현재 날짜와 시각을 기준으로 합니다. "
                    + "ONGOING은 start_date가 오늘보다 이전이거나 오늘이면서 event_start_time이 없거나 현재 시각 이하이고, "
                    + "end_date가 없거나 오늘보다 이후이거나 오늘이면서 event_end_time이 없거나 현재 시각 이상인 행사입니다. "
                    + "ENDED는 end_date가 오늘보다 이전이거나 오늘이면서 명시된 event_end_time이 현재 시각보다 이전인 행사입니다. "
                    + "따라서 시작 시각이 없으면 당일 00:00부터, 종료 시각이 없으면 종료일이 끝날 때까지 진행 중으로 보고, 다일 행사는 날짜 경계 사이에서 일별 휴장 여부를 판정하지 않습니다. "
                    + "status는 ONGOING(진행 중), ENDED(종료)를 지원하며 미입력 시 전체 행사를 조회합니다. "
                    + "sortMode를 생략하면 기존처럼 행사 시작일 오름차순으로 정렬합니다. "
                    + "LATEST는 원본 등록일(applyDate) 내림차순이며 등록일이 없는 행사는 뒤로 보내고 동일 등록일은 id 내림차순으로 정렬합니다. "
                    + "NEAREST는 latitude/longitude 두 좌표가 모두 필요하며 행사 위치까지의 PostGIS 물리적 거리가 가까운 순서입니다. "
                    + "위치가 없는 행사는 뒤로 보내고 거리가 같으면 id 오름차순으로 정렬합니다.")
    @GetMapping
    public ApiResponse<Page<EventSummaryResponse>> getEvents(
            @Parameter(description = "행사 제목 검색 키워드 (부분 일치)")
            @RequestParam(required = false) String keyword,
            @Parameter(description = "Asia/Seoul 현재 날짜/시각 기준 행사 상태 필터 (ONGOING: 진행 중, ENDED: 종료, 미입력: 전체)", example = "ONGOING")
            @RequestParam(required = false) String status,
            @Parameter(
                    description = "정렬 기준 (LATEST: 원본 등록일 최신순, NEAREST: 사용자 좌표 기준 가까운 순, 미입력: 행사 시작일 오름차순)",
                    example = "LATEST",
                    schema = @Schema(allowableValues = {"LATEST", "NEAREST"}))
            @RequestParam(required = false) String sortMode,
            @Parameter(description = "NEAREST 정렬에 사용할 사용자 위도 (-90 ~ 90)", example = "37.5665", schema = @Schema(type = "number", format = "double"))
            @RequestParam(required = false) String latitude,
            @Parameter(description = "NEAREST 정렬에 사용할 사용자 경도 (-180 ~ 180)", example = "126.9780", schema = @Schema(type = "number", format = "double"))
            @RequestParam(required = false) String longitude,
            Pageable pageable) {
        return ApiResponse.onSuccess(eventQueryService.findEvents(keyword, status, sortMode, latitude, longitude, pageable));
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
