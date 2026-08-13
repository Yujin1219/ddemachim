package com.ddemachim.server.domain.route.exception;

import com.ddemachim.server.global.apiPayload.code.BaseErrorCode;
import com.ddemachim.server.global.apiPayload.code.ErrorReasonDTO;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum RouteErrorStatus implements BaseErrorCode {

    INVALID_COORDINATES(HttpStatus.BAD_REQUEST, "ROUTE4001", "출발지와 목적지 좌표가 올바르지 않습니다."),
    ALL_ROUTES_UNAVAILABLE(HttpStatus.BAD_GATEWAY, "ROUTE5021", "모든 경로를 조회할 수 없습니다."),
    TMAP_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "ROUTE5031", "TMAP 경로 제공자가 설정되지 않았습니다.");

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
