package com.ddemachim.server.domain.place.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class InvalidPlaceBoundsException extends GeneralException {

    public InvalidPlaceBoundsException() {
        super(PlaceErrorStatus.INVALID_PLACE_BOUNDS);
    }
}
