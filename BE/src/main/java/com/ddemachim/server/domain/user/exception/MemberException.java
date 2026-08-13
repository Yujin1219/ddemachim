package com.ddemachim.server.domain.user.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class MemberException extends GeneralException {

    public MemberException(MemberErrorStatus status) {
        super(status);
    }
}
