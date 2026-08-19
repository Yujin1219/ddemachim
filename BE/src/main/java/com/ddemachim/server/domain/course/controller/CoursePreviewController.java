package com.ddemachim.server.domain.course.controller;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.service.CoursePreviewService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "코스(Course)", description = "코스 계획 API")
@RestController
@RequestMapping("/api/courses")
@RequiredArgsConstructor
public class CoursePreviewController {

    private final CoursePreviewService coursePreviewService;

    @Operation(
            summary = "전략별 코스 미리보기",
            description = "코스를 저장하지 않고 FAST, EASY, QUIET 전략의 방문 일정과 경로를 계산합니다. "
                    + "EASY는 FAST 방문 순서와 대중교통 구간을 유지하면서 도보 구간의 경로, 이동 지표, 오르막 고도를 반영합니다.")
    @PostMapping("/preview")
    public ResponseEntity<ApiResponse<CoursePreviewResponse>> preview(
            @AuthenticationPrincipal Long memberId,
            @Valid @RequestBody CoursePreviewRequest request) {
        return ResponseEntity.ok(ApiResponse.onSuccess(coursePreviewService.preview(memberId, request)));
    }
}
