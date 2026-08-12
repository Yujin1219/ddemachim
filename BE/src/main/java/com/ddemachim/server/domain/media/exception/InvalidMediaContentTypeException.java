package com.ddemachim.server.domain.media.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class InvalidMediaContentTypeException extends GeneralException {

    public InvalidMediaContentTypeException() {
        super(MediaErrorStatus.INVALID_FILMING_CONTENT_TYPE);
    }
}
