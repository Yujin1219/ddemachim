package com.ddemachim.server.domain.aiguide.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class AiGuideException extends GeneralException {

    public AiGuideException(AiGuideErrorStatus status) {
        super(status);
    }

    public AiGuideException(AiGuideErrorStatus status, Throwable cause) {
        super(status);
        initCause(cause);
    }
}
