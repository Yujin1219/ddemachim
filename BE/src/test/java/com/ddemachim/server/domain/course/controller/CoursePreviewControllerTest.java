package com.ddemachim.server.domain.course.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.dto.CourseFastPlanFailure;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.service.CoursePreviewService;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.LineStringGeometry;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteStep;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class CoursePreviewControllerTest {

    @Mock
    private CoursePreviewService coursePreviewService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(3L, null, List.of()));
        mockMvc = MockMvcBuilders.standaloneSetup(new CoursePreviewController(coursePreviewService))
                .setControllerAdvice(new ExceptionAdvice())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void acceptsLegacyDesiredEndTimeButOmitsItFromThePreviewResponse() throws Exception {
        when(coursePreviewService.preview(eq(3L), any(CoursePreviewRequest.class)))
                .thenReturn(response());

        mockMvc.perform(post("/api/courses/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.code").value("COMMON200"))
                .andExpect(jsonPath("$.result.desiredEndTime").doesNotExist())
                .andExpect(jsonPath("$.result.options[0].strategy").value("FAST"))
                .andExpect(jsonPath("$.result.options[0].scheduledStart").value("10:00:00"))
                .andExpect(jsonPath("$.result.options[0].scheduledEnd").value("11:00:59"))
                .andExpect(jsonPath("$.result.options[0].stops[0].basketItemId").value(10))
                .andExpect(jsonPath("$.result.options[0].stops[0].hoursSourceType").value("REAL"))
                .andExpect(jsonPath("$.result.options[0].stops[0].incomingRoute.mode").value("TRANSIT"))
                .andExpect(jsonPath("$.result.options[0].stops[0].incomingRoute.legs[0].mode").value("WALK"))
                .andExpect(jsonPath("$.result.options[0].stops[0].incomingRoute.legs[0].steps[0].description")
                        .value("횡단보도를 건너 직진"))
                .andExpect(jsonPath("$.result.options[0].stops[0].incomingRoute.legs[0].steps[0].geometry.type")
                        .value("LineString"))
                .andExpect(jsonPath("$.result.options[0].stops[0].incomingRoute.legs[0].steps[0].geometry.coordinates[1][0]")
                        .value(126.9790));

        ArgumentCaptor<CoursePreviewRequest> requestCaptor = ArgumentCaptor.forClass(CoursePreviewRequest.class);
        verify(coursePreviewService).preview(eq(3L), requestCaptor.capture());
        assertThat(requestCaptor.getValue().places())
                .extracting(CoursePreviewRequest.Place::basketItemId)
                .containsExactly(10L);
    }

    @Test
    void rejectsEmptyPlacesWithoutCallingTheService() throws Exception {
        mockMvc.perform(post("/api/courses/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson().replace(
                                "[{\"basketItemId\":10,\"dwellMinutes\":60,\"arrivalDeadline\":\"11:00\"}]",
                                "[]")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON400"))
                .andExpect(jsonPath("$.result.places").exists());

        verifyNoInteractions(coursePreviewService);
    }

    @Test
    void rejectsMoreThanFivePlacesWithoutCallingTheService() throws Exception {
        mockMvc.perform(post("/api/courses/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson().replace(
                                "[{\"basketItemId\":10,\"dwellMinutes\":60,\"arrivalDeadline\":\"11:00\"}]",
                                """
                                [
                                  {"basketItemId":1,"dwellMinutes":30},
                                  {"basketItemId":2,"dwellMinutes":30},
                                  {"basketItemId":3,"dwellMinutes":30},
                                  {"basketItemId":4,"dwellMinutes":30},
                                  {"basketItemId":5,"dwellMinutes":30},
                                  {"basketItemId":6,"dwellMinutes":30}
                                ]
                                """)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON400"))
                .andExpect(jsonPath("$.result.places").exists());

        verifyNoInteractions(coursePreviewService);
    }

    @Test
    void malformedDateAndTimeUseTheCommonBadRequestEnvelope() throws Exception {
        mockMvc.perform(post("/api/courses/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()
                                .replace("2026-08-18", "18-08-2026")
                                .replace("\"10:00\"", "\"not-a-time\"")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON400"))
                .andExpect(jsonPath("$.message").exists());

        verifyNoInteractions(coursePreviewService);
    }

    @Test
    void malformedJsonUsesTheCommonBadRequestEnvelope() throws Exception {
        mockMvc.perform(post("/api/courses/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serviceDate\":\"2026-08-18\""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON400"))
                .andExpect(jsonPath("$.message").exists());

        verifyNoInteractions(coursePreviewService);
    }

    @Test
    void keepsCourse4222DiagnosticsInTheExistingFailureEnvelope() throws Exception {
        when(coursePreviewService.preview(eq(3L), any(CoursePreviewRequest.class)))
                .thenThrow(new CourseException(
                        CourseErrorStatus.FAST_PLAN_UNAVAILABLE,
                        new CourseFastPlanFailure(1, List.of(new CourseFastPlanFailure.StopDiagnostic(
                                10L,
                                "경복궁",
                                CourseFastPlanFailure.DiagnosticReason.ARRIVAL_DEADLINE_EXCEEDED,
                                CourseFastPlanFailure.AdjustmentProposal.RELAX_ARRIVAL_DEADLINE)))));

        mockMvc.perform(post("/api/courses/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COURSE4222"))
                .andExpect(jsonPath("$.result.requestedStopCount").value(1))
                .andExpect(jsonPath("$.result.diagnostics[0].basketItemId").value(10))
                .andExpect(jsonPath("$.result.diagnostics[0].reason").value("ARRIVAL_DEADLINE_EXCEEDED"))
                .andExpect(jsonPath("$.result.diagnostics[0].adjustmentProposal")
                        .value("RELAX_ARRIVAL_DEADLINE"));
    }

    private static String validRequestJson() {
        return """
                {
                  "serviceDate":"2026-08-18",
                  "desiredStartTime":"10:00",
                  "desiredEndTime":"09:00",
                  "start":{
                    "type":"CURRENT_LOCATION",
                    "name":"현재 위치",
                    "latitude":37.5665,
                    "longitude":126.9780
                  },
                  "places":[{"basketItemId":10,"dwellMinutes":60,"arrivalDeadline":"11:00"}]
                }
                """;
    }

    private static CoursePreviewResponse response() {
        RouteOption route = route();
        CoursePreviewResponse.Stop stop = new CoursePreviewResponse.Stop(
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
                2,
                180,
                null,
                null,
                CourseHoursSourceType.REAL,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                null,
                null,
                route);
        CoursePreviewResponse.Option option = new CoursePreviewResponse.Option(
                CourseRouteStrategy.FAST,
                1,
                61,
                3,
                180,
                null,
                null,
                LocalTime.of(10, 0),
                LocalTime.of(11, 0, 59),
                List.of(stop));
        return new CoursePreviewResponse(
                Instant.parse("2026-08-18T01:02:03Z"),
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                List.of(option));
    }

    private static RouteOption route() {
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
