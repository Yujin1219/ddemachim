package com.ddemachim.server.domain.crowding.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class CrowdingException extends GeneralException {

    public CrowdingException(CrowdingErrorStatus status) {
        super(status);
    }
}
