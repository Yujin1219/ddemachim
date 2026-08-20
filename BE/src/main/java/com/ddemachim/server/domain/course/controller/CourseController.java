package com.ddemachim.server.domain.course.controller;

import com.ddemachim.server.domain.course.dto.CourseCreateRequest;
import com.ddemachim.server.domain.course.dto.CourseDetailResponse;
import com.ddemachim.server.domain.course.dto.CourseStartRequest;
import com.ddemachim.server.domain.course.dto.CourseSummaryResponse;
import com.ddemachim.server.domain.course.enums.CourseStatus;
import com.ddemachim.server.domain.course.service.CourseService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/courses")
@RequiredArgsConstructor
public class CourseController {

    private final CourseService courseService;

    @Operation(summary = "선택한 코스 저장")
    @PostMapping
    public ResponseEntity<ApiResponse<CourseDetailResponse>> create(
            @AuthenticationPrincipal Long memberId,
            @Valid @RequestBody CourseCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.onSuccess(courseService.create(memberId, request)));
    }

    @Operation(summary = "내 코스 목록 조회")
    @GetMapping
    public ResponseEntity<ApiResponse<List<CourseSummaryResponse>>> list(
            @AuthenticationPrincipal Long memberId,
            @RequestParam(required = false) CourseStatus status) {
        return ResponseEntity.ok(ApiResponse.onSuccess(courseService.list(memberId, status)));
    }

    @Operation(summary = "저장된 코스 상세 조회")
    @GetMapping("/{courseId}")
    public ResponseEntity<ApiResponse<CourseDetailResponse>> get(
            @AuthenticationPrincipal Long memberId,
            @PathVariable Long courseId) {
        return ResponseEntity.ok(ApiResponse.onSuccess(courseService.get(memberId, courseId)));
    }

    @Operation(summary = "예정 코스 시작")
    @PostMapping("/{courseId}/start")
    public ResponseEntity<ApiResponse<CourseDetailResponse>> start(
            @AuthenticationPrincipal Long memberId,
            @PathVariable Long courseId,
            @RequestBody(required = false) CourseStartRequest request) {
        CourseStartRequest effectiveRequest = request == null ? new CourseStartRequest(false) : request;
        return ResponseEntity.ok(ApiResponse.onSuccess(courseService.start(memberId, courseId, effectiveRequest)));
    }
}
