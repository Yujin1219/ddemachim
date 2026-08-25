package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartTiming;
import com.ddemachim.server.domain.course.enums.CourseVisibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record CourseCreateRequest(
        @NotNull @Valid CoursePreviewRequest previewRequest,
        @NotNull CourseRouteStrategy strategy,
        Map<Long, String> routeSelections,
        @NotNull CourseStartTiming startTiming,
        CourseVisibility visibility,
        boolean replaceActive) {

    public CourseCreateRequest {
        routeSelections = routeSelections == null ? Map.of() : Map.copyOf(routeSelections);
        visibility = visibility == null ? CourseVisibility.PRIVATE : visibility;
    }

    public CourseCreateRequest(
            CoursePreviewRequest previewRequest,
            CourseRouteStrategy strategy,
            Map<Long, String> routeSelections,
            CourseStartTiming startTiming,
            boolean replaceActive) {
        this(previewRequest, strategy, routeSelections, startTiming, CourseVisibility.PRIVATE, replaceActive);
    }
}
