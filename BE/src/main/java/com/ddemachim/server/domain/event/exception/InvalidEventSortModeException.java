package com.ddemachim.server.domain.event.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class InvalidEventSortModeException extends GeneralException {

    public InvalidEventSortModeException() {
        super(EventErrorStatus.INVALID_EVENT_SORT_MODE);
    }
}
