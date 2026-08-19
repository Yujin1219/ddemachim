package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.enums.CourseCongestionLevel;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.crowding.dto.CrowdingRequest;
import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.enums.CrowdingLevel;
import com.ddemachim.server.domain.crowding.service.CrowdingService;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class CrowdingCourseCongestionForecastProviderTest {

    private final CrowdingService crowdingService = mock(CrowdingService.class);
    private final CrowdingCourseCongestionForecastProvider provider =
            new CrowdingCourseCongestionForecastProvider(crowdingService);

    @Test
    void queriesPointAtExpectedArrivalInSeoulAndMapsCrowdingLevel() {
        OffsetDateTime slotStart = OffsetDateTime.of(2026, 8, 18, 11, 0, 0, 0, ZoneOffset.ofHours(9));
        when(crowdingService.getPointCrowding(any())).thenReturn(List.of(point(CrowdingLevel.CROWDED)));

        CourseCongestionLevel result = provider.forecast(
                place(),
                LocalDateTime.of(2026, 8, 18, 11, 10));

        assertThat(result).isEqualTo(CourseCongestionLevel.SLIGHTLY_CROWDED);
        verify(crowdingService).getPointCrowding(new CrowdingRequest.Points(
                slotStart.plusMinutes(10),
                List.of(new CrowdingRequest.Point("course-basket-item:1", 37.57, 126.97))));
    }

    @Test
    void mapsAllRedisCrowdingLevelsToCourseLevels() {
        assertThat(forecast(CrowdingLevel.RELAXED)).isEqualTo(CourseCongestionLevel.RELAXED);
        assertThat(forecast(CrowdingLevel.NORMAL)).isEqualTo(CourseCongestionLevel.NORMAL);
        assertThat(forecast(CrowdingLevel.CROWDED)).isEqualTo(CourseCongestionLevel.SLIGHTLY_CROWDED);
        assertThat(forecast(CrowdingLevel.VERY_CROWDED)).isEqualTo(CourseCongestionLevel.CROWDED);
    }

    @Test
    void fallsBackToNormalWhenCrowdingIsMissingOrLookupFails() {
        when(crowdingService.getPointCrowding(any()))
                .thenReturn(List.of())
                .thenThrow(new RuntimeException("redis lookup failed"));

        assertThat(provider.forecast(place(), LocalDateTime.of(2026, 8, 18, 11, 10)))
                .isEqualTo(CourseCongestionLevel.NORMAL);
        assertThat(provider.forecast(place(), LocalDateTime.of(2026, 8, 18, 11, 10)))
                .isEqualTo(CourseCongestionLevel.NORMAL);
    }

    private CourseCongestionLevel forecast(CrowdingLevel level) {
        when(crowdingService.getPointCrowding(any())).thenReturn(List.of(point(level)));
        return provider.forecast(place(), LocalDateTime.of(2026, 8, 18, 11, 10));
    }

    private static CrowdingResponse.Point point(CrowdingLevel level) {
        return new CrowdingResponse.Point(
                "course-basket-item:1",
                true,
                "G-1-1",
                50,
                level,
                level.getLabel(),
                true,
                OffsetDateTime.of(2026, 8, 18, 11, 0, 0, 0, ZoneOffset.ofHours(9)),
                OffsetDateTime.of(2026, 8, 18, 11, 30, 0, 0, ZoneOffset.ofHours(9)));
    }

    private static ResolvedPlace place() {
        return new ResolvedPlace(
                1L,
                null,
                null,
                "경복궁",
                "서울",
                37.57,
                126.97,
                30,
                30,
                CourseDwellSource.DEFAULT,
                null,
                CourseHoursSourceType.REAL,
                LocalTime.of(9, 0),
                LocalTime.of(22, 0),
                false);
    }
}
