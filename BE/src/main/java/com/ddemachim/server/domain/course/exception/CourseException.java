package com.ddemachim.server.domain.course.exception;

import com.ddemachim.server.global.apiPayload.exception.GeneralException;

public class CourseException extends GeneralException {

    private final Object resultDetail;

    public CourseException(CourseErrorStatus status) {
        this(status, null);
    }

    public CourseException(CourseErrorStatus status, Object resultDetail) {
        super(status);
        this.resultDetail = resultDetail;
    }

    public Object getResultDetail() {
        return resultDetail;
    }
}
