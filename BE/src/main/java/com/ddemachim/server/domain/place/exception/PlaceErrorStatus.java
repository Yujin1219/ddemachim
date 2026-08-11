package com.ddemachim.server.domain.place.exception;

import com.ddemachim.server.global.apiPayload.code.BaseErrorCode;
import com.ddemachim.server.global.apiPayload.code.ErrorReasonDTO;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum PlaceErrorStatus implements BaseErrorCode {

    INVALID_PLACE_BOUNDS(HttpStatus.BAD_REQUEST, "PLACE4001", "잘못된 지도 영역 요청입니다."),
    PLACE_NOT_FOUND(HttpStatus.NOT_FOUND, "PLACE4041", "찾을 수 없는 장소입니다."),
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
