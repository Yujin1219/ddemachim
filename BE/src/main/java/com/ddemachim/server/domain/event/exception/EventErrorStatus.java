package com.ddemachim.server.domain.event.exception;

import com.ddemachim.server.global.apiPayload.code.BaseErrorCode;
import com.ddemachim.server.global.apiPayload.code.ErrorReasonDTO;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum EventErrorStatus implements BaseErrorCode {

    INVALID_EVENT_STATUS(
            HttpStatus.BAD_REQUEST,
            "EVENT4001",
            "지원하지 않는 행사 상태입니다. ONGOING 또는 ENDED 중 하나를 사용해야 합니다."),
    INVALID_EVENT_SORT_MODE(
            HttpStatus.BAD_REQUEST,
            "EVENT4002",
            "지원하지 않는 행사 정렬 기준입니다. LATEST 또는 NEAREST 중 하나를 사용해야 합니다."),
    INVALID_EVENT_COORDINATES(
            HttpStatus.BAD_REQUEST,
            "EVENT4003",
            "NEAREST 정렬에는 유효한 latitude와 longitude가 모두 필요합니다."),
    EVENT_NOT_FOUND(HttpStatus.NOT_FOUND, "EVENT4041", "찾을 수 없는 행사입니다."),
    ;

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    @Override
    public ErrorReasonDTO getReason() {
        return ErrorReasonDTO.builder().isSuccess(false).code(code).message(message).build();
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
