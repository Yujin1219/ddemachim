package com.ddemachim.server.domain.route.controller;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse;
import com.ddemachim.server.domain.route.exception.RouteErrorStatus;
import com.ddemachim.server.domain.route.exception.RouteSuccessStatus;
import com.ddemachim.server.domain.route.service.RouteComparisonService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "경로 비교", description = "출발지와 목적지 사이의 도보·대중교통·택시 경로 비교 API")
@RestController
@RequestMapping("/api/routes")
@RequiredArgsConstructor
public class RouteController {

    private final RouteComparisonService routeComparisonService;

    @Operation(summary = "경로 비교 조회", description = "세 이동 수단의 경로를 비교해 고정된 순서로 반환합니다.")
    @PostMapping("/compare")
    public ApiResponse<RouteComparisonResponse> compare(
            @Valid @RequestBody RouteComparisonRequest request) {
        return ApiResponse.of(
                RouteSuccessStatus.ROUTE_COMPARISON_SUCCESS,
                routeComparisonService.compare(request));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<ApiResponse<Void>> handleInvalidRequest() {
        RouteErrorStatus status = RouteErrorStatus.INVALID_COORDINATES;
        return ResponseEntity.status(status.getHttpStatus())
                .body(ApiResponse.onFailure(status.getCode(), status.getMessage(), null));
    }
}
