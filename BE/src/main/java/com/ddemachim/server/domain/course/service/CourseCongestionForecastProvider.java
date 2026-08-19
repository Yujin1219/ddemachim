package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.enums.CourseCongestionLevel;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import java.time.LocalDateTime;

public interface CourseCongestionForecastProvider {
    CourseCongestionLevel forecast(ResolvedPlace place, LocalDateTime expectedArrival);
}
