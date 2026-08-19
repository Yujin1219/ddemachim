package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.enums.CourseCongestionLevel;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.crowding.dto.CrowdingRequest;
import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.enums.CrowdingLevel;
import com.ddemachim.server.domain.crowding.service.CrowdingService;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class CrowdingCourseCongestionForecastProvider implements CourseCongestionForecastProvider {

    private static final Logger log =
            LoggerFactory.getLogger(CrowdingCourseCongestionForecastProvider.class);
    private static final ZoneId SEOUL_ZONE = ZoneId.of("Asia/Seoul");

    private final CrowdingService crowdingService;

    public CrowdingCourseCongestionForecastProvider(CrowdingService crowdingService) {
        this.crowdingService = crowdingService;
    }

    @Override
    public CourseCongestionLevel forecast(ResolvedPlace place, LocalDateTime expectedArrival) {
        if (place == null
                || place.latitude() == null
                || place.longitude() == null
                || expectedArrival == null) {
            return CourseCongestionLevel.NORMAL;
        }

        CrowdingRequest.Points request = new CrowdingRequest.Points(
                expectedArrival.atZone(SEOUL_ZONE).toOffsetDateTime(),
                List.of(new CrowdingRequest.Point(
                        referenceId(place),
                        place.latitude(),
                        place.longitude())));
        try {
            return crowdingService.getPointCrowding(request).stream()
                    .filter(CrowdingResponse.Point::covered)
                    .map(CrowdingResponse.Point::level)
                    .findFirst()
                    .map(CrowdingCourseCongestionForecastProvider::toCourseLevel)
                    .orElse(CourseCongestionLevel.NORMAL);
        } catch (RuntimeException exception) {
            log.warn(
                    "Course crowding lookup failed; using normal fallback ({}).",
                    exception.getClass().getSimpleName());
            return CourseCongestionLevel.NORMAL;
        }
    }

    private static String referenceId(ResolvedPlace place) {
        return "course-basket-item:" + place.basketItemId();
    }

    private static CourseCongestionLevel toCourseLevel(CrowdingLevel level) {
        return switch (level) {
            case RELAXED -> CourseCongestionLevel.RELAXED;
            case NORMAL -> CourseCongestionLevel.NORMAL;
            case CROWDED -> CourseCongestionLevel.SLIGHTLY_CROWDED;
            case VERY_CROWDED -> CourseCongestionLevel.CROWDED;
        };
    }
}
