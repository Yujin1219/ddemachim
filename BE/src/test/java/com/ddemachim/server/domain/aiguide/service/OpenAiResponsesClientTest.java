package com.ddemachim.server.domain.aiguide.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;
import com.ddemachim.server.domain.aiguide.exception.AiGuideException;
import com.ddemachim.server.domain.course.service.CoursePreviewService;
import com.ddemachim.server.domain.crowding.service.CrowdingService;
import com.ddemachim.server.domain.place.dto.PlaceDetailResponse;
import com.ddemachim.server.domain.place.service.PlaceQueryService;
import com.ddemachim.server.domain.place.service.AiPlaceSearchService;
import com.ddemachim.server.domain.route.service.RouteComparisonService;
import com.ddemachim.server.global.auth.security.MemberAuthentication;
import com.ddemachim.server.global.mcp.DdemachimMcpTools;
import com.ddemachim.server.global.properties.AiGuideProperties;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class OpenAiResponsesClientTest {

    private static final String RESPONSES_URL = "https://example.test/v1/responses";

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void functionCallRoundTripUsesOpenAiResponsesContractAndPreviousResponse() {
        AiGuideProperties properties = properties();
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.getPlaceDetail(new DdemachimMcpTools.PlaceDetailRequest(101L)))
                .thenReturn(new DdemachimMcpTools.McpToolResponse<>(true, "COMMON200", "성공", (PlaceDetailResponse) null));

        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer test-openai-key"))
                .andExpect(content().string(allOf(
                        containsString("\"model\":\"gpt-5.6-luna\""),
                        containsString("\"instructions\""),
                        containsString("\"type\":\"function\""),
                        containsString("\"name\":\"search_places\""),
                        containsString("\"name\":\"search_places_near_reference\""),
                        containsString("\"name\":\"create_course\""),
                        not(containsString("test-openai-key")),
                        not(containsString("server_url")),
                        not(containsString("allowed_tools")),
                        not(containsString("user-jwt")))))
                .andRespond(withSuccess(functionCallResponse("get_place_detail", "call_1", "{\"placeId\":101}"),
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(allOf(
                        containsString("\"previous_response_id\":\"resp_1\""),
                        containsString("\"type\":\"function_call_output\""),
                        containsString("\"call_id\":\"call_1\""),
                        containsString("\"output\""),
                        not(containsString("test-openai-key")))))
                .andRespond(withSuccess(finalResponse("장소 상세를 확인했어요.", "resp_2"), MediaType.APPLICATION_JSON));

        OpenAiResponsesClient client = client(properties, mcpTools, builder.build());
        var reply = client.complete(new AiGuideRequest("이 장소를 알려줘", List.of()));

        assertThat(reply.answer()).isEqualTo("장소 상세를 확인했어요.");
        assertThat(reply.responseId()).isEqualTo("resp_2");
        verify(mcpTools).getPlaceDetail(new DdemachimMcpTools.PlaceDetailRequest(101L));
        server.verify();
    }

    @Test
    void malformedArgumentsBecomeStructuredToolError() {
        AiGuideProperties properties = properties();
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse("get_place_detail", "call_1", "\"not-json\""),
                        MediaType.APPLICATION_JSON));

        AiGuideException exception = assertThatThrownBy(() ->
                client(properties, mock(DdemachimMcpTools.class), builder.build())
                        .complete(new AiGuideRequest("장소를 알려줘", List.of())))
                .isInstanceOf(AiGuideException.class)
                .actual() instanceof AiGuideException aiGuideException ? aiGuideException : null;

        assertThat(exception.getErrorReason().getCode()).isEqualTo("AIGUIDE5023");
        server.verify();
    }

    @Test
    void relativeVisitDateIsNormalizedBeforeSearchToolBinding() {
        AiGuideProperties properties = properties();
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.searchPlaces(any()))
                .thenReturn(new DdemachimMcpTools.McpToolResponse<>(
                        true, "COMMON200", "성공", new AiPlaceSearchService.SearchResult(List.of(searchPlace()))));
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse(
                                "search_places", "call_1",
                                "{\"query\":\"촬영지\",\"area\":\"종로\","
                                        + "\"categories\":[\"FILMING_LOCATION\"],"
                                        + "\"visitDate\":\"내일\",\"limit\":10}"),
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(finalResponse("종로 촬영지를 찾았어요.", "resp_2"),
                        MediaType.APPLICATION_JSON));
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-21T03:00:00Z"), ZoneId.of("Asia/Seoul"));

        var reply = client(properties, mcpTools, builder.build(), clock)
                .complete(new AiGuideRequest("내일 종로 촬영지를 추천해줘", List.of()));

        assertThat(reply.answer()).isEqualTo("종로 촬영지를 찾았어요.");
        verify(mcpTools).searchPlaces(new DdemachimMcpTools.SearchPlacesRequest(
                "촬영지", "종로", List.of("FILMING_LOCATION"), LocalDate.of(2026, 8, 22), 10));
        server.verify();
    }

    @Test
    void immediateCourseUsesCurrentTimeAndBrowserLocationWithoutAskingForRoutePreference() {
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.createAiCourse(any())).thenReturn(new DdemachimMcpTools.McpToolResponse<>(
                true, "COMMON200", "성공", null));
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(content().string(allOf(
                        containsString("client_context.currentTime: 12:00"),
                        containsString("이동 방식이나 빠르게/여유롭게 같은 경로 선호는 사용자에게 필수로 묻지 마세요"))))
                .andRespond(withSuccess(functionCallResponse(
                                "create_ai_course", "call_1",
                                "{\"availableMinutes\":180,\"requiredPlaceIds\":[],\"candidatePlaceIds\":[101]}"),
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(finalResponse("바로 출발하는 촬영지 코스를 만들었어요.", "resp_2"),
                        MediaType.APPLICATION_JSON));
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-21T03:00:00Z"), ZoneId.of("Asia/Seoul"));

        var reply = client(properties(), mcpTools, builder.build(), clock)
                .complete(new AiGuideRequest(
                        "촬영지 코스 만들어줘 지금 시작할거야", List.of(),
                        new AiGuideRequest.CurrentLocation(37.577, 126.972)));

        assertThat(reply.answer()).isEqualTo("바로 출발하는 촬영지 코스를 만들었어요.");
        verify(mcpTools).createAiCourse(any());
        server.verify();
    }

    @Test
    void unrecognizedVisitDateReturnsClarificationInsteadOfGatewayError() {
        AiGuideProperties properties = properties();
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse(
                                "search_places", "call_1",
                                "{\"query\":\"촬영지\",\"area\":\"종로\",\"visitDate\":\"언젠가\"}"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties, mcpTools, builder.build())
                .complete(new AiGuideRequest("언젠가 종로 촬영지 추천해줘", List.of()));

        assertThat(reply.answer()).contains("방문 날짜").contains("YYYY-MM-DD");
        verify(mcpTools, times(0)).searchPlaces(any());
        server.verify();
    }

    @Test
    void unknownFunctionBecomesStructuredToolError() {
        AiGuideProperties properties = properties();
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse("not_supported", "call_1", "{}"),
                        MediaType.APPLICATION_JSON));

        AiGuideException exception = assertThatThrownBy(() ->
                client(properties, mock(DdemachimMcpTools.class), builder.build())
                        .complete(new AiGuideRequest("도와줘", List.of())))
                .isInstanceOf(AiGuideException.class)
                .actual() instanceof AiGuideException aiGuideException ? aiGuideException : null;

        assertThat(exception.getErrorReason().getCode()).isEqualTo("AIGUIDE5024");
        server.verify();
    }

    @Test
    void maxToolRoundsStopsRepeatedCalls() {
        AiGuideProperties properties = properties();
        properties.setMaxToolRounds(1);
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.getPlaceDetail(any()))
                .thenReturn(new DdemachimMcpTools.McpToolResponse<>(true, "COMMON200", "성공", (PlaceDetailResponse) null));
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse("get_place_detail", "call_1", "{\"placeId\":101}"),
                        MediaType.APPLICATION_JSON));

        AiGuideException exception = assertThatThrownBy(() ->
                client(properties, mcpTools, builder.build()).complete(new AiGuideRequest("장소", List.of())))
                .isInstanceOf(AiGuideException.class)
                .actual() instanceof AiGuideException aiGuideException ? aiGuideException : null;

        assertThat(exception.getErrorReason().getCode()).isEqualTo("AIGUIDE4221");
        server.verify();
    }

    @Test
    void repeatedFailedEquivalentToolCallUsesCachedFailureWithoutExecutingAgain() {
        AiGuideProperties properties = properties();
        properties.setMaxToolRounds(3);
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.searchPlaces(any()))
                .thenReturn(new DdemachimMcpTools.McpToolResponse<>(
                        false, "MCP500", "장소 검색을 처리할 수 없습니다.", null));

        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse(
                                "search_places", "call_1",
                                "{\"district\":\"종로구\",\"tag\":\"FILMING_LOCATION\"}"),
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(content().string(containsString("\"type\":\"function_call_output\"")))
                .andRespond(withSuccess(functionCallResponse(
                                "search_places", "call_2",
                                "{\"tag\":\"FILMING_LOCATION\",\"district\":\"종로구\"}"),
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(content().string(containsString("\"type\":\"function_call_output\"")))
                .andRespond(withSuccess(finalResponse("촬영지 검색을 처리할 수 없어요.", "resp_3"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties, mcpTools, builder.build())
                .complete(new AiGuideRequest("종로에서 촬영지 코스 추천해줘", List.of()));

        assertThat(reply.answer()).isEqualTo("촬영지 검색을 처리할 수 없어요.");
        verify(mcpTools, times(1)).searchPlaces(any());
        server.verify();
    }

    @Test
    void emptyPlaceSearchReturnsClarificationWithoutStartingAnotherToolRound() {
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.searchPlaces(any())).thenReturn(new DdemachimMcpTools.McpToolResponse<>(
                true, "COMMON200", "성공", new AiPlaceSearchService.SearchResult(List.of())));
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse(
                                "search_places", "call_1",
                                "{\"query\":\"카페\",\"area\":\"종로3가역\",\"categories\":[\"CAFE\"]}"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties(), mcpTools, builder.build())
                .complete(new AiGuideRequest("종로3가역에서 3시간 코스", List.of()));

        assertThat(reply.answer()).contains("검색 결과", "기준 지역", "장소 유형");
        verify(mcpTools, times(1)).searchPlaces(any());
        server.verify();
    }

    @Test
    void incompleteCreateCourseReturnsClarificationWithoutExecutingOrStartingAnotherRound() {
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.searchPlaces(any())).thenReturn(new DdemachimMcpTools.McpToolResponse<>(
                true,
                "COMMON200",
                "성공",
                new AiPlaceSearchService.SearchResult(List.of(searchPlace()))));

        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse(
                                "search_places", "call_1",
                                "{\"district\":\"종로구\",\"tag\":\"FILMING_LOCATION\"}"),
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(content().string(containsString("function_call_output")))
                .andRespond(withSuccess(functionCallResponse("create_course", "call_2", "{}"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties(), mcpTools, builder.build())
                .complete(new AiGuideRequest("종로에서 촬영지 코스 추천해줘", List.of()));

        assertThat(reply.answer())
                .contains("코스 날짜", "출발 시각", "출발 위치", "코스에 담은 장소", "로그인")
                .doesNotContain("검색 결과의 placeId");
        verify(mcpTools).searchPlaces(any());
        verify(mcpTools, times(0)).createCourse(any());
        server.verify();
    }

    @Test
    void incompleteAiCourseAsksOnlyForMissingRequiredConditions() {
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(content().string(allOf(
                        containsString("client_context.currentLocation: unavailable"),
                        containsString("\"name\":\"search_nearby_places\""),
                        containsString("\"name\":\"create_ai_course\""))))
                .andRespond(withSuccess(functionCallResponse(
                        "create_ai_course", "call_ai_1",
                        "{\"date\":\"2026-08-21\",\"candidatePlaceIds\":[31]}"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties(), mcpTools, builder.build())
                .complete(new AiGuideRequest("서촌 코스 짜줘", List.of()));

        assertThat(reply.answer()).contains("출발 시각", "출발 위치", "사용 가능 시간")
                .doesNotContain("로그인", "장바구니");
        verify(mcpTools, times(0)).createAiCourse(any());
        server.verify();
    }

    @Test
    void incompleteAiCourseReturnsClarificationWithoutExecutingOrStartingAnotherRound() {
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse(
                                "create_ai_course", "call_ai_1",
                                "{\"date\":\"2026-08-21\",\"startTime\":\"10:00\","
                                        + "\"startLocation\":{\"name\":\"종로3가역\"},"
                                        + "\"availableMinutes\":180,\"candidatePlaceIds\":[31]}"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties(), mcpTools, builder.build())
                .complete(new AiGuideRequest("종로3가역에서 오늘 3시간 코스", List.of()));

        assertThat(reply.answer()).contains("출발 위치 좌표");
        verify(mcpTools, times(0)).createAiCourse(any());
        server.verify();
    }

    @Test
    void previousResponseIdContinuesToolContextWithoutDuplicatingTextHistory() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(content().string(allOf(
                        containsString("\"previous_response_id\":\"resp_search_results\""),
                        containsString("첫 번째 갈래"),
                        not(containsString("이전 추천 목록 문장")))))
                .andRespond(withSuccess(finalResponse("첫 번째 장소를 필수 장소로 유지했어요.", "resp_followup"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties(), mock(DdemachimMcpTools.class), builder.build())
                .complete(new AiGuideRequest("첫 번째 갈래", List.of(
                        new AiGuideRequest.HistoryMessage(AiGuideRequest.Role.ASSISTANT, "이전 추천 목록 문장")),
                        null, "resp_search_results"));

        assertThat(reply.responseId()).isEqualTo("resp_followup");
        server.verify();
    }

    @Test
    void browserLocationIsPassedAsExplicitClientContext() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(content().string(allOf(
                        containsString("client_context.currentLocation"),
                        containsString("latitude=37.577"),
                        containsString("longitude=126.972"))))
                .andRespond(withSuccess(finalResponse("주변을 찾아볼게요.", "resp_location"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties(), mock(DdemachimMcpTools.class), builder.build())
                .complete(new AiGuideRequest("주변 맛집 추천해줘", List.of(),
                        new AiGuideRequest.CurrentLocation(37.577, 126.972)));

        assertThat(reply.answer()).isEqualTo("주변을 찾아볼게요.");
        server.verify();
    }

    @Test
    void createCourseAuthenticationFailureReturnsClarificationInsteadOfRepeatingCachedFailure() {
        SecurityContextHolder.getContext().setAuthentication(new MemberAuthentication(42L, List.of()));
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.createCourse(any())).thenReturn(new DdemachimMcpTools.McpToolResponse<>(
                false, "MCP401", "코스 생성을 위해 인증이 필요합니다.", null));

        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse(
                                "create_course", "call_1",
                                "{\"serviceDate\":\"2026-08-20\",\"desiredStartTime\":\"10:00:00\","
                                        + "\"start\":{\"type\":\"CURRENT_LOCATION\",\"latitude\":37.57,\"longitude\":126.97},"
                                        + "\"places\":[{\"basketItemId\":9,\"dwellMinutes\":60}]}"),
                        MediaType.APPLICATION_JSON));

        var reply = client(properties(), mcpTools, builder.build())
                .complete(new AiGuideRequest("코스를 만들어줘", List.of()));

        assertThat(reply.answer()).contains("로그인");
        verify(mcpTools).createCourse(any());
        server.verify();
    }

    @Test
    void followUpHistoryRemainsUsableAfterClarification() {
        DdemachimMcpTools mcpTools = mock(DdemachimMcpTools.class);
        when(mcpTools.getPlaceDetail(new DdemachimMcpTools.PlaceDetailRequest(101L)))
                .thenReturn(new DdemachimMcpTools.McpToolResponse<>(true, "COMMON200", "성공", (PlaceDetailResponse) null));

        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andExpect(content().string(containsString("코스를 만들려면 코스 날짜")))
                .andRespond(withSuccess(functionCallResponse("get_place_detail", "call_1", "{\"placeId\":101}"),
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(finalResponse("장소 정보를 확인했어요.", "resp_2"), MediaType.APPLICATION_JSON));

        var reply = client(properties(), mcpTools, builder.build())
                .complete(new AiGuideRequest(
                        "경복궁을 자세히 알려줘",
                        List.of(new AiGuideRequest.HistoryMessage(
                                AiGuideRequest.Role.ASSISTANT,
                                "코스를 만들려면 코스 날짜 정보가 필요해요."))));

        assertThat(reply.answer()).isEqualTo("장소 정보를 확인했어요.");
        verify(mcpTools).getPlaceDetail(new DdemachimMcpTools.PlaceDetailRequest(101L));
        server.verify();
    }

    @Test
    void quotaResponseBecomesStructuredQuotaError() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        AiGuideException exception = assertThatThrownBy(() ->
                client(properties(), mock(DdemachimMcpTools.class), builder.build())
                        .complete(new AiGuideRequest("도와줘", List.of())))
                .isInstanceOf(AiGuideException.class)
                .actual() instanceof AiGuideException aiGuideException ? aiGuideException : null;

        assertThat(exception.getErrorReason().getCode()).isEqualTo("AIGUIDE4291");
        server.verify();
    }

    @Test
    void missingApiKeyBecomesStructuredConfigurationError() {
        AiGuideProperties properties = properties();
        properties.setApiKey("");

        AiGuideException exception = assertThatThrownBy(() ->
                client(properties, mock(DdemachimMcpTools.class), RestClient.builder().build())
                        .complete(new AiGuideRequest("도와줘", List.of())))
                .isInstanceOf(AiGuideException.class)
                .actual() instanceof AiGuideException aiGuideException ? aiGuideException : null;

        assertThat(exception.getErrorReason().getCode()).isEqualTo("AIGUIDE5031");
    }

    @Test
    void createCourseFunctionUsesExistingAuthenticatedMcpToolPath() {
        SecurityContextHolder.getContext().setAuthentication(new MemberAuthentication(42L, List.of()));
        CoursePreviewService coursePreviewService = mock(CoursePreviewService.class);
        when(coursePreviewService.preview(eq(42L), any())).thenReturn(null);
        DdemachimMcpTools mcpTools = new DdemachimMcpTools(
                mock(PlaceQueryService.class),
                mock(CrowdingService.class),
                mock(RouteComparisonService.class),
                coursePreviewService);
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(functionCallResponse(
                                "create_course", "call_1",
                                "{\"serviceDate\":\"2026-08-20\",\"desiredStartTime\":\"10:00:00\","
                                        + "\"start\":{\"type\":\"CURRENT_LOCATION\",\"name\":null,"
                                        + "\"latitude\":37.57,\"longitude\":126.97},"
                                        + "\"places\":[{\"basketItemId\":9,\"dwellMinutes\":60,"
                                        + "\"arrivalDeadline\":null}],\"strategy\":null}"),
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(RESPONSES_URL))
                .andRespond(withSuccess(finalResponse("코스 조건을 확인했어요.", "resp_2"), MediaType.APPLICATION_JSON));

        var reply = client(properties(), mcpTools, builder.build())
                .complete(new AiGuideRequest("코스를 짜줘", List.of()));

        assertThat(reply.answer()).isEqualTo("코스 조건을 확인했어요.");
        verify(coursePreviewService).preview(eq(42L), any());
        server.verify();
    }

    private static OpenAiResponsesClient client(
            AiGuideProperties properties, DdemachimMcpTools mcpTools, RestClient restClient) {
        ObjectMapper objectMapper = JsonMapper.builder().build();
        return new OpenAiResponsesClient(properties, objectMapper, mcpTools, restClient);
    }

    private static OpenAiResponsesClient client(
            AiGuideProperties properties, DdemachimMcpTools mcpTools, RestClient restClient, Clock clock) {
        ObjectMapper objectMapper = JsonMapper.builder().build();
        return new OpenAiResponsesClient(properties, objectMapper, mcpTools, restClient, clock);
    }

    private static AiGuideProperties properties() {
        AiGuideProperties properties = new AiGuideProperties();
        properties.setApiKey("test-openai-key");
        properties.setBaseUrl("https://example.test");
        properties.setModel("gpt-5.6-luna");
        properties.setMaxToolRounds(3);
        properties.setMaxToolCalls(4);
        return properties;
    }

    private static String functionCallResponse(String name, String callId, String arguments) {
        return "{\"id\":\"resp_1\",\"status\":\"completed\",\"output\":[{"
                + "\"type\":\"function_call\",\"call_id\":\"" + callId + "\",\"name\":\"" + name
                + "\",\"arguments\":" + jsonString(arguments) + "}]}";
    }

    private static AiPlaceSearchService.SearchPlace searchPlace() {
        return new AiPlaceSearchService.SearchPlace(
                101L, "테스트 장소", "CAFE", 37.57, 126.98,
                null, null, 60, List.of());
    }

    private static String finalResponse(String answer, String responseId) {
        return "{\"id\":\"" + responseId + "\",\"status\":\"completed\",\"output\":[{"
                + "\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\""
                + answer + "\"}]}]}";
    }

    private static String jsonString(String value) {
        try {
            return JsonMapper.builder().build().writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
