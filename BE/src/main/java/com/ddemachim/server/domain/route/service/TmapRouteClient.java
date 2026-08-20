package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.LineStringGeometry;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.global.properties.TmapProperties;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.io.IOException;
import java.net.SocketTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class TmapRouteClient implements CourseRouteProviderClient {

    private static final String WALKING_PATH = "/tmap/routes/pedestrian?version=1";
    private static final String TRANSIT_PATH = "/transit/routes";
    private static final String TAXI_PATH = "/tmap/routes?version=1";
    private static final Duration DEFAULT_CACHE_TTL = Duration.ofMinutes(2);
    private static final long DEFAULT_CACHE_MAXIMUM_SIZE = 1_000L;

    private final TmapProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final Cache<TransitCacheKey, SelectedTransitRoute> transitCache;

    @Autowired
    public TmapRouteClient(TmapProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, productionRestClientBuilder(properties));
    }

    /**
     * Package-private constructor used by provider contract tests. The test
     * builder is already instrumented by MockRestServiceServer, so replacing
     * its request factory would remove the test interceptor.
     */
    TmapRouteClient(
            TmapProperties properties,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder.baseUrl(properties.getBaseUrl()).build();
        this.transitCache = Caffeine.newBuilder()
                .maximumSize(cacheMaximumSize(properties))
                .expireAfterWrite(cacheTtl(properties))
                .build();
    }

    private static RestClient.Builder productionRestClientBuilder(TmapProperties properties) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(nonNullTimeout(properties.getConnectTimeout(), Duration.ofSeconds(2)))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(
                nonNullTimeout(properties.getReadTimeout(), Duration.ofSeconds(4)));
        return RestClient.builder()
                .requestFactory(requestFactory);
    }

    private static Duration nonNullTimeout(Duration configured, Duration fallback) {
        return configured == null || configured.isNegative() || configured.isZero()
                ? fallback
                : configured;
    }

    @Override
    public RouteOption findWalking(Coordinate origin, Coordinate destination) {
        return findWalking(origin, destination, null);
    }

    @Override
    public RouteOption findWalkingVariant(
            Coordinate origin,
            Coordinate destination,
            PedestrianSearchOption searchOption) {
        return findWalking(origin, destination, Objects.requireNonNull(searchOption));
    }

    private RouteOption findWalking(
            Coordinate origin,
            Coordinate destination,
            PedestrianSearchOption searchOption) {
        ensureConfigured();
        ensureCoordinates(origin, destination);

        Map<String, Object> body = baseRequestBody(origin, destination);
        if (searchOption != null) {
            body.put("searchOption", searchOption.providerValue());
        }
        JsonNode response = post(WALKING_PATH, body);
        try {
            List<LineFeature> lines = lineFeatures(response);
            if (lines.isEmpty()) {
                throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
            }
            int duration = summaryOrDefault(response, lines, "totalTime", "time");
            int distance = summaryOrDefault(response, lines, "totalDistance", "distance");
            LineStringGeometry geometry = concatenate(lines);
            RouteLeg leg = new RouteLeg(RouteMode.WALK, null, duration, distance, geometry);
            return new RouteOption(
                    RouteMode.WALK,
                    RouteStatus.AVAILABLE,
                    duration,
                    distance,
                    null,
                    null,
                    distance,
                    null,
                    List.of(leg));
        } catch (RouteProviderException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw unavailable();
        }
    }

    @Override
    public RouteOption findTransit(Coordinate origin, Coordinate destination) {
        return findSelectedTransit(origin, destination).option();
    }

    @Override
    public SelectedTransitRoute findSelectedTransit(Coordinate origin, Coordinate destination) {
        ensureConfigured();
        ensureCoordinates(origin, destination);

        TransitCacheKey cacheKey = TransitCacheKey.from(origin, destination);
        return transitCache.get(cacheKey, ignored -> loadSelectedTransit(origin, destination));
    }

    private SelectedTransitRoute loadSelectedTransit(Coordinate origin, Coordinate destination) {
        Map<String, Object> body = baseRequestBody(origin, destination);
        body.put("count", 10);
        body.put("lang", 0);
        body.put("format", "json");
        JsonNode response = post(TRANSIT_PATH, body);
        try {
            JsonNode itineraries = response.path("metaData").path("plan").path("itineraries");
            if (!itineraries.isArray()) {
                throw unavailable();
            }
            if (itineraries.isEmpty()) {
                throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
            }

            JsonNode fastest = null;
            int fastestTime = Integer.MAX_VALUE;
            for (JsonNode itinerary : itineraries) {
                if (itinerary == null || !itinerary.isObject()) {
                    throw unavailable();
                }
                Integer totalTime = integer(itinerary, "totalTime");
                if (totalTime == null || totalTime < 0) {
                    throw unavailable();
                }
                if (totalTime < fastestTime) {
                    fastest = itinerary;
                    fastestTime = totalTime;
                }
            }
            if (fastest == null) {
                throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
            }

            List<RouteLeg> legs = transitLegs(fastest);
            Integer distance = integer(fastest, "totalDistance");
            Integer walkDistance = integer(fastest, "totalWalkDistance");
            if (walkDistance == null) {
                walkDistance = legs.stream()
                        .filter(leg -> leg.mode() == RouteMode.WALK)
                        .map(RouteLeg::distanceMeters)
                        .filter(value -> value != null)
                        .reduce(0, Integer::sum);
            }
            Integer transferCount = integer(fastest, "transferCount");
            Integer fare = fare(fastest);
            RouteOption option = new RouteOption(
                    RouteMode.TRANSIT,
                    RouteStatus.AVAILABLE,
                    fastestTime,
                    distance,
                    fare,
                    transferCount,
                    walkDistance,
                    null,
                    legs);
            return new SelectedTransitRoute(
                    option,
                    TransitWalkSegmentExtractor.extract(fastest));
        } catch (RouteProviderException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw unavailable();
        }
    }

    private static long cacheMaximumSize(TmapProperties properties) {
        if (properties == null || properties.getCacheMaximumSize() <= 0) {
            return DEFAULT_CACHE_MAXIMUM_SIZE;
        }
        return properties.getCacheMaximumSize();
    }

    private static Duration cacheTtl(TmapProperties properties) {
        if (properties == null
                || properties.getCacheTtl() == null
                || properties.getCacheTtl().isNegative()
                || properties.getCacheTtl().isZero()) {
            return DEFAULT_CACHE_TTL;
        }
        return properties.getCacheTtl();
    }

    @Override
    public RouteOption findTaxi(Coordinate origin, Coordinate destination) {
        ensureConfigured();
        ensureCoordinates(origin, destination);

        Map<String, Object> body = baseRequestBody(origin, destination);
        body.put("reqCoordType", "WGS84GEO");
        body.put("resCoordType", "WGS84GEO");
        body.put("searchOption", "0");
        JsonNode response = post(TAXI_PATH, body);
        try {
            List<LineFeature> lines = lineFeatures(response);
            if (lines.isEmpty()) {
                throw new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
            }
            int duration = summaryOrDefault(response, lines, "totalTime", "time");
            int distance = summaryOrDefault(response, lines, "totalDistance", "distance");
            Integer fare = featureSummary(response, "taxiFare");
            LineStringGeometry geometry = concatenate(lines);
            RouteLeg leg = new RouteLeg(RouteMode.TAXI, null, duration, distance, geometry);
            return new RouteOption(
                    RouteMode.TAXI,
                    RouteStatus.AVAILABLE,
                    duration,
                    distance,
                    fare,
                    null,
                    null,
                    null,
                    List.of(leg));
        } catch (RouteProviderException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw unavailable();
        }
    }

    private void ensureConfigured() {
        if (!properties.hasAppKey()) {
            throw new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);
        }
    }

    private static void ensureCoordinates(Coordinate origin, Coordinate destination) {
        if (!validCoordinate(origin) || !validCoordinate(destination)) {
            throw new RouteProviderException(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
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

    private static Map<String, Object> baseRequestBody(Coordinate origin, Coordinate destination) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("startX", origin.longitude());
        body.put("startY", origin.latitude());
        body.put("endX", destination.longitude());
        body.put("endY", destination.latitude());
        body.put("startName", "현재 위치");
        body.put("endName", "선택 장소");
        return body;
    }

    private JsonNode post(String path, Map<String, Object> body) {
        try {
            String responseBody = restClient.post()
                    .uri(path)
                    .header("appKey", properties.getAppKey().trim())
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            if (responseBody == null || responseBody.isBlank()) {
                throw unavailable();
            }
            try {
                return objectMapper.readTree(responseBody);
            } catch (JacksonException | IllegalArgumentException exception) {
                throw unavailable();
            }
        } catch (RouteProviderException exception) {
            throw exception;
        } catch (RestClientException exception) {
            if (containsTimeout(exception)) {
                throw new RouteProviderException(RouteUnavailableReason.TIMEOUT);
            }
            throw unavailable();
        } catch (RuntimeException exception) {
            if (containsTimeout(exception)) {
                throw new RouteProviderException(RouteUnavailableReason.TIMEOUT);
            }
            throw unavailable();
        }
    }

    private static boolean containsTimeout(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof SocketTimeoutException
                    || current instanceof HttpTimeoutException
                    || current instanceof TimeoutException
                    || current instanceof IOException && current.getMessage() != null
                    && current.getMessage().toLowerCase(Locale.ROOT).contains("timeout")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static RouteProviderException unavailable() {
        return new RouteProviderException(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
    }

    private static List<LineFeature> lineFeatures(JsonNode response) {
        JsonNode features = response.path("features");
        if (!features.isArray()) {
            throw unavailable();
        }
        List<LineFeature> lines = new ArrayList<>();
        for (JsonNode feature : features) {
            JsonNode geometry = feature.path("geometry");
            if (!"LineString".equalsIgnoreCase(geometry.path("type").asString(""))) {
                continue;
            }
            List<List<Double>> coordinates = coordinates(geometry.path("coordinates"));
            JsonNode properties = feature.path("properties");
            lines.add(new LineFeature(
                    coordinates,
                    integer(properties, "totalTime"),
                    integer(properties, "time"),
                    integer(properties, "totalDistance"),
                    integer(properties, "distance"),
                    integer(properties, "taxiFare")));
        }
        return lines;
    }

    private static List<List<Double>> coordinates(JsonNode coordinates) {
        if (!coordinates.isArray() || coordinates.size() < 2) {
            throw unavailable();
        }
        List<List<Double>> result = new ArrayList<>();
        for (JsonNode coordinate : coordinates) {
            if (!coordinate.isArray() || coordinate.size() < 2
                    || !coordinate.get(0).isNumber() || !coordinate.get(1).isNumber()) {
                throw unavailable();
            }
            double longitude = coordinate.get(0).doubleValue();
            double latitude = coordinate.get(1).doubleValue();
            if (!validWgs84(longitude, latitude)) {
                throw unavailable();
            }
            result.add(List.of(longitude, latitude));
        }
        return result;
    }

    private static LineStringGeometry concatenate(List<LineFeature> lines) {
        List<List<Double>> coordinates = new ArrayList<>();
        for (LineFeature line : lines) {
            coordinates.addAll(line.coordinates());
        }
        if (coordinates.size() < 2) {
            throw unavailable();
        }
        return new LineStringGeometry(coordinates);
    }

    private static int summaryOrSum(List<LineFeature> lines, String totalField, String partField) {
        Integer total = summary(lines, totalField);
        if (total != null && total >= 0) {
            return total;
        }
        int sum = 0;
        boolean found = false;
        for (LineFeature line : lines) {
            Integer value = partField.equals("time") ? line.time() : line.distance();
            if (value != null && value >= 0) {
                sum = Math.addExact(sum, value);
                found = true;
            }
        }
        if (!found) {
            throw unavailable();
        }
        return sum;
    }

    private static int summaryOrDefault(
            JsonNode response, List<LineFeature> lines, String totalField, String partField) {
        Integer total = featureSummary(response, totalField);
        if (total != null && total >= 0) {
            return total;
        }
        return summaryOrSum(lines, totalField, partField);
    }

    private static Integer featureSummary(JsonNode response, String field) {
        JsonNode features = response.path("features");
        if (!features.isArray()) {
            return null;
        }
        for (JsonNode feature : features) {
            Integer value = number(feature.path("properties").path(field));
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static Integer summary(List<LineFeature> lines, String field) {
        for (LineFeature line : lines) {
            Integer value = switch (field) {
                case "totalTime" -> line.totalTime();
                case "totalDistance" -> line.totalDistance();
                case "taxiFare" -> line.taxiFare();
                default -> null;
            };
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static List<RouteLeg> transitLegs(JsonNode itinerary) {
        JsonNode legs = itinerary.path("legs");
        if (!legs.isArray() || legs.isEmpty()) {
            throw unavailable();
        }
        List<RouteLeg> result = new ArrayList<>();
        for (JsonNode leg : legs) {
            if (leg == null || !leg.isObject()) {
                throw unavailable();
            }
            String rawMode = text(leg, "mode");
            RouteMode mode = transitMode(rawMode);
            Integer duration = integer(leg, "sectionTime");
            Integer distance = integer(leg, "distance");
            if (mode == null || duration == null || duration < 0 || distance == null || distance < 0) {
                throw unavailable();
            }
            LineStringGeometry geometry = transitGeometry(leg.path("passShape").path("linestring"));
            String routeName = firstText(leg, "routeName", "route", "service");
            result.add(new RouteLeg(mode, routeName, duration, distance, geometry));
        }
        return List.copyOf(result);
    }

    private static LineStringGeometry transitGeometry(JsonNode linestring) {
        if (linestring.isMissingNode() || linestring.isNull() || linestring.asString("").isBlank()) {
            return null;
        }
        String value = linestring.asString("").trim();
        String[] pairs = value.split("\\s+");
        List<List<Double>> coordinates = new ArrayList<>();
        for (String pair : pairs) {
            String[] values = pair.split(",");
            if (values.length != 2) {
                throw unavailable();
            }
            try {
                double longitude = Double.parseDouble(values[0]);
                double latitude = Double.parseDouble(values[1]);
                if (!validWgs84(longitude, latitude)) {
                    throw unavailable();
                }
                coordinates.add(List.of(longitude, latitude));
            } catch (NumberFormatException exception) {
                throw unavailable();
            }
        }
        if (coordinates.size() < 2) {
            throw unavailable();
        }
        return new LineStringGeometry(coordinates);
    }

    private static RouteMode transitMode(String rawMode) {
        if (rawMode == null || rawMode.isBlank()) {
            return null;
        }
        return "WALK".equalsIgnoreCase(rawMode) ? RouteMode.WALK : RouteMode.TRANSIT;
    }

    private static Integer fare(JsonNode itinerary) {
        JsonNode fare = itinerary.path("fare").path("regular").path("totalFare");
        return number(fare);
    }

    private static Integer integer(JsonNode node, String field) {
        return number(node.path(field));
    }

    private static Integer number(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull() || !node.isNumber()) {
            if (node == null || node.isMissingNode() || node.isNull()) {
                return null;
            }
            String value = node.asString("").trim();
            if (value.isBlank()) {
                return null;
            }
            try {
                return Integer.valueOf(value);
            } catch (NumberFormatException exception) {
                throw unavailable();
            }
        }
        if (node.canConvertToInt()) {
            return node.intValue();
        }
        throw unavailable();
    }

    private static boolean validWgs84(double longitude, double latitude) {
        return Double.isFinite(longitude)
                && Double.isFinite(latitude)
                && longitude >= -180.0
                && longitude <= 180.0
                && latitude >= -90.0
                && latitude <= 90.0;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asString("").trim();
        return text.isBlank() ? null : text;
    }

    private static String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = text(node, field);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private record LineFeature(
            List<List<Double>> coordinates,
            Integer totalTime,
            Integer time,
            Integer totalDistance,
            Integer distance,
            Integer taxiFare) {
    }

    private record TransitCacheKey(
            double originLatitude,
            double originLongitude,
            double destinationLatitude,
            double destinationLongitude) {

        private static TransitCacheKey from(Coordinate origin, Coordinate destination) {
            return new TransitCacheKey(
                    origin.latitude(),
                    origin.longitude(),
                    destination.latitude(),
                    destination.longitude());
        }
    }
}
