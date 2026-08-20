package com.ddemachim.server.domain.course.controller;

import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import com.ddemachim.server.domain.course.dto.AiCourseResponse;
import com.ddemachim.server.domain.course.service.AiCourseService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "AI 코스", description = "장바구니와 분리된 placeId 기반 코스 계획 API")
@RestController
@RequestMapping("/api/v1/ai-courses")
@RequiredArgsConstructor
public class AiCourseController {

    private final AiCourseService aiCourseService;

    @Operation(summary = "AI 코스 미리보기", description = "실제 placeId 후보를 받아 저장 없이 방문 가능한 코스를 계산합니다.")
    @PostMapping("/preview")
    public ResponseEntity<ApiResponse<AiCourseResponse>> preview(@RequestBody AiCourseRequest request) {
        return ResponseEntity.ok(ApiResponse.onSuccess(aiCourseService.create(request)));
    }
}
