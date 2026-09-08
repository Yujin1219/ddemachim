package com.ddemachim.server.domain.aiguide.exception;

import com.ddemachim.server.global.apiPayload.code.BaseErrorCode;
import com.ddemachim.server.global.apiPayload.code.ErrorReasonDTO;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@AllArgsConstructor
public enum AiGuideErrorStatus implements BaseErrorCode {

    DISABLED(HttpStatus.SERVICE_UNAVAILABLE, "AIGUIDE5032", "현재 이용할 수 없습니다"),
    CONFIGURATION(HttpStatus.SERVICE_UNAVAILABLE, "AIGUIDE5031", "OpenAI API 키, 공개 API 모델명, 요청 주소 설정을 확인한 뒤 백엔드를 재시작해주세요."),
    QUOTA_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "AIGUIDE4291", "OpenAI API 사용량 또는 결제 한도를 초과했습니다."),
    UPSTREAM_UNAVAILABLE(HttpStatus.BAD_GATEWAY, "AIGUIDE5021", "OpenAI API에 연결하지 못했습니다. 네트워크와 API 프로젝트 상태를 확인해주세요."),
    UPSTREAM_TIMEOUT(HttpStatus.GATEWAY_TIMEOUT, "AIGUIDE5041", "OpenAI API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."),
    INVALID_UPSTREAM_RESPONSE(HttpStatus.BAD_GATEWAY, "AIGUIDE5022", "AI 가이드 응답을 해석할 수 없습니다."),
    INVALID_TOOL_CALL(HttpStatus.BAD_GATEWAY, "AIGUIDE5023", "AI 가이드 도구 호출을 해석할 수 없습니다."),
    UNKNOWN_TOOL(HttpStatus.BAD_GATEWAY, "AIGUIDE5024", "AI 가이드가 지원하지 않는 도구를 호출했습니다."),
    TOOL_LIMIT_EXCEEDED(HttpStatus.UNPROCESSABLE_ENTITY, "AIGUIDE4221", "AI 가이드 도구 호출 한도를 초과했습니다.");

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
                .isSuccess(false)
                .code(code)
                .message(message)
                .httpStatus(httpStatus)
                .build();
    }
}
