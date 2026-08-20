package com.ddemachim.server.domain.aiguide.controller;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;
import com.ddemachim.server.domain.aiguide.dto.AiGuideResponse;
import com.ddemachim.server.domain.aiguide.service.AiGuideService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "AI 가이드", description = "OpenAI Responses API 기반 여행 대화 API")
@RestController
@RequestMapping("/api/v1/ai-guide")
@RequiredArgsConstructor
public class AiGuideController {

    private final AiGuideService aiGuideService;

    @Operation(
            summary = "AI 가이드에게 질문",
            description = "최근 대화 이력을 선택적으로 함께 보내면 OpenAI 모델이 함수 도구를 자동 선택해 장소 정보를 조회합니다. "
                    + "대화와 응답은 서버 DB에 저장하지 않습니다.")
    @PostMapping("/chats")
    public ResponseEntity<ApiResponse<AiGuideResponse>> chat(
            @Valid @RequestBody AiGuideRequest request) {
        return ResponseEntity.ok(ApiResponse.onSuccess(aiGuideService.chat(request)));
    }
}
