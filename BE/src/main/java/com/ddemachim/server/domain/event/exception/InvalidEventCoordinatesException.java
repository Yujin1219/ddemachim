package com.ddemachim.server.domain.event.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class InvalidEventCoordinatesException extends GeneralException {

    public InvalidEventCoordinatesException() {
        super(EventErrorStatus.INVALID_EVENT_COORDINATES);
    }
}
