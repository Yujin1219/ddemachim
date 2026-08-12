package com.ddemachim.server.domain.event.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class InvalidEventStatusException extends GeneralException {

    public InvalidEventStatusException() {
        super(EventErrorStatus.INVALID_EVENT_STATUS);
    }
}
