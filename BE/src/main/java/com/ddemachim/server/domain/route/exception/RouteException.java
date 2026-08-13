package com.ddemachim.server.domain.route.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class RouteException extends GeneralException {

    public RouteException(RouteErrorStatus status) {
        super(status);
    }
}
