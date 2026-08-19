package com.ddemachim.server.domain.route.service;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;

final class TransitWalkSegmentExtractor {

    private TransitWalkSegmentExtractor() {
    }

    static List<TransitWalkSegment> extract(JsonNode itinerary) {
        if (itinerary == null || !itinerary.isObject()) {
            throw unavailable();
        }
        JsonNode legs = itinerary.path("legs");
        if (!legs.isArray()) {
            throw unavailable();
        }

        List<TransitWalkSegment> segments = new ArrayList<>();
        int walkOrdinal = 0;
        for (int legIndex = 0; legIndex < legs.size(); legIndex++) {
            JsonNode leg = legs.get(legIndex);
            if (!isWalk(leg)) {
                continue;
            }

            int duration = requiredNonNegativeInt(leg.path("sectionTime"));
            int distance = requiredNonNegativeInt(leg.path("distance"));
            Coordinate start = requiredCoordinate(leg.path("start"));
            Coordinate end = requiredCoordinate(leg.path("end"));
            List<Coordinate> geometry = walkGeometry(leg);
            segments.add(new TransitWalkSegment(
                    ++walkOrdinal,
                    legIndex,
                    start,
                    end,
                    duration,
                    distance,
                    geometry));
        }
        return List.copyOf(segments);
    }

    private static boolean isWalk(JsonNode leg) {
        return leg != null
                && leg.isObject()
                && "WALK".equalsIgnoreCase(leg.path("mode").asString("").trim());
    }

    private static int requiredNonNegativeInt(JsonNode value) {
        if (value == null
                || !value.isIntegralNumber()
                || !value.canConvertToInt()
                || value.intValue() < 0) {
            throw unavailable();
        }
        return value.intValue();
    }

    private static Coordinate requiredCoordinate(JsonNode endpoint) {
        if (endpoint == null || !endpoint.isObject()) {
            throw unavailable();
        }
        JsonNode longitudeNode = endpoint.path("lon");
        JsonNode latitudeNode = endpoint.path("lat");
        if (!longitudeNode.isNumber() || !latitudeNode.isNumber()) {
            throw unavailable();
        }
        double longitude = longitudeNode.doubleValue();
        double latitude = latitudeNode.doubleValue();
        if (!validWgs84(longitude, latitude)) {
            throw unavailable();
        }
        return new Coordinate(latitude, longitude);
    }

    private static List<Coordinate> walkGeometry(JsonNode leg) {
        List<Coordinate> stepGeometry = stepGeometry(leg.path("steps"));
        if (stepGeometry != null) {
            return stepGeometry;
        }
        List<Coordinate> passShapeGeometry = parseLineString(
                leg.path("passShape").path("linestring"));
        return passShapeGeometry == null ? List.of() : passShapeGeometry;
    }

    private static List<Coordinate> stepGeometry(JsonNode steps) {
        if (steps == null || !steps.isArray() || steps.isEmpty()) {
            return null;
        }
        List<Coordinate> result = new ArrayList<>();
        for (JsonNode step : steps) {
            if (step == null || !step.isObject()) {
                return null;
            }
            List<Coordinate> line = parseLineString(step.path("linestring"));
            if (line == null) {
                return null;
            }
            result.addAll(line);
        }
        return List.copyOf(result);
    }

    private static List<Coordinate> parseLineString(JsonNode linestring) {
        if (linestring == null || linestring.isMissingNode() || linestring.isNull()) {
            return null;
        }
        String raw = linestring.asString("").trim();
        if (raw.isBlank()) {
            return null;
        }

        String[] pairs = raw.split("\\s+");
        if (pairs.length < 2) {
            return null;
        }
        List<Coordinate> result = new ArrayList<>();
        for (String pair : pairs) {
            String[] values = pair.split(",");
            if (values.length != 2) {
                return null;
            }
            try {
                double longitude = Double.parseDouble(values[0]);
                double latitude = Double.parseDouble(values[1]);
                if (!validWgs84(longitude, latitude)) {
                    return null;
                }
                result.add(new Coordinate(latitude, longitude));
            } catch (NumberFormatException exception) {
                return null;
            }
        }
        return List.copyOf(result);
    }

    private static boolean validWgs84(double longitude, double latitude) {
        return Double.isFinite(longitude)
                && Double.isFinite(latitude)
                && longitude >= -180.0
                && longitude <= 180.0
                && latitude >= -90.0
                && latitude <= 90.0;
    }

    private static RouteProviderException unavailable() {
        return new RouteProviderException(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
    }
}
