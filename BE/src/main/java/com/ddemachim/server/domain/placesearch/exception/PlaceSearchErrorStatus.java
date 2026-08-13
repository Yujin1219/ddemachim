package com.ddemachim.server.domain.placesearch.exception;

import com.ddemachim.server.global.apiPayload.code.BaseErrorCode;
import com.ddemachim.server.global.apiPayload.code.ErrorReasonDTO;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum PlaceSearchErrorStatus implements BaseErrorCode {
    INVALID_QUERY(HttpStatus.BAD_REQUEST, "PLACESEARCH4001", "검색어를 1자 이상 100자 이하로 입력해주세요."),
    INVALID_LOCATION_PARAMETERS(HttpStatus.BAD_REQUEST, "PLACESEARCH4002", "위도, 경도, 반경 검색 조건이 올바르지 않습니다."),
    KAKAO_UPSTREAM_ERROR(HttpStatus.BAD_GATEWAY, "PLACESEARCH5021", "장소 검색 서비스 연결이 원활하지 않습니다."),
    KAKAO_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "PLACESEARCH5031", "장소 검색 서비스를 사용할 수 없습니다."),
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
