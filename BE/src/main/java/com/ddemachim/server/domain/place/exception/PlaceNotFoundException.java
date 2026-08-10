package com.ddemachim.server.domain.place.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class PlaceNotFoundException extends GeneralException {

    public PlaceNotFoundException() {
        super(PlaceErrorStatus.PLACE_NOT_FOUND);
    }
}
