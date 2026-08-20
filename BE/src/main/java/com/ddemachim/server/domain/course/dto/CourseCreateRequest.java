package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartTiming;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record CourseCreateRequest(
        @NotNull @Valid CoursePreviewRequest previewRequest,
        @NotNull CourseRouteStrategy strategy,
        Map<Long, String> routeSelections,
        @NotNull CourseStartTiming startTiming,
        boolean replaceActive) {

    public CourseCreateRequest {
        routeSelections = routeSelections == null ? Map.of() : Map.copyOf(routeSelections);
    }
}
