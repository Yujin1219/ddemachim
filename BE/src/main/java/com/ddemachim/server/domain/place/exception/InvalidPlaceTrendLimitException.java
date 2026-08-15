package com.ddemachim.server.domain.place.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class InvalidPlaceTrendLimitException extends GeneralException {

    public InvalidPlaceTrendLimitException() {
        super(PlaceErrorStatus.INVALID_PLACE_TREND_LIMIT);
    }
}
