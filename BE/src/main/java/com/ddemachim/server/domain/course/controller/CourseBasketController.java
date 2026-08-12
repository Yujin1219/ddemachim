package com.ddemachim.server.domain.course.controller;

import com.ddemachim.server.domain.course.dto.CourseBasketItemResponse;
import com.ddemachim.server.domain.course.service.CourseBasketService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

@Tag(name = "코스 장바구니(Course Basket)", description = "코스 후보 장소 관리 API")
@RestController
@RequestMapping("/api/course-basket")
@RequiredArgsConstructor
public class CourseBasketController {

    private final CourseBasketService courseBasketService;

    @Operation(summary = "코스 장바구니에 장소 담기", description = "이미 담긴 장소는 중복 생성하지 않고 기존 항목을 반환합니다.")
    @PostMapping("/places/{placeId}")
    public ResponseEntity<ApiResponse<CourseBasketItemResponse>> addPlace(
            @AuthenticationPrincipal Long memberId,
            @Parameter(description = "담을 장소 id") @PathVariable Long placeId) {
        CourseBasketService.AddResult result = courseBasketService.addPlace(memberId, placeId);
        HttpStatus status = result.isCreated() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(ApiResponse.onSuccess(result.item()));
    }
}
