package com.ddemachim.server.domain.course.controller;

import com.ddemachim.server.domain.course.dto.AddKakaoPlaceRequest;
import com.ddemachim.server.domain.course.dto.CourseBasketItemResponse;
import com.ddemachim.server.domain.course.service.CourseBasketService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "코스 장바구니(Course Basket)", description = "코스 후보 장소 관리 API")
@RestController
@RequestMapping("/api/course-basket")
@RequiredArgsConstructor
public class CourseBasketController {

    private final CourseBasketService courseBasketService;

    @Operation(summary = "코스 장바구니 장소 목록 조회", description = "내가 담은 장소를 최신 등록순으로 조회합니다.")
    @GetMapping("/places")
    public ResponseEntity<ApiResponse<List<CourseBasketItemResponse>>> listPlaces(
            @AuthenticationPrincipal Long memberId) {
        return ResponseEntity.ok(ApiResponse.onSuccess(courseBasketService.listPlaces(memberId)));
    }

    @Operation(summary = "코스 장바구니 장소 삭제", description = "내 코스 장바구니에서 선택한 장소를 삭제합니다.")
    @DeleteMapping("/places/{basketItemId}")
    public ResponseEntity<ApiResponse<Void>> deletePlace(
            @AuthenticationPrincipal Long memberId,
            @Parameter(description = "삭제할 장바구니 항목 id") @PathVariable Long basketItemId) {
        courseBasketService.deletePlace(memberId, basketItemId);
        return ResponseEntity.ok(ApiResponse.<Void>onSuccess(null));
    }

    @Operation(summary = "코스 장바구니에 장소 담기", description = "이미 담긴 장소는 중복 생성하지 않고 기존 항목을 반환합니다.")
    @PostMapping("/places/{placeId}")
    public ResponseEntity<ApiResponse<CourseBasketItemResponse>> addPlace(
            @AuthenticationPrincipal Long memberId,
            @Parameter(description = "담을 장소 id") @PathVariable Long placeId) {
        CourseBasketService.AddResult result = courseBasketService.addPlace(memberId, placeId);
        HttpStatus status = result.isCreated() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(ApiResponse.onSuccess(result.item()));
    }

    @Operation(summary = "카카오 장소를 코스 장바구니에 담기", description = "회원별 카카오 장소와 장바구니 항목을 중복 생성하지 않습니다.")
    @PostMapping("/kakao-places")
    public ResponseEntity<ApiResponse<CourseBasketItemResponse>> addKakaoPlace(
            @AuthenticationPrincipal Long memberId, @Valid @RequestBody AddKakaoPlaceRequest request) {
        CourseBasketService.AddResult result = courseBasketService.addKakaoPlace(memberId, request);
        HttpStatus status = result.isCreated() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(ApiResponse.onSuccess(result.item()));
    }
}
