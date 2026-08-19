package com.ddemachim.server.domain.crowding.exception;

import com.ddemachim.server.global.apiPayload.code.BaseErrorCode;
import com.ddemachim.server.global.apiPayload.code.ErrorReasonDTO;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum CrowdingErrorStatus implements BaseErrorCode {

    INVALID_BOUNDS(HttpStatus.BAD_REQUEST, "CROWDING4001", "잘못된 혼잡도 지도 영역 요청입니다."),
    VIEWPORT_LIMIT_EXCEEDED(
            HttpStatus.BAD_REQUEST,
            "CROWDING4002",
            "조회 영역이 너무 넓습니다. 지도를 확대해 주세요."),
    INVALID_POINTS(HttpStatus.BAD_REQUEST, "CROWDING4003", "혼잡도 조회 좌표가 올바르지 않습니다."),
    BATCH_LIMIT_EXCEEDED(
            HttpStatus.BAD_REQUEST,
            "CROWDING4004",
            "한 번에 조회할 수 있는 좌표 수를 초과했습니다."),
    BATCH_AREA_LIMIT_EXCEEDED(
            HttpStatus.BAD_REQUEST,
            "CROWDING4005",
            "좌표가 너무 넓게 분산되어 있습니다. 조회 범위를 좁혀 주세요."),
    GRID_QUERY_FAILED(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "CROWDING5001",
            "혼잡도 격자 조회에 실패했습니다."),
    SCORE_RESOLUTION_FAILED(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "CROWDING5002",
            "혼잡도 점수 조회에 실패했습니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    @Override
    public ErrorReasonDTO getReason() {
        return ErrorReasonDTO.builder()
                .isSuccess(false)
                .code(code)
                .message(message)
                .build();
    }

    @Override
    public ErrorReasonDTO getReasonHttpStatus() {
        return ErrorReasonDTO.builder()
                .httpStatus(httpStatus)
                .isSuccess(false)
                .code(code)
                .message(message)
                .build();
    }
}
