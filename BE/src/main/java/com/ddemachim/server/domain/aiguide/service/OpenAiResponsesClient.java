package com.ddemachim.server.domain.aiguide.service;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;
import com.ddemachim.server.domain.aiguide.exception.AiGuideErrorStatus;
import com.ddemachim.server.domain.aiguide.exception.AiGuideException;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import com.ddemachim.server.domain.place.service.AiPlaceSearchService;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.global.mcp.DdemachimMcpTools;
import com.ddemachim.server.global.properties.AiGuideProperties;
import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Component
@Slf4j
public class OpenAiResponsesClient implements AiGuideLlmClient {

    private static final String RESPONSES_PATH = "/v1/responses";
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String SYSTEM_INSTRUCTION = """
            당신은 서울 도보 여행 서비스 때마침의 AI 가이드입니다.
            장소, 혼잡도, 이동시간, 코스에 관한 사실은 제공된 때마침 함수 도구를 우선 사용하세요.
            도구 결과에 없는 정보는 추측하지 말고 확인이 필요한 점을 짧게 질문하세요.
            답변은 친절하고 간결한 한국어로 작성하고, 장소를 추천할 때는 근거와 주의사항을 함께 알려주세요.
            사용자가 단순히 장소를 추천해 달라고 하면 날짜, 시작 시간, 혼잡도 정보를 추가로 요구하지 말고 search_places만 호출해 결과를 추천하세요.
            사용자가 “경복궁 주변 카페”처럼 명시한 기준 장소 주변을 요청하면 search_places_near_reference를 호출하세요. 이 도구는 기준 장소를 먼저 해석해 좌표를 얻고, 그 반경 안의 때마침 저장 장소만 반환합니다. 기준 장소 자체를 추천 결과에 섞지 마세요.
            혼잡도, 이동시간 또는 코스 생성은 사용자가 해당 조건을 명시적으로 요청했을 때만 관련 도구를 호출하세요.
            search_places의 visitDate는 선택 사항이며 장소의 등록일이 아니라 방문 예정일에 운영시간을 확인하기 위한 값입니다. 날짜가 없다는 이유로 장소 추천을 미루지 말고, 등록일 기준으로 검색했다는 표현도 사용하지 마세요.
            주변 검색 좌표는 오직 client_context에 제공된 현재 위치 또는 사용자가 명시한 기준 장소를 검색해 얻은 좌표만 사용하세요. 좌표가 없으면 현재 위치 허용 또는 기준 지역/역을 질문하고 임의 좌표를 만들지 마세요.
            AI 추천 코스에는 create_ai_course를 사용하세요. search_places/search_nearby_places가 반환한 실제 placeId만 사용하고 ID를 만들지 마세요.
            사용자가 반드시 가겠다고 한 장소는 requiredPlaceIds, 나머지 검색 후보는 candidatePlaceIds로 구분하세요. 최종 순서는 직접 정하지 말고 create_ai_course 결과를 설명하세요.
            create_ai_course에 날짜, 시작 시각, 출발 좌표, 사용 가능 시간이 하나라도 없으면 호출하지 말고 빠진 정보만 질문하세요. 이전 대화의 지역·날짜·선택 장소와 현재 답변을 합쳐 판단하세요.
            단, 사용자가 “지금”, “지금부터”, “바로 시작” 또는 “당장”이라고 하면 client_context.currentTime을 시작 시각, client_context.currentDate를 날짜로 사용하세요. client_context.currentLocation이 제공된 경우에는 그 좌표를 출발 위치로 사용하고 위치를 다시 묻지 마세요.
            이동 방식이나 빠르게/여유롭게 같은 경로 선호는 사용자에게 필수로 묻지 마세요. create_ai_course의 routePreference와 schedulePreference는 제공되지 않으면 각각 FAST와 BALANCED로 정해 호출하세요.
            기존 create_course는 장바구니 화면의 basketItemId 기반 미리보기 호환 기능이며 AI 추천 코스에는 사용하지 마세요.
            """;

    private final RestClient restClient;
    private final AiGuideProperties properties;
    private final ObjectMapper objectMapper;
    private final DdemachimMcpTools mcpTools;
    private final Clock clock;

    @Autowired
    public OpenAiResponsesClient(
            AiGuideProperties properties,
            ObjectMapper objectMapper,
            DdemachimMcpTools mcpTools) {
        this(properties, objectMapper, mcpTools, RestClient.builder(), Clock.system(SEOUL));
    }

    OpenAiResponsesClient(
            AiGuideProperties properties,
            ObjectMapper objectMapper,
            DdemachimMcpTools mcpTools,
            RestClient.Builder restClientBuilder) {
        this(properties, objectMapper, mcpTools, restClientBuilder, Clock.system(SEOUL));
    }

