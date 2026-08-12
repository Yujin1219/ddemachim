package com.ddemachim.server.domain.user.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class AuthException extends GeneralException {

    public AuthException(AuthErrorStatus status) {
        super(status);
    }
}
