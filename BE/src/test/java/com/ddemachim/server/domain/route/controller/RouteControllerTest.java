package com.ddemachim.server.domain.route.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.route.dto.RouteComparisonResponse;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.exception.RouteErrorStatus;
import com.ddemachim.server.domain.route.exception.RouteException;
import com.ddemachim.server.domain.route.service.RouteComparisonService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class RouteControllerTest {

    @Mock
    private RouteComparisonService service;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new RouteController(service))
                // Exercise the contract path where primitive creator values coerce null/missing input.
                .setMessageConverters(new JacksonJsonHttpMessageConverter(
                        JsonMapper.builder()
                                .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                                .build()))
                .setControllerAdvice(new ExceptionAdvice())
                .build();
    }

    @Test
    void compare_wrapsTheNormalizedResponse() throws Exception {
        when(service.compare(any())).thenReturn(response());

        mockMvc.perform(post("/api/routes/compare")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.code").value("ROUTE2001"))
                .andExpect(jsonPath("$.message").value("경로 비교 조회에 성공했습니다."))
                .andExpect(jsonPath("$.result.routes[0].mode").value("WALK"));
    }

    @Test
    void compare_rejectsOutOfRangeCoordinatesBeforeCallingService() throws Exception {
        mockMvc.perform(post("/api/routes/compare")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"origin\":{\"latitude\":91,\"longitude\":126.9},\"destination\":{\"latitude\":37.5,\"longitude\":127}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("ROUTE4001"));

        verifyNoInteractions(service);
    }

    @Test
    void compare_rejectsMissingOriginLongitudeBeforeCallingService() throws Exception {
        mockMvc.perform(post("/api/routes/compare")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"origin\":{\"latitude\":37.5665},\"destination\":{\"latitude\":37.5559,\"longitude\":126.9723}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("ROUTE4001"));

        verifyNoInteractions(service);
    }

    @Test
    void compare_rejectsNullDestinationLatitudeBeforeCallingService() throws Exception {
        mockMvc.perform(post("/api/routes/compare")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"origin\":{\"latitude\":37.5665,\"longitude\":126.978},\"destination\":{\"latitude\":null,\"longitude\":126.9723}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("ROUTE4001"));

        verifyNoInteractions(service);
    }

    @Test
    void compare_returnsServiceUnavailableWhenTmapIsNotConfigured() throws Exception {
        when(service.compare(any())).thenThrow(new RouteException(RouteErrorStatus.TMAP_NOT_CONFIGURED));

        mockMvc.perform(post("/api/routes/compare")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("ROUTE5031"));
    }

    @Test
    void compare_returnsBadGatewayWhenAllRoutesAreUnavailable() throws Exception {
        when(service.compare(any())).thenThrow(new RouteException(RouteErrorStatus.ALL_ROUTES_UNAVAILABLE));

        mockMvc.perform(post("/api/routes/compare")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("ROUTE5021"));
    }

    private static String validRequestJson() {
        return "{\"origin\":{\"latitude\":37.5665,\"longitude\":126.978},\"destination\":{\"latitude\":37.5559,\"longitude\":126.9723}}";
    }

    private static RouteComparisonResponse response() {
        RouteOption walk = new RouteOption(
                RouteMode.WALK,
                RouteStatus.AVAILABLE,
                840,
                920,
                null,
                null,
                920,
                null,
                List.of());
        return new RouteComparisonResponse(Instant.parse("2026-08-13T03:00:00Z"), List.of(walk));
    }
}
