package com.ddemachim.server.domain.user.exception;

import com.ddemachim.server.global.apiPayload.code.BaseErrorCode;
import com.ddemachim.server.global.apiPayload.code.ErrorReasonDTO;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum AuthErrorStatus implements BaseErrorCode {

    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "AUTH4091", "이미 가입된 이메일입니다."),
    NICKNAME_ALREADY_EXISTS(HttpStatus.CONFLICT, "AUTH4092", "이미 사용 중인 닉네임입니다."),
    LOGIN_FAILED(HttpStatus.UNAUTHORIZED, "AUTH4011", "이메일 또는 비밀번호가 올바르지 않습니다."),
    INVALID_ACCESS_TOKEN(HttpStatus.UNAUTHORIZED, "AUTH4012", "유효하지 않은 액세스 토큰입니다."),
    EXPIRED_ACCESS_TOKEN(HttpStatus.UNAUTHORIZED, "AUTH4013", "액세스 토큰이 만료되었습니다.");

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
