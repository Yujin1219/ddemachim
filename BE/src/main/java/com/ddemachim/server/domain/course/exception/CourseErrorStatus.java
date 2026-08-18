package com.ddemachim.server.domain.course.exception;

import com.ddemachim.server.global.apiPayload.code.BaseErrorCode;
import com.ddemachim.server.global.apiPayload.code.ErrorReasonDTO;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum CourseErrorStatus implements BaseErrorCode {

    INVALID_PREVIEW_INPUT(HttpStatus.BAD_REQUEST, "COURSE4001", "코스 생성 요청값이 올바르지 않습니다."),
    BASKET_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "COURSE4041", "코스 장바구니에서 장소를 찾을 수 없습니다."),
    PLACE_LOCATION_MISSING(HttpStatus.UNPROCESSABLE_CONTENT, "COURSE4221", "좌표가 없는 장소는 코스에 포함할 수 없습니다."),
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
