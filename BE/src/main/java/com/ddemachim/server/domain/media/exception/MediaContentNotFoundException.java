package com.ddemachim.server.domain.media.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class MediaContentNotFoundException extends GeneralException {

    public MediaContentNotFoundException() {
        super(MediaErrorStatus.MEDIA_CONTENT_NOT_FOUND);
    }
}