    private OpenAiResponsesClient(
            AiGuideProperties properties,
            ObjectMapper objectMapper,
            DdemachimMcpTools mcpTools,
            RestClient.Builder restClientBuilder,
            Clock clock) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.mcpTools = mcpTools;
        this.clock = clock;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(durationOrDefault(properties.getConnectTimeout(), Duration.ofSeconds(3)));
        requestFactory.setReadTimeout(durationOrDefault(properties.getReadTimeout(), Duration.ofSeconds(45)));
        this.restClient = restClientBuilder
                .baseUrl(StringUtils.hasText(properties.getBaseUrl())
                        ? properties.getBaseUrl()
                        : "https://api.openai.com")
                .requestFactory(requestFactory)
                .build();
    }

    OpenAiResponsesClient(
            AiGuideProperties properties,
            ObjectMapper objectMapper,
            DdemachimMcpTools mcpTools,
            RestClient restClient) {
        this(properties, objectMapper, mcpTools, restClient, Clock.system(SEOUL));
    }

    OpenAiResponsesClient(
            AiGuideProperties properties,
            ObjectMapper objectMapper,
            DdemachimMcpTools mcpTools,
            RestClient restClient,
            Clock clock) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.mcpTools = mcpTools;
        this.restClient = restClient;
        this.clock = clock;
    }

    @Override
    public LlmReply complete(AiGuideRequest request) {
        validateConfiguration();
        List<Map<String, Object>> input = initialInput(request);
        String previousResponseId = StringUtils.hasText(request.previousResponseId())
                ? request.previousResponseId() : null;
        int toolCalls = 0;
        Map<String, Object> failedToolResults = new LinkedHashMap<>();
        List<Long> recommendedPlaceIds = new ArrayList<>();

        for (int round = 0; round < properties.getMaxToolRounds(); round++) {
            JsonNode response = requestResponse(input, previousResponseId);
            String responseId = textValue(response.path("id"));
            List<JsonNode> functionCalls = functionCalls(response);
            String answer = extractAnswer(response);
            if (functionCalls.isEmpty()) {
                if (StringUtils.hasText(answer)) {
                    return new LlmReply(answer, responseId, List.copyOf(recommendedPlaceIds));
                }
                throw new AiGuideException(AiGuideErrorStatus.INVALID_UPSTREAM_RESPONSE);
            }
            if (!StringUtils.hasText(responseId)) {
                throw new AiGuideException(AiGuideErrorStatus.INVALID_UPSTREAM_RESPONSE);
            }
            LlmReply clarification = courseClarification(functionCalls, responseId, request);
            if (clarification != null) {
                return clarification;
            }
            if (toolCalls + functionCalls.size() > properties.getMaxToolCalls()) {
                throw new AiGuideException(AiGuideErrorStatus.TOOL_LIMIT_EXCEEDED);
            }

            input = new ArrayList<>();
            for (JsonNode functionCall : functionCalls) {
                toolCalls++;
                FunctionResult functionResult = functionResult(functionCall, failedToolResults, request);
                if (functionResult.clarification() != null) {
                    return new LlmReply(functionResult.clarification(), responseId);
                }
                appendRecommendedPlaceIds(recommendedPlaceIds, functionResult.result());
                input.add(functionResult.input());
            }
            previousResponseId = responseId;
        }
        throw new AiGuideException(AiGuideErrorStatus.TOOL_LIMIT_EXCEEDED);
    }

    private JsonNode requestResponse(List<Map<String, Object>> input, String previousResponseId) {
        try {
            JsonNode response = restClient.post()
                    .uri(RESPONSES_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getApiKey())
                    .body(buildRequestBody(input, previousResponseId))
                    .retrieve()
                    .body(JsonNode.class);
            if (response == null || response.isNull()) {
                log.warn("OpenAI Responses API returned an empty response: model={}", properties.getModel());
                throw new AiGuideException(AiGuideErrorStatus.INVALID_UPSTREAM_RESPONSE);
            }
            return response;
        } catch (AiGuideException exception) {
            throw exception;
        } catch (ResourceAccessException exception) {
            if (hasCause(exception, SocketTimeoutException.class)
                    || hasCause(exception, HttpTimeoutException.class)) {
                log.warn("OpenAI Responses API request timed out: model={}, readTimeout={}",
                        properties.getModel(), properties.getReadTimeout());
                throw new AiGuideException(AiGuideErrorStatus.UPSTREAM_TIMEOUT, exception);
            }
            log.warn("OpenAI Responses API connection failed: model={}, cause={}",
                    properties.getModel(), rootCauseName(exception));
            throw new AiGuideException(AiGuideErrorStatus.UPSTREAM_UNAVAILABLE, exception);
        } catch (RestClientResponseException exception) {
            log.warn("OpenAI Responses API rejected request: httpStatus={}, model={}, providerError={}",
                    exception.getStatusCode().value(), properties.getModel(), providerErrorSummary(exception));
            if (exception.getStatusCode().value() == 429) {
                throw new AiGuideException(AiGuideErrorStatus.QUOTA_EXCEEDED, exception);
            }
            if (exception.getStatusCode().value() == 401
                    || exception.getStatusCode().value() == 403) {
                throw new AiGuideException(AiGuideErrorStatus.CONFIGURATION, exception);
            }
            if (exception.getStatusCode().value() == 400
                    || exception.getStatusCode().value() == 404) {
                // 잘못된 모델명, 요청 형식, base URL 등은 연결 장애가 아니라 설정 문제다.
                throw new AiGuideException(AiGuideErrorStatus.CONFIGURATION, exception);
            }
            throw new AiGuideException(AiGuideErrorStatus.UPSTREAM_UNAVAILABLE, exception);
        } catch (RestClientException | IllegalArgumentException exception) {
            log.warn("OpenAI Responses API request failed: model={}, cause={}",
                    properties.getModel(), rootCauseName(exception));
            throw new AiGuideException(AiGuideErrorStatus.UPSTREAM_UNAVAILABLE, exception);
        }
    }

    private String providerErrorSummary(RestClientResponseException exception) {
        String responseBody = exception.getResponseBodyAsString();
        if (!StringUtils.hasText(responseBody)) {
            return "empty";
        }
        try {
            JsonNode error = objectMapper.readTree(responseBody).path("error");
            String status = textValue(error.path("code"));
            if (!StringUtils.hasText(status)) {
                status = textValue(error.path("type"));
            }
            String message = textValue(error.path("message"));
            return "status=%s, message=%s".formatted(
                    StringUtils.hasText(status) ? status : "unknown",
                    abbreviate(message, 240));
        } catch (JacksonException ignored) {
            return "unparseable";
        }
    }

    private static String abbreviate(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return "unknown";
        }
        String singleLine = value.replaceAll("[\\r\\n]+", " ").trim();
        return singleLine.length() <= maxLength
                ? singleLine
                : singleLine.substring(0, maxLength) + "…";
    }

    private static boolean hasCause(Throwable throwable, Class<? extends Throwable> causeType) {
        for (Throwable current = throwable; current != null; current = current.getCause()) {
            if (causeType.isInstance(current)) {
                return true;
            }
        }
        return false;
    }

    private static String rootCauseName(Throwable throwable) {
        Throwable root = throwable;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName();
    }

    private Map<String, Object> buildRequestBody(
            List<Map<String, Object>> input, String previousResponseId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.getModel());
        body.put("input", input);
        body.put("instructions", SYSTEM_INSTRUCTION);
        body.put("tools", functionTools());
        body.put("store", true);
        body.put("max_output_tokens", properties.getMaxOutputTokens());
        body.put("tool_choice", "auto");
        body.put("parallel_tool_calls", false);
        if (StringUtils.hasText(previousResponseId)) {
            body.put("previous_response_id", previousResponseId);
        }
        return body;
    }

    private List<Map<String, Object>> initialInput(AiGuideRequest request) {
        List<Map<String, Object>> input = new ArrayList<>();
        input.add(message("developer", "client_context.currentDate: " + LocalDate.now(clock)
                + " (Asia/Seoul), client_context.currentTime: " + LocalTime.now(clock).withSecond(0).withNano(0)
                + ". 오늘/내일/모레와 지금 같은 상대 시간은 이 날짜와 시각을 기준으로 해석하세요."));
        if (request.currentLocation() != null
                && request.currentLocation().latitude() != null
                && request.currentLocation().longitude() != null) {
            input.add(message("developer", "client_context.currentLocation: latitude=%s, longitude=%s. "
                    .formatted(request.currentLocation().latitude(), request.currentLocation().longitude())
                    + "이 좌표는 브라우저 위치 권한으로 제공되었습니다."));
        } else {
            input.add(message("developer", "client_context.currentLocation: unavailable. 주변 검색 좌표를 추측하지 마세요."));
        }
        if (!StringUtils.hasText(request.previousResponseId())) {
            for (AiGuideRequest.HistoryMessage history : request.safeHistory()) {
                if (history == null || history.role() == null || !StringUtils.hasText(history.content())) {
                    continue;
                }
                input.add(message(
                        history.role() == AiGuideRequest.Role.ASSISTANT ? "assistant" : "user",
                        history.content()));
            }
        }
        input.add(message("user", request.message()));
        return input;
    }

    private static Map<String, Object> message(String role, String text) {
        return Map.of("role", role, "content", text);
    }

    private List<JsonNode> functionCalls(JsonNode interaction) {
        List<JsonNode> calls = new ArrayList<>();
        JsonNode output = interaction.path("output");
        if (!output.isArray()) {
            return calls;
        }
        for (JsonNode item : output) {
            if (!"function_call".equals(item.path("type").asText())) {
                continue;
            }
            String callId = callId(item);
            if (!StringUtils.hasText(textValue(item.path("name")))
                    || !StringUtils.hasText(callId)
                    || item.path("arguments").isMissingNode()
                    || item.path("arguments").isNull()) {
                throw new AiGuideException(AiGuideErrorStatus.INVALID_TOOL_CALL);
            }
            calls.add(item);
        }
        return calls;
    }

    private FunctionResult functionResult(
            JsonNode functionCall, Map<String, Object> failedToolResults, AiGuideRequest request) {
        String name = textValue(functionCall.path("name"));
        String callId = callId(functionCall);
        try {
            NormalizedToolArguments normalized = normalizeToolArguments(
                    name, functionCall.path("arguments"), request);
            if (normalized.clarification() != null) {
                return new FunctionResult(null, normalized.clarification(), null);
            }
            String toolCallKey = canonicalToolCallKey(name, normalized.arguments());
            Object result;
            if (failedToolResults.containsKey(toolCallKey)) {
                result = failedToolResults.get(toolCallKey);
            } else {
                result = executeTool(name, normalized.arguments());
                if (isFailedToolResult(result)) {
                    failedToolResults.put(toolCallKey, result);
                }
            }
            String clarification = emptyPlaceSearchClarification(name, result);
            if (clarification == null) {
                clarification = createCourseFailureClarification(name, result);
            }
            Map<String, Object> input = Map.of(
                    "type", "function_call_output",
                    "call_id", callId,
                    "output", objectMapper.writeValueAsString(result));
            return new FunctionResult(input, clarification, result);
        } catch (AiGuideException exception) {
            throw exception;
        } catch (JacksonException | IllegalArgumentException exception) {
            throw new AiGuideException(AiGuideErrorStatus.INVALID_TOOL_CALL, exception);
        }
    }

    private NormalizedToolArguments normalizeToolArguments(
            String name, JsonNode arguments, AiGuideRequest request)
            throws JacksonException {
        JsonNode argumentObject = arguments;
        if (arguments.isTextual()) {
            argumentObject = objectMapper.readTree(arguments.asText());
        }
        if (argumentObject == null || !argumentObject.isObject()) {
            throw new AiGuideException(AiGuideErrorStatus.INVALID_TOOL_CALL);
        }
        if ("create_ai_course".equals(name)) {
            enrichImmediateAiCourseArguments((ObjectNode) argumentObject, request);
        }
        String dateField = switch (name) {
            case "search_places" -> "visitDate";
            case "create_ai_course" -> "date";
            default -> null;
        };
        if (dateField == null || !argumentObject.path(dateField).isTextual()) {
            return new NormalizedToolArguments(argumentObject, null);
        }
        String rawDate = argumentObject.path(dateField).asText().trim();
        if (!StringUtils.hasText(rawDate)) {
            return new NormalizedToolArguments(argumentObject, null);
        }
        LocalDate resolvedDate = resolveVisitDate(rawDate);
        if (resolvedDate == null) {
            log.warn("AI tool date argument could not be normalized: tool={}, field={}", name, dateField);
            return new NormalizedToolArguments(null,
                    "방문 날짜를 확인하기 어려워요. 오늘, 내일, 모레 또는 YYYY-MM-DD 형식으로 알려주세요.");
        }
        ObjectNode normalized = (ObjectNode) argumentObject;
        normalized.put(dateField, resolvedDate.toString());
        return new NormalizedToolArguments(normalized, null);
    }

    private void enrichImmediateAiCourseArguments(ObjectNode arguments, AiGuideRequest request) {
        if (!requestsImmediateStart(request)) {
            return;
        }
        if (isMissing(arguments, "date")) {
            arguments.put("date", LocalDate.now(clock).toString());
        }
        if (isMissing(arguments, "startTime")
                || isCurrentTimeExpression(textValue(arguments.path("startTime")))) {
            arguments.put("startTime", LocalTime.now(clock).withSecond(0).withNano(0).toString());
        }
        if (hasCurrentLocation(request)) {
            JsonNode startLocation = arguments.path("startLocation");
            ObjectNode location = startLocation.isObject()
                    ? (ObjectNode) startLocation : arguments.putObject("startLocation");
            if (isMissing(location, "latitude")) {
                location.put("latitude", request.currentLocation().latitude());
            }
            if (isMissing(location, "longitude")) {
                location.put("longitude", request.currentLocation().longitude());
            }
            if (isMissing(location, "name")) {
                location.put("name", "현재 위치");
            }
        }
        if (isMissing(arguments, "routePreference")) {
            arguments.put("routePreference", AiCourseRequest.RoutePreference.FAST.name());
        }
        if (isMissing(arguments, "schedulePreference")) {
            arguments.put("schedulePreference", AiCourseRequest.SchedulePreference.BALANCED.name());
        }
    }

    private static boolean isCurrentTimeExpression(String value) {
        return "지금".equals(value) || "현재".equals(value) || "현재 시각".equals(value);
    }

    private static boolean requestsImmediateStart(AiGuideRequest request) {
        String message = request.message();
        return StringUtils.hasText(message)
                && (message.contains("지금") || message.contains("지금부터")
                || message.contains("바로 시작") || message.contains("당장"));
    }

    private static boolean hasCurrentLocation(AiGuideRequest request) {
        return request.currentLocation() != null
                && request.currentLocation().latitude() != null
                && request.currentLocation().longitude() != null;
    }

    private LocalDate resolveVisitDate(String rawDate) {
        LocalDate today = LocalDate.now(clock);
        return switch (rawDate) {
            case "오늘" -> today;
            case "내일" -> today.plusDays(1);
            case "모레" -> today.plusDays(2);
            default -> {
                try {
                    yield LocalDate.parse(rawDate);
                } catch (DateTimeParseException ignored) {
                    yield null;
                }
            }
        };
    }

    private LlmReply courseClarification(
            List<JsonNode> functionCalls, String interactionId, AiGuideRequest request) {
        for (JsonNode functionCall : functionCalls) {
            String toolName = textValue(functionCall.path("name"));
            if ("create_ai_course".equals(toolName)) {
                List<String> missing = missingAiCourseInputs(functionCall.path("arguments"), request);
                if (!missing.isEmpty()) {
                    return new LlmReply("AI 코스를 만들려면 " + String.join(", ", missing)
                            + " 정보가 필요해요. 확인해서 알려주시면 추천해드릴게요.", interactionId);
                }
                continue;
            }
            if (!"create_course".equals(toolName)) {
                continue;
            }
            List<String> missing = missingCourseInputs(functionCall.path("arguments"));
            if (!hasAuthenticatedMember()) {
                missing.add("로그인");
            }
            if (!missing.isEmpty()) {
                return new LlmReply(courseClarificationMessage(missing), interactionId);
            }
        }
        return null;
    }

    private List<String> missingAiCourseInputs(JsonNode arguments, AiGuideRequest request) {
        if (arguments == null || arguments.isMissingNode() || arguments.isNull()) {
            return new ArrayList<>(List.of("코스 날짜", "출발 시각", "출발 위치", "사용 가능 시간", "추천 후보 장소"));
        }
        if (arguments.isTextual()) {
            try {
                arguments = objectMapper.readTree(arguments.asText());
            } catch (JacksonException exception) {
                return new ArrayList<>();
            }
        }
        if (!arguments.isObject()) {
            return new ArrayList<>();
        }

        List<String> missing = new ArrayList<>();
        boolean immediateStart = requestsImmediateStart(request);
        if (isMissing(arguments, "date") && !immediateStart) missing.add("코스 날짜");
        if (isMissing(arguments, "startTime") && !immediateStart) missing.add("출발 시각");
        if (isMissing(arguments, "availableMinutes")) missing.add("사용 가능 시간");
        JsonNode startLocation = arguments.path("startLocation");
        if (!startLocation.isObject()) {
            if (!hasCurrentLocation(request)) missing.add("출발 위치");
        } else if (isMissing(startLocation, "latitude") || isMissing(startLocation, "longitude")) {
            if (!hasCurrentLocation(request)) missing.add("출발 위치 좌표");
        }
        JsonNode required = arguments.path("requiredPlaceIds");
        JsonNode candidates = arguments.path("candidatePlaceIds");
        if ((!required.isArray() || required.isEmpty()) && (!candidates.isArray() || candidates.isEmpty())) {
            missing.add("추천 후보 장소");
        }
        return missing;
    }

    private List<String> missingCourseInputs(JsonNode arguments) {
        if (arguments == null || arguments.isMissingNode() || arguments.isNull()) {
            return new ArrayList<>(List.of("코스 날짜", "출발 시각", "출발 위치", "코스에 담은 장소와 장소별 체류 시간"));
        }
        if (arguments.isTextual()) {
            try {
                arguments = objectMapper.readTree(arguments.asText());
            } catch (JacksonException exception) {
                return new ArrayList<>();
            }
        }
        if (!arguments.isObject()) {
            return new ArrayList<>();
        }

        List<String> missing = new ArrayList<>();
        if (isMissing(arguments, "serviceDate")) {
            missing.add("코스 날짜");
        }
        if (isMissing(arguments, "desiredStartTime")) {
            missing.add("출발 시각");
        }

        JsonNode start = arguments.path("start");
        if (!start.isObject()) {
            missing.add("출발 위치");
        } else {
            if (isMissing(start, "type")) {
                missing.add("출발 위치 유형");
            }
            if (isMissing(start, "latitude") || isMissing(start, "longitude")) {
                missing.add("출발 위치 좌표");
            }
            if ("SEARCHED_PLACE".equals(start.path("type").asText()) && isMissing(start, "name")) {
                missing.add("출발 장소 이름");
            }
        }

        JsonNode places = arguments.path("places");
        if (!places.isArray() || places.isEmpty()) {
            missing.add("코스에 담은 장소");
        } else {
            boolean missingBasketItem = false;
            boolean missingDwell = false;
            for (JsonNode place : places) {
                if (!place.isObject() || isMissing(place, "basketItemId")) {
                    missingBasketItem = true;
                }
                if (!place.isObject() || isMissing(place, "dwellMinutes")) {
                    missingDwell = true;
                }
            }
            if (missingBasketItem) {
                missing.add("코스에 담은 장소");
            }
            if (missingDwell) {
                missing.add("장소별 체류 시간");
            }
        }
        return missing;
    }

    private static boolean isMissing(JsonNode object, String fieldName) {
        JsonNode value = object.path(fieldName);
        return value.isMissingNode() || value.isNull()
                || (value.isTextual() && !StringUtils.hasText(value.asText()));
    }

    private static String courseClarificationMessage(List<String> missing) {
        return "코스를 만들려면 " + String.join(", ", missing)
                + " 정보가 필요해요. 확인해서 알려주시면 바로 추천해드릴게요.";
    }

    private static boolean hasAuthenticatedMember() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null
                && authentication.isAuthenticated()
                && authentication.getPrincipal() instanceof Number;
    }

    private static String createCourseFailureClarification(String name, Object result) {
        if (!(result instanceof DdemachimMcpTools.McpToolResponse<?> response)
                || response.isSuccess()
                || !"create_course".equals(name)) {
            return null;
        }
        return switch (response.code()) {
            case "MCP401" -> "코스를 만들려면 먼저 로그인해 주세요. 로그인 후 코스에 담을 장소를 알려주시면 추천해드릴게요.";
            case "COURSE4041" -> "검색 결과의 장소를 먼저 회원님의 코스에 담아 주세요. 코스에 담은 장소와 각 체류 시간을 알려주시면 계산해드릴게요.";
            case "MCP400", "COURSE4001" -> "코스 날짜, 출발 시각, 출발 위치, 코스에 담은 장소와 각 체류 시간을 확인해 주세요.";
            default -> null;
        };
    }

    private static String emptyPlaceSearchClarification(String name, Object result) {
        if (!"search_places".equals(name)
                || !(result instanceof DdemachimMcpTools.McpToolResponse<?> response)
                || !response.isSuccess()
                || !(response.result() instanceof AiPlaceSearchService.SearchResult searchResult)
                || !searchResult.places().isEmpty()) {
            return null;
        }
        return "검색 결과가 없어요. 기준 지역 또는 원하는 장소 유형을 조금 더 구체적으로 알려주세요.";
    }

    private static void appendRecommendedPlaceIds(List<Long> target, Object result) {
        if (target.size() >= 6) {
            return;
        }
        if (!(result instanceof DdemachimMcpTools.McpToolResponse<?> response) || !response.isSuccess()) {
            return;
        }
        List<Long> ids;
        if (response.result() instanceof AiPlaceSearchService.SearchResult search) {
            ids = search.places().stream().map(AiPlaceSearchService.SearchPlace::placeId).toList();
        } else if (response.result() instanceof AiPlaceSearchService.NearbyResult nearby) {
            ids = nearby.places().stream().map(AiPlaceSearchService.NearbyPlace::placeId).toList();
        } else {
            ids = List.of();
        }
        ids.stream().filter(java.util.Objects::nonNull).filter(id -> !target.contains(id)).limit(6 - target.size())
                .forEach(target::add);
    }

    private String canonicalToolCallKey(String name, JsonNode arguments) throws JacksonException {
        JsonNode argumentObject = arguments;
        if (arguments.isTextual()) {
            argumentObject = objectMapper.readTree(arguments.asText());
        }
        return name + ":" + canonicalJson(argumentObject);
    }

    private String canonicalJson(JsonNode node) throws JacksonException {
        if (node == null || node.isMissingNode()) {
            return "null";
        }
        if (node.isObject()) {
            List<String> fieldNames = new ArrayList<>();
            fieldNames.addAll(node.propertyNames());
            fieldNames.sort(String::compareTo);
            StringBuilder json = new StringBuilder("{");
            for (int index = 0; index < fieldNames.size(); index++) {
                if (index > 0) {
                    json.append(',');
                }
                String fieldName = fieldNames.get(index);
                json.append(objectMapper.writeValueAsString(fieldName))
                        .append(':')
                        .append(canonicalJson(node.path(fieldName)));
            }
            return json.append('}').toString();
        }
        if (node.isArray()) {
            StringBuilder json = new StringBuilder("[");
            for (int index = 0; index < node.size(); index++) {
                if (index > 0) {
                    json.append(',');
                }
                json.append(canonicalJson(node.get(index)));
            }
            return json.append(']').toString();
        }
        return node.toString();
    }

    private static boolean isFailedToolResult(Object result) {
        return result instanceof DdemachimMcpTools.McpToolResponse<?> response
                && !response.isSuccess();
    }

    private Object executeTool(String name, JsonNode arguments) {
        try {
            JsonNode argumentObject = arguments;
            if (arguments.isTextual()) {
                argumentObject = objectMapper.readTree(arguments.asText());
            }
            if (argumentObject == null || !argumentObject.isObject()) {
                throw new AiGuideException(AiGuideErrorStatus.INVALID_TOOL_CALL);
            }
            String argumentJson = objectMapper.writeValueAsString(argumentObject);
            return switch (name) {
                case "search_places" -> mcpTools.searchPlaces(
                        objectMapper.readValue(argumentJson, DdemachimMcpTools.SearchPlacesRequest.class));
                case "search_nearby_places" -> mcpTools.searchNearbyPlaces(
                        objectMapper.readValue(argumentJson, DdemachimMcpTools.SearchNearbyPlacesRequest.class));
                case "search_places_near_reference" -> mcpTools.searchPlacesNearReference(
                        objectMapper.readValue(argumentJson, DdemachimMcpTools.SearchPlacesNearReferenceRequest.class));
                case "get_place_detail" -> mcpTools.getPlaceDetail(
                        objectMapper.readValue(argumentJson, DdemachimMcpTools.PlaceDetailRequest.class));
                case "get_crowding" -> mcpTools.getCrowding(
                        objectMapper.readValue(argumentJson, DdemachimMcpTools.CrowdingToolRequest.class));
                case "get_travel_time" -> mcpTools.getTravelTime(
                        objectMapper.readValue(argumentJson, DdemachimMcpTools.TravelTimeRequest.class));
                case "create_course" -> mcpTools.createCourse(
                        objectMapper.readValue(argumentJson, DdemachimMcpTools.CreateCourseRequest.class));
                case "create_ai_course" -> mcpTools.createAiCourse(
                        objectMapper.readValue(argumentJson, AiCourseRequest.class));
                default -> throw new AiGuideException(AiGuideErrorStatus.UNKNOWN_TOOL);
            };
        } catch (AiGuideException exception) {
            throw exception;
        } catch (JacksonException | IllegalArgumentException exception) {
            throw new AiGuideException(AiGuideErrorStatus.INVALID_TOOL_CALL, exception);
        }
    }

    private String extractAnswer(JsonNode interaction) {
        JsonNode output = interaction.path("output");
        if (!output.isArray()) {
            return null;
        }
        StringBuilder answer = new StringBuilder();
        for (JsonNode item : output) {
            if (!"message".equals(item.path("type").asText()) || !item.path("content").isArray()) {
                continue;
            }
            for (JsonNode content : item.path("content")) {
                if ("output_text".equals(content.path("type").asText()) && content.path("text").isTextual()) {
                    answer.append(content.path("text").asText());
                }
            }
        }
        return answer.toString();
    }

    private void validateConfiguration() {
        if (!properties.isEnabled()
                || !properties.hasApiKey()
                || !StringUtils.hasText(properties.getModel())
                || properties.getMaxOutputTokens() < 1
                || properties.getMaxToolRounds() < 1
                || properties.getMaxToolCalls() < 1) {
            throw new AiGuideException(AiGuideErrorStatus.CONFIGURATION);
        }
    }

    private static List<Map<String, Object>> functionTools() {
        return List.of(
                functionTool("search_places", "지역, 자연어 검색어와 복수 카테고리로 실제 장소를 검색합니다. 카테고리는 한국어도 지원합니다: 촬영지=FILMING_LOCATION, 요즘 유행하는 곳·요즘 핫한 곳·요즘 뜨는 곳·요즘 갈만한 곳=BLOG_TREND, 전시=EXHIBITION, 행사=POPUP, 음식점·맛집=RESTAURANT, 카페=CAFE. 단순 장소 추천은 날짜를 묻지 말고 이 도구만 즉시 호출하세요. visitDate는 선택 사항이며 등록일이 아니라 방문 예정일의 운영시간 확인에만 사용합니다. 날짜가 있다면 YYYY-MM-DD로 전달하세요. 운영시간, 좌표, 기본 체류시간, 태그와 실제 placeId를 반환합니다.",
                        properties(
                                new Schema("query", string()), new Schema("area", string()),
                                new Schema("categories", arraySchema(string())),
                                new Schema("visitDate", date()), new Schema("limit", integer())), List.of()),
                functionTool("search_nearby_places", "브라우저 권한 또는 사용자가 지정한 실제 좌표를 기준으로 PostGIS 반경 검색을 합니다. category는 촬영지, 요즘 핫한 곳, 전시, 행사, 음식점·맛집, 카페 같은 한국어 표현도 지원합니다. 좌표가 없으면 절대 호출하거나 추측하지 말고 현재 위치 허용 또는 기준 지역/역을 질문하세요. 거리, 도보시간, 영업 여부, 혼잡도, 태그와 실제 placeId를 반환합니다.",
                        properties(new Schema("latitude", number()), new Schema("longitude", number()),
                                new Schema("category", string()), new Schema("radiusMeters", integer()),
                                new Schema("query", string()), new Schema("openNow", bool()),
                                new Schema("limit", integer()), new Schema("at", string())),
                        List.of("latitude", "longitude")),
                functionTool("search_places_near_reference", "사용자가 말한 기준 장소(예: 경복궁) 주변의 장소를 찾습니다. 먼저 때마침 DB에서 기준 장소를 찾고, 없을 때만 카카오로 좌표를 보완한 뒤, 반경 안의 때마침 저장 장소만 반환합니다. '경복궁 주변 카페' 같은 요청에 사용하세요.",
                        properties(new Schema("reference", string()), new Schema("category", string()),
                                new Schema("radiusMeters", integer()), new Schema("query", string()),
                                new Schema("openNow", bool()), new Schema("limit", integer()),
                                new Schema("at", string())),
                        List.of("reference")),
                functionTool("get_place_detail", "저장된 장소의 상세 정보와 운영 정보를 조회합니다.",
                        properties(new Schema("placeId", integer())), List.of("placeId")),
                functionTool("get_crowding", "저장된 장소의 현재 또는 지정 시각 혼잡도를 조회합니다.",
                        properties(new Schema("placeId", integer()), new Schema("at", string())), List.of("placeId")),
                functionTool("get_travel_time", "두 장소 사이의 도보, 대중교통, 택시 이동시간을 비교합니다.",
                        properties(
                                new Schema("originPlaceId", integer()), new Schema("destinationPlaceId", integer()),
                                new Schema("mode", enumSchema(RouteMode.values()))),
                        List.of("originPlaceId", "destinationPlaceId")),
                functionTool("create_course", "로그인한 사용자가 코스에 담은 장소의 basketItemId와 체류 시간, 날짜, 출발 시각과 위치를 모두 제공했을 때만 코스 미리보기를 계산합니다. 값이 없거나 검색 placeId만 있으면 호출하지 말고 사용자에게 부족한 정보만 질문하세요.",
                        properties(
                                new Schema("serviceDate", string()), new Schema("desiredStartTime", string()),
                                new Schema("start", objectSchema(
                                        properties(new Schema("type", enumSchema(CourseStartType.values())),
                                                new Schema("name", string()), new Schema("latitude", number()),
                                                new Schema("longitude", number())),
                                        List.of("type", "latitude", "longitude"))),
                                new Schema("places", arraySchema(objectSchema(
                                        properties(new Schema("basketItemId", integer()), new Schema("dwellMinutes", integer()),
                                                new Schema("arrivalDeadline", string())),
                                        List.of("basketItemId", "dwellMinutes")))),
                                new Schema("strategy", enumSchema(CourseRouteStrategy.values()))),
                        List.of("serviceDate", "desiredStartTime", "start", "places")),
                functionTool("create_ai_course", "AI 추천 코스 생성 전용입니다. 장바구니/basketItemId를 사용하지 않습니다. 검색 Tool에서 받은 실제 placeId만 사용하고 임의 ID를 만들지 마세요. 날짜, 시작 시간, 출발 위치 좌표, 사용 가능 시간이 부족하면 호출하지 말고 질문하세요. 이전 대화의 정보를 결합하세요. requiredPlaceIds는 사용자가 꼭 가겠다고 한 장소, candidatePlaceIds는 일반 후보입니다. 최종 방문 순서는 서버 CoursePlanner가 결정합니다.",
                        properties(new Schema("date", date()), new Schema("startTime", string()),
                                new Schema("startLocation", objectSchema(properties(
                                        new Schema("latitude", number()), new Schema("longitude", number()),
                                        new Schema("name", string())), List.of("latitude", "longitude"))),
                                new Schema("availableMinutes", integer()),
                                new Schema("requiredPlaceIds", arraySchema(integer())),
                                new Schema("candidatePlaceIds", arraySchema(integer())),
                                new Schema("routePreference", enumSchema(AiCourseRequest.RoutePreference.values())),
                                new Schema("schedulePreference", enumSchema(AiCourseRequest.SchedulePreference.values()))),
                        List.of("date", "startTime", "startLocation", "availableMinutes",
                                "requiredPlaceIds", "candidatePlaceIds")));
    }

    private static Map<String, Object> functionTool(
            String name, String description, Map<String, Object> properties, List<String> required) {
        Map<String, Object> function = new LinkedHashMap<>();
        function.put("type", "function");
        function.put("name", name);
        function.put("description", description);
        function.put("parameters", objectSchema(properties, required));
        return function;
    }

    private static Map<String, Object> properties(Schema... schemas) {
        Map<String, Object> properties = new LinkedHashMap<>();
        for (Schema schema : schemas) {
            properties.put(schema.name(), schema.schema());
        }
        return properties;
    }

    private static Map<String, Object> objectSchema(Map<String, Object> properties, List<String> required) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        if (!required.isEmpty()) {
            schema.put("required", required);
        }
        return schema;
    }

    private static Map<String, Object> arraySchema(Map<String, Object> itemSchema) {
        return Map.of("type", "array", "items", itemSchema);
    }

    private static Map<String, Object> bool() {
        return Map.of("type", "boolean");
    }

    private static Map<String, Object> string() {
        return Map.of("type", "string");
    }

    private static Map<String, Object> date() {
        return Map.of("type", "string", "format", "date");
    }

    private static Map<String, Object> integer() {
        return Map.of("type", "integer");
    }

    private static Map<String, Object> number() {
        return Map.of("type", "number");
    }

    private static Map<String, Object> enumSchema(Enum<?>[] values) {
        return Map.of("type", "string", "enum", Arrays.stream(values).map(Enum::name).toList());
    }

    private static String textValue(JsonNode node) {
        return node != null && node.isTextual() ? node.asText() : null;
    }

    private record FunctionResult(Map<String, Object> input, String clarification, Object result) {
    }

    private record NormalizedToolArguments(JsonNode arguments, String clarification) {
    }

    private static String callId(JsonNode functionCall) {
        String callId = textValue(functionCall.path("call_id"));
        return StringUtils.hasText(callId) ? callId : textValue(functionCall.path("id"));
    }

    private static Duration durationOrDefault(Duration configured, Duration fallback) {
        return configured == null || configured.isNegative() || configured.isZero() ? fallback : configured;
    }

    private record Schema(String name, Map<String, Object> schema) {
    }
}
