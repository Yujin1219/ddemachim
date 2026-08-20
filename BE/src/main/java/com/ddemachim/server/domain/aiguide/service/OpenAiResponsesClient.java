package com.ddemachim.server.domain.aiguide.service;

import com.ddemachim.server.domain.aiguide.dto.AiGuideRequest;
import com.ddemachim.server.domain.aiguide.exception.AiGuideErrorStatus;
import com.ddemachim.server.domain.aiguide.exception.AiGuideException;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.global.mcp.DdemachimMcpTools;
import com.ddemachim.server.global.properties.AiGuideProperties;
import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
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

@Component
@Slf4j
public class OpenAiResponsesClient implements AiGuideLlmClient {

    private static final String RESPONSES_PATH = "/v1/responses";
    private static final String SYSTEM_INSTRUCTION = """
            당신은 서울 도보 여행 서비스 때마침의 AI 가이드입니다.
            장소, 혼잡도, 이동시간, 코스에 관한 사실은 제공된 때마침 함수 도구를 우선 사용하세요.
            도구 결과에 없는 정보는 추측하지 말고 확인이 필요한 점을 짧게 질문하세요.
            답변은 친절하고 간결한 한국어로 작성하고, 장소를 추천할 때는 근거와 주의사항을 함께 알려주세요.
            주변 검색 좌표는 오직 client_context에 제공된 현재 위치 또는 사용자가 명시한 기준 장소를 검색해 얻은 좌표만 사용하세요. 좌표가 없으면 현재 위치 허용 또는 기준 지역/역을 질문하고 임의 좌표를 만들지 마세요.
            AI 추천 코스에는 create_ai_course를 사용하세요. search_places/search_nearby_places가 반환한 실제 placeId만 사용하고 ID를 만들지 마세요.
            사용자가 반드시 가겠다고 한 장소는 requiredPlaceIds, 나머지 검색 후보는 candidatePlaceIds로 구분하세요. 최종 순서는 직접 정하지 말고 create_ai_course 결과를 설명하세요.
            create_ai_course에 날짜, 시작 시각, 출발 좌표, 사용 가능 시간이 하나라도 없으면 호출하지 말고 빠진 정보만 질문하세요. 이전 대화의 지역·날짜·선택 장소와 현재 답변을 합쳐 판단하세요.
            기존 create_course는 장바구니 화면의 basketItemId 기반 미리보기 호환 기능이며 AI 추천 코스에는 사용하지 마세요.
            """;

    private final RestClient restClient;
    private final AiGuideProperties properties;
    private final ObjectMapper objectMapper;
    private final DdemachimMcpTools mcpTools;

    @Autowired
    public OpenAiResponsesClient(
            AiGuideProperties properties,
            ObjectMapper objectMapper,
            DdemachimMcpTools mcpTools) {
        this(properties, objectMapper, mcpTools, RestClient.builder());
    }

    OpenAiResponsesClient(
            AiGuideProperties properties,
            ObjectMapper objectMapper,
            DdemachimMcpTools mcpTools,
            RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.mcpTools = mcpTools;
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
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.mcpTools = mcpTools;
        this.restClient = restClient;
    }

    @Override
    public LlmReply complete(AiGuideRequest request) {
        validateConfiguration();
        List<Map<String, Object>> input = initialInput(request);
        String previousResponseId = StringUtils.hasText(request.previousResponseId())
                ? request.previousResponseId() : null;
        int toolCalls = 0;
        Map<String, Object> failedToolResults = new LinkedHashMap<>();

        for (int round = 0; round < properties.getMaxToolRounds(); round++) {
            JsonNode response = requestResponse(input, previousResponseId);
            String responseId = textValue(response.path("id"));
            List<JsonNode> functionCalls = functionCalls(response);
            String answer = extractAnswer(response);
            if (functionCalls.isEmpty()) {
                if (StringUtils.hasText(answer)) {
                    return new LlmReply(answer, responseId);
                }
                throw new AiGuideException(AiGuideErrorStatus.INVALID_UPSTREAM_RESPONSE);
            }
            if (!StringUtils.hasText(responseId)) {
                throw new AiGuideException(AiGuideErrorStatus.INVALID_UPSTREAM_RESPONSE);
            }
            LlmReply clarification = courseClarification(functionCalls, responseId);
            if (clarification != null) {
                return clarification;
            }
            if (toolCalls + functionCalls.size() > properties.getMaxToolCalls()) {
                throw new AiGuideException(AiGuideErrorStatus.TOOL_LIMIT_EXCEEDED);
            }

            input = new ArrayList<>();
            for (JsonNode functionCall : functionCalls) {
                toolCalls++;
                FunctionResult functionResult = functionResult(functionCall, failedToolResults);
                if (functionResult.clarification() != null) {
                    return new LlmReply(functionResult.clarification(), responseId);
                }
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

    private static List<Map<String, Object>> initialInput(AiGuideRequest request) {
        List<Map<String, Object>> input = new ArrayList<>();
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
            JsonNode functionCall, Map<String, Object> failedToolResults) {
        String name = textValue(functionCall.path("name"));
        String callId = callId(functionCall);
        try {
            String toolCallKey = canonicalToolCallKey(name, functionCall.path("arguments"));
            Object result;
            if (failedToolResults.containsKey(toolCallKey)) {
                result = failedToolResults.get(toolCallKey);
            } else {
                result = executeTool(name, functionCall.path("arguments"));
                if (isFailedToolResult(result)) {
                    failedToolResults.put(toolCallKey, result);
                }
            }
            String clarification = createCourseFailureClarification(name, result);
            Map<String, Object> input = Map.of(
                    "type", "function_call_output",
                    "call_id", callId,
                    "output", objectMapper.writeValueAsString(result));
            return new FunctionResult(input, clarification);
        } catch (AiGuideException exception) {
            throw exception;
        } catch (JacksonException | IllegalArgumentException exception) {
            throw new AiGuideException(AiGuideErrorStatus.INVALID_TOOL_CALL, exception);
        }
    }

    private LlmReply courseClarification(List<JsonNode> functionCalls, String interactionId) {
        for (JsonNode functionCall : functionCalls) {
            String toolName = textValue(functionCall.path("name"));
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
                functionTool("search_places", "지역, 자연어 검색어, 복수 카테고리와 방문 날짜로 실제 장소를 검색합니다. 운영시간, 좌표, 기본 체류시간, 태그와 실제 placeId를 반환합니다.",
                        properties(
                                new Schema("query", string()), new Schema("area", string()),
                                new Schema("categories", arraySchema(string())),
                                new Schema("visitDate", string()), new Schema("limit", integer())), List.of()),
                functionTool("search_nearby_places", "브라우저 권한 또는 사용자가 지정한 실제 좌표를 기준으로 PostGIS 반경 검색을 합니다. 좌표가 없으면 절대 호출하거나 추측하지 말고 현재 위치 허용 또는 기준 지역/역을 질문하세요. 거리, 도보시간, 영업 여부, 혼잡도, 태그와 실제 placeId를 반환합니다.",
                        properties(new Schema("latitude", number()), new Schema("longitude", number()),
                                new Schema("category", string()), new Schema("radiusMeters", integer()),
                                new Schema("query", string()), new Schema("openNow", bool()),
                                new Schema("limit", integer()), new Schema("at", string())),
                        List.of("latitude", "longitude")),
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
                        properties(new Schema("date", string()), new Schema("startTime", string()),
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

    private record FunctionResult(Map<String, Object> input, String clarification) {
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
