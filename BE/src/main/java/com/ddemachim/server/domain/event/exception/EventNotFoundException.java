package com.ddemachim.server.domain.event.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class EventNotFoundException extends GeneralException {

    public EventNotFoundException() {
        super(EventErrorStatus.EVENT_NOT_FOUND);
    }
}
