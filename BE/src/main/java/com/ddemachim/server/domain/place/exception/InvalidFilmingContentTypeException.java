package com.ddemachim.server.domain.place.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class InvalidFilmingContentTypeException extends GeneralException {

    public InvalidFilmingContentTypeException() {
        super(PlaceErrorStatus.INVALID_FILMING_CONTENT_TYPE);
    }
}
