package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.global.properties.OdsayProperties;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.SocketTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class OdsayTransitRouteClient implements TransitRouteProviderClient {

    private static final Logger log = LoggerFactory.getLogger(OdsayTransitRouteClient.class);
    private static final String SEARCH_PATH = "/v1/api/searchPubTransPathT";
    private static final int WALK_TRAFFIC_TYPE = 3;
    private static final int SUBWAY_TRAFFIC_TYPE = 1;
    private static final int BUS_TRAFFIC_TYPE = 2;

    private final OdsayProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    @Autowired
    public OdsayTransitRouteClient(OdsayProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, productionRestClientBuilder(properties));
    }

    /**
     * Package-private constructor used by provider contract tests. The test
     * builder already has MockRestServiceServer's request interceptor.
     */
    OdsayTransitRouteClient(
            OdsayProperties properties,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder.baseUrl(properties.getBaseUrl()).build();
    }

    private static RestClient.Builder productionRestClientBuilder(OdsayProperties properties) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(nonNullTimeout(properties.getConnectTimeout(), Duration.ofSeconds(2)))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(
                nonNullTimeout(properties.getReadTimeout(), Duration.ofSeconds(4)));
        return RestClient.builder().requestFactory(requestFactory);
    }

    private static Duration nonNullTimeout(Duration configured, Duration fallback) {
        return configured == null || configured.isNegative() || configured.isZero()
                ? fallback
                : configured;
    }

    @Override
    public RouteOption findTransit(Coordinate origin, Coordinate destination) {
        ensureConfigured();
        ensureCoordinates(origin, destination);

        JsonNode response = get(origin, destination);
        try {
            RouteProviderException responseError = responseError(response);
            if (responseError != null) {
                throw responseError;
            }

            JsonNode result = response.path("result");
            JsonNode paths = result.path("path");
            if (paths.isMissingNode() || paths.isNull() || (paths.isArray() && paths.isEmpty())) {
                throw noRoute();
            }
            if (!paths.isArray()) {
                logFailure("INVALID_RESULT");
                throw unavailable();
            }

            RouteOption fastest = fastestPath(paths);
            if (fastest == null) {
                throw noRoute();
            }
            return fastest;
        } catch (RouteProviderException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            logFailure("INVALID_RESULT");
            throw unavailable();
        }
    }

    private void ensureConfigured() {
        if (!properties.hasApiKey()) {
            throw new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);
        }
    }

    private static void ensureCoordinates(Coordinate origin, Coordinate destination) {
        if (!validCoordinate(origin) || !validCoordinate(destination)) {
            throw unavailable();
        }
    }

    private static boolean validCoordinate(Coordinate coordinate) {
        return coordinate != null
                && coordinate.latitude() != null
                && coordinate.longitude() != null
                && Double.isFinite(coordinate.latitude())
                && Double.isFinite(coordinate.longitude())
                && coordinate.latitude() >= -90.0
                && coordinate.latitude() <= 90.0
                && coordinate.longitude() >= -180.0
                && coordinate.longitude() <= 180.0;
    }

    private JsonNode get(Coordinate origin, Coordinate destination) {
        try {
            String responseBody = restClient.get()
                    .uri(builder -> builder
                            .path(SEARCH_PATH)
                            .queryParam("SX", origin.longitude())
                            .queryParam("SY", origin.latitude())
                            .queryParam("EX", destination.longitude())
                            .queryParam("EY", destination.latitude())
                            .queryParam("OPT", 0)
                            .queryParam("SearchType", 0)
                            .queryParam("SearchPathType", 0)
                            .queryParam("lang", 0)
                            .queryParam("output", "json")
                            .queryParam("apiKey", "{apiKey}")
                            .build(properties.getApiKey().trim()))
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(String.class);
            if (responseBody == null || responseBody.isBlank()) {
                logFailure("INVALID_JSON");
                throw unavailable();
            }
            try {
                return objectMapper.readTree(responseBody);
            } catch (JacksonException | IllegalArgumentException exception) {
                logFailure("INVALID_JSON");
                throw unavailable();
            }
        } catch (RouteProviderException exception) {
            throw exception;
        } catch (RestClientException exception) {
            if (containsTimeout(exception)) {
                logFailure("TIMEOUT");
                throw timeout();
            }
            logFailure("HTTP_ERROR");
            throw unavailable();
        } catch (RuntimeException exception) {
            if (containsTimeout(exception)) {
                logFailure("TIMEOUT");
                throw timeout();
            }
            logFailure("HTTP_ERROR");
            throw unavailable();
        }
    }

    private static RouteOption fastestPath(JsonNode paths) {
        RouteOption fastest = null;
        Integer fastestMinutes = null;
        boolean invalidCandidateFound = false;
        for (JsonNode path : paths) {
            if (path == null || !path.isObject()) {
                invalidCandidateFound = true;
                continue;
            }
            try {
                RouteOption candidate = normalize(path);
                int totalTime = candidate.durationSeconds() / 60;
                if (fastestMinutes == null || totalTime < fastestMinutes) {
                    fastest = candidate;
                    fastestMinutes = totalTime;
                }
            } catch (RouteProviderException exception) {
                invalidCandidateFound = true;
            }
        }
        if (fastest == null && invalidCandidateFound) {
            logFailure("INVALID_RESULT");
            throw unavailable();
        }
        return fastest;
    }

    private static RouteOption normalize(JsonNode path) {
        JsonNode info = path.path("info");
        if (!info.isObject()) {
            throw unavailable();
        }

        Integer totalTimeMinutes = integer(info, "totalTime");
        if (totalTimeMinutes == null || totalTimeMinutes < 0) {
            throw unavailable();
        }
        int durationSeconds = multiplyMinutes(totalTimeMinutes);
        int distanceMeters = roundedInt(info.path("totalDistance"));
        if (distanceMeters < 0) {
            throw unavailable();
        }

        JsonNode subPaths = path.path("subPath");
        if (!subPaths.isArray() || subPaths.isEmpty()) {
            throw unavailable();
        }
        List<RouteLeg> legs = new ArrayList<>();
        for (JsonNode subPath : subPaths) {
            legs.add(normalizeLeg(subPath));
        }

        Integer fare = integerOrNull(info, "payment");
        Integer walkDistance = roundedIntOrNull(info.path("totalWalk"));
        if ((fare != null && fare < 0) || (walkDistance != null && walkDistance < 0)) {
            throw unavailable();
        }
        Integer busCount = integerOrNull(info, "busTransitCount");
        Integer subwayCount = integerOrNull(info, "subwayTransitCount");
        Integer transferCount = addCounts(busCount, subwayCount);
        return new RouteOption(
                RouteMode.TRANSIT,
                RouteStatus.AVAILABLE,
                durationSeconds,
                distanceMeters,
                fare,
                transferCount,
                walkDistance,
                null,
                legs);
    }

    private static RouteLeg normalizeLeg(JsonNode subPath) {
        if (subPath == null || !subPath.isObject()) {
            throw unavailable();
        }
        Integer trafficType = integer(subPath, "trafficType");
        RouteMode mode = mode(trafficType);
        Integer sectionTimeMinutes = integer(subPath, "sectionTime");
        if (sectionTimeMinutes == null || sectionTimeMinutes < 0) {
            throw unavailable();
        }
        Integer distanceMeters = roundedIntOrNull(subPath.path("distance"));
        if (distanceMeters == null || distanceMeters < 0) {
            throw unavailable();
        }
        String routeName = routeName(subPath, trafficType);
        return new RouteLeg(
                mode,
                routeName,
                multiplyMinutes(sectionTimeMinutes),
                distanceMeters,
                null);
    }

    private static RouteMode mode(Integer trafficType) {
        if (trafficType == null) {
            throw unavailable();
        }
        return switch (trafficType) {
            case WALK_TRAFFIC_TYPE -> RouteMode.WALK;
            case SUBWAY_TRAFFIC_TYPE, BUS_TRAFFIC_TYPE -> RouteMode.TRANSIT;
            default -> throw unavailable();
        };
    }

    private static String routeName(JsonNode subPath, Integer trafficType) {
        if (trafficType == null || trafficType == WALK_TRAFFIC_TYPE) {
            return null;
        }
        JsonNode lanes = subPath.path("lane");
        if (!lanes.isArray() || lanes.isEmpty() || !lanes.get(0).isObject()) {
            return null;
        }
        String field = trafficType == BUS_TRAFFIC_TYPE ? "busNo" : "name";
        JsonNode value = lanes.get(0).path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asString("").trim();
        return text.isBlank() ? null : text;
    }

    private static RouteProviderException responseError(JsonNode response) {
        JsonNode error = response.path("error");
        if (error.isMissingNode() || error.isNull()) {
            return null;
        }
        JsonNode errorDetail = error.isArray() && !error.isEmpty() ? error.get(0) : error;
        if (errorDetail == null || !errorDetail.isObject()) {
            logFailure("INVALID_RESULT");
            return unavailable();
        }
        Integer code = integer(errorDetail, "code");
        if (code == null) {
            logFailure("INVALID_RESULT");
            throw unavailable();
        }
        if (code == 3 || code == 4 || code == 5 || code == 6 || code == -98 || code == -99) {
            return noRoute();
        }
        logFailure("ODSAY_ERROR_" + code);
        return unavailable();
    }

    private static void logFailure(String category) {
        log.warn("provider=odsay operation=transit category={}", category);
    }

    private static Integer integer(JsonNode node, String field) {
        if (node == null || !node.isObject()) {
            return null;
        }
        return integer(node.path(field));
    }

    private static Integer integerOrNull(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        return integer(value);
    }

    private static Integer integer(JsonNode node) {
        BigDecimal decimal = decimal(node);
        if (decimal == null) {
            return null;
        }
        try {
            return decimal.setScale(0, RoundingMode.UNNECESSARY).intValueExact();
        } catch (ArithmeticException exception) {
            throw unavailable();
        }
    }

    private static int roundedInt(JsonNode node) {
        Integer value = roundedIntOrNull(node);
        if (value == null) {
            throw unavailable();
        }
        return value;
    }

    private static Integer roundedIntOrNull(JsonNode node) {
        BigDecimal decimal = decimal(node);
        if (decimal == null) {
            return null;
        }
        try {
            return decimal.setScale(0, RoundingMode.HALF_UP).intValueExact();
        } catch (ArithmeticException exception) {
            throw unavailable();
        }
    }

    private static BigDecimal decimal(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        try {
            if (node.isNumber()) {
                if (node.isFloatingPointNumber()
                        && !Double.isFinite(node.doubleValue())) {
                    throw unavailable();
                }
                return new BigDecimal(node.asString());
            }
            String value = node.asString("").trim();
            return value.isBlank() ? null : new BigDecimal(value);
        } catch (NumberFormatException exception) {
            throw unavailable();
        }
    }

    private static int multiplyMinutes(int minutes) {
        try {
            return Math.multiplyExact(minutes, 60);
        } catch (ArithmeticException exception) {
            throw unavailable();
        }
    }

    private static Integer addCounts(Integer busCount, Integer subwayCount) {
        if (busCount == null && subwayCount == null) {
            return null;
        }
        int bus = busCount == null ? 0 : busCount;
        int subway = subwayCount == null ? 0 : subwayCount;
        if (bus < 0 || subway < 0) {
            throw unavailable();
        }
        try {
            return Math.addExact(bus, subway);
        } catch (ArithmeticException exception) {
            throw unavailable();
        }
    }

    private static boolean containsTimeout(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof SocketTimeoutException
                    || current instanceof HttpTimeoutException
                    || current instanceof TimeoutException
                    || current instanceof IOException
                    && current.getMessage() != null
                    && current.getMessage().toLowerCase(Locale.ROOT).contains("timeout")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static RouteProviderException noRoute() {
        return new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
    }

    private static RouteProviderException unavailable() {
        return new RouteProviderException(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
    }

    private static RouteProviderException timeout() {
        return new RouteProviderException(RouteUnavailableReason.TIMEOUT);
    }
}
