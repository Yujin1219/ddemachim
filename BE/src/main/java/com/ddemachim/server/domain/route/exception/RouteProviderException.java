package com.ddemachim.server.domain.route.exception;

import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;

public class RouteProviderException extends RuntimeException {

    private final RouteUnavailableReason reason;

    public RouteProviderException(RouteUnavailableReason reason) {
        this(reason, null);
    }

    public RouteProviderException(RouteUnavailableReason reason, Throwable cause) {
        super("경로 제공자 요청을 처리할 수 없습니다.", cause);
        this.reason = reason;
    }

    public RouteUnavailableReason reason() {
        return reason;
    }

    public RouteUnavailableReason getReason() {
        return reason;
    }
}
