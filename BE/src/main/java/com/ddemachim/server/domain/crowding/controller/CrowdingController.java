package com.ddemachim.server.domain.crowding.controller;

import com.ddemachim.server.domain.crowding.dto.CrowdingRequest;
import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.exception.CrowdingErrorStatus;
import com.ddemachim.server.domain.crowding.service.CrowdingService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Tag(name = "시뮬레이션 혼잡도", description = "종로구 50m 격자 MOCK 혼잡도 API")
@RestController
@RequestMapping("/api/v1/crowding")
@RequiredArgsConstructor
public class CrowdingController {

    private final CrowdingService crowdingService;

    @Operation(summary = "viewport 혼잡도 격자 조회")
    @GetMapping("/grids")
    public ApiResponse<List<CrowdingResponse.Grid>> getGrids(
            @RequestParam double minLat,
            @RequestParam double maxLat,
            @RequestParam double minLng,
            @RequestParam double maxLng,
            @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                    OffsetDateTime at) {
        return ApiResponse.onSuccess(crowdingService.getViewportGrids(
                minLat,
                maxLat,
                minLng,
                maxLng,
                at));
    }

    @Operation(summary = "좌표 일괄 혼잡도 조회")
    @PostMapping("/points")
    public ApiResponse<List<CrowdingResponse.Point>> getPoints(
            @Valid @RequestBody CrowdingRequest.Points request) {
        return ApiResponse.onSuccess(crowdingService.getPointCrowding(request));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<ApiResponse<Void>> handleInvalidPoints() {
        return failure(CrowdingErrorStatus.INVALID_POINTS);
    }

    @ExceptionHandler({
        MissingServletRequestParameterException.class,
        MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<ApiResponse<Void>> handleInvalidBounds() {
        return failure(CrowdingErrorStatus.INVALID_BOUNDS);
    }

    private static ResponseEntity<ApiResponse<Void>> failure(CrowdingErrorStatus status) {
        return ResponseEntity.status(status.getHttpStatus())
                .body(ApiResponse.onFailure(status.getCode(), status.getMessage(), null));
    }
}
