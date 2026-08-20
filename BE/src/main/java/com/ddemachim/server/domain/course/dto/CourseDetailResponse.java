package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.enums.CourseStatus;

public record CourseDetailResponse(
        Long id,
        String title,
        CourseStatus status,
        CoursePreviewRequest.Start start,
        CoursePreviewResponse preview) {}
