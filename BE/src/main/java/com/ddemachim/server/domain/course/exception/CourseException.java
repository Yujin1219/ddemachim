package com.ddemachim.server.domain.course.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class CourseException extends GeneralException {

    public CourseException(CourseErrorStatus status) {
        super(status);
    }
}
