package com.ddemachim.server.domain.course.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.LineStringGeometry;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteStep;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CoursePreviewResponseTest {

    @Test
    void preservesThreeRouteStrategiesAndCopiesOptionLists() {
        List<CoursePreviewResponse.Option> source = new ArrayList<>(List.of(
                option(CourseRouteStrategy.EASY),
                option(CourseRouteStrategy.FAST),
                option(CourseRouteStrategy.PLEASANT)));

        CoursePreviewResponse response = new CoursePreviewResponse(
                Instant.parse("2026-08-18T01:00:00Z"),
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                source);
        source.clear();

        assertThat(response.options())
                .extracting(CoursePreviewResponse.Option::strategy)
                .containsExactly(
                        CourseRouteStrategy.EASY,
                        CourseRouteStrategy.FAST,
                        CourseRouteStrategy.PLEASANT);
        assertThatThrownBy(() -> response.options().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void copiesStopsAndNormalizesNullListsToEmpty() {
        List<CoursePreviewResponse.Stop> stops = new ArrayList<>(List.of(stop()));
        CoursePreviewResponse.Option option = new CoursePreviewResponse.Option(
                CourseRouteStrategy.FAST,
                1,
                120,
                20,
                2_500,
                new BigDecimal("12.50"),
                new BigDecimal("35.00"),
                LocalTime.of(10, 0),
                LocalTime.of(12, 0),
                stops);
        stops.clear();

        assertThat(option.stops()).hasSize(1);
        assertThat(new CoursePreviewResponse(null, null, null, null).options()).isEmpty();
        assertThat(new CoursePreviewResponse.Option(
                        CourseRouteStrategy.EASY,
                        0,
                        0,
                        0,
                        0,
                        BigDecimal.ZERO,
                        null,
                        LocalTime.NOON,
                        LocalTime.NOON,
                        null)
                .stops())
                .isEmpty();
    }

    @Test
    void exposesTheExactIncomingRouteWithWalkStepsAndGeometry() {
        RouteOption incomingRoute = incomingRoute();

        CoursePreviewResponse.Stop stop = stop(incomingRoute);

        assertThat(stop.incomingRoute()).isSameAs(incomingRoute);
        assertThat(stop.incomingRoute().legs().getFirst().steps().getFirst().description())
                .isEqualTo("횡단보도를 건너 직진");
        assertThat(stop.incomingRoute().legs().getFirst().steps().getFirst().geometry().coordinates())
                .containsExactly(List.of(126.9780, 37.5665), List.of(126.9790, 37.5675));
    }

    private static CoursePreviewResponse.Option option(CourseRouteStrategy strategy) {
        return new CoursePreviewResponse.Option(
                strategy,
                1,
                120,
                20,
                2_500,
                new BigDecimal("12.50"),
                new BigDecimal("35.00"),
                LocalTime.of(10, 0),
                LocalTime.of(12, 0),
                List.of(stop()));
    }

    private static CoursePreviewResponse.Stop stop() {
        return stop(incomingRoute());
    }

    private static CoursePreviewResponse.Stop stop(RouteOption incomingRoute) {
        return new CoursePreviewResponse.Stop(
                1,
                10L,
                "경복궁",
                "서울 종로구 사직로 161",
                37.5776,
                126.9769,
                60,
                60,
                CourseDwellSource.DEFAULT,
                LocalTime.of(11, 0),
                10,
                LocalTime.of(10, 50),
                LocalTime.of(11, 50),
                10,
                800,
                new BigDecimal("5.20"),
                new BigDecimal("30.00"),
                CourseHoursSourceType.REAL,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                20L,
                LocalTime.of(17, 30),
                incomingRoute);
    }

    private static RouteOption incomingRoute() {
        LineStringGeometry geometry = new LineStringGeometry(List.of(
                List.of(126.9780, 37.5665),
                List.of(126.9790, 37.5675)));
        RouteStep step = new RouteStep("세종대로", 180, "횡단보도를 건너 직진", geometry);
        RouteLeg leg = new RouteLeg(RouteMode.WALK, "도보", 120, 180, geometry, List.of(step));
        return new RouteOption(
                RouteMode.TRANSIT,
                RouteStatus.AVAILABLE,
                120,
                180,
                0,
                0,
                180,
                null,
                List.of(leg));
    }
}
