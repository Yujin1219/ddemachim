package com.ddemachim.server.domain.placesearch.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class PlaceSearchException extends GeneralException {
    public PlaceSearchException(PlaceSearchErrorStatus status) {
        super(status);
    }
}
