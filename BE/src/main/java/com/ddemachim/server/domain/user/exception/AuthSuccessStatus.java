package com.ddemachim.server.domain.user.exception;

import com.ddemachim.server.global.apiPayload.code.BaseCode;
import com.ddemachim.server.global.apiPayload.code.ReasonDTO;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum AuthSuccessStatus implements BaseCode {

    SIGN_UP_SUCCESS(HttpStatus.CREATED, "AUTH2011", "회원가입에 성공했습니다."),
    LOGIN_SUCCESS(HttpStatus.OK, "AUTH2001", "로그인에 성공했습니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    @Override
    public ReasonDTO getReason() {
        return ReasonDTO.builder()
                .isSuccess(true)
                .code(code)
                .message(message)
                .build();
    }

    @Override
    public ReasonDTO getReasonHttpStatus() {
        return ReasonDTO.builder()
                .httpStatus(httpStatus)
                .isSuccess(true)
                .code(code)
                .message(message)
                .build();
    }
}
