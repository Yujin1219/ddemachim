package com.ddemachim.server.domain.route.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import java.io.InputStream;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class TransitWalkSegmentExtractorTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void realTmapItinerary_extractsFirstAndLastWalksInSourceOrder() throws Exception {
        JsonNode itinerary = realResponse()
                .path("metaData")
                .path("plan")
                .path("itineraries")
                .get(0);

        List<TransitWalkSegment> segments = TransitWalkSegmentExtractor.extract(itinerary);

        assertThat(segments)
                .extracting(
                        TransitWalkSegment::walkOrdinal,
                        TransitWalkSegment::legIndex,
                        TransitWalkSegment::durationSeconds,
                        TransitWalkSegment::distanceMeters)
                .containsExactly(
                        tuple(1, 0, 109, 114),
                        tuple(2, 2, 165, 150));
        assertThat(segments.getFirst().start())
                .isEqualTo(new Coordinate(37.63788539420793, 127.02550910860451));
        assertThat(segments.getFirst().end())
                .isEqualTo(new Coordinate(37.63863888888889, 127.02608888888889));
        assertThat(segments.getLast().start())
                .isEqualTo(new Coordinate(37.61018333333333, 127.03009444444444));
        assertThat(segments.getLast().end())
                .isEqualTo(new Coordinate(37.609094989686, 127.030406594109));
        assertThat(segments.getFirst().geometry()).containsExactly(
                new Coordinate(37.637882, 127.02551),
                new Coordinate(37.637897, 127.02552),
                new Coordinate(37.63829, 127.025955),
                new Coordinate(37.63829, 127.025955),
                new Coordinate(37.638374, 127.025826),
                new Coordinate(37.638374, 127.025826),
                new Coordinate(37.638523, 127.02598),
                new Coordinate(37.63855, 127.02597),
                new Coordinate(37.63855, 127.02597),
                new Coordinate(37.63864, 127.02606),
                new Coordinate(37.63865, 127.02607));
    }

    @Test
    void interleavedWalks_keepOneBasedWalkOrdinalsAndZeroBasedLegIndexes() throws Exception {
        JsonNode itinerary = itinerary("""
                [
                  {
                    "mode": "WALK",
                    "sectionTime": 10,
                    "distance": 11,
                    "start": {"lon": 126.90, "lat": 37.50},
                    "end": {"lon": 126.91, "lat": 37.51},
                    "steps": [
                      {"linestring": "126.90,37.50 126.905,37.505"},
                      {"linestring": "126.905,37.505 126.91,37.51"}
                    ],
                    "passShape": {"linestring": "126.80,37.40 126.81,37.41"}
                  },
                  {"mode": "BUS", "sectionTime": "invalid", "start": null},
                  {
                    "mode": "WALK",
                    "sectionTime": 20,
                    "distance": 21,
                    "start": {"lon": 126.91, "lat": 37.51},
                    "end": {"lon": 126.92, "lat": 37.52},
                    "steps": [{"linestring": "malformed"}],
                    "passShape": {"linestring": "126.91,37.51 126.915,37.515 126.92,37.52"}
                  },
                  {"mode": "SUBWAY", "distance": false, "end": "invalid"},
                  {
                    "mode": "WALK",
                    "sectionTime": 30,
                    "distance": 31,
                    "start": {"lon": 126.92, "lat": 37.52},
                    "end": {"lon": 126.93, "lat": 37.53}
                  }
                ]
                """);

        List<TransitWalkSegment> segments = TransitWalkSegmentExtractor.extract(itinerary);

        assertThat(segments)
                .extracting(TransitWalkSegment::walkOrdinal, TransitWalkSegment::legIndex)
                .containsExactly(tuple(1, 0), tuple(2, 2), tuple(3, 4));
        assertThat(segments.getFirst().geometry()).containsExactly(
                new Coordinate(37.50, 126.90),
                new Coordinate(37.505, 126.905),
                new Coordinate(37.505, 126.905),
                new Coordinate(37.51, 126.91));
        assertThat(segments.get(1).geometry()).containsExactly(
                new Coordinate(37.51, 126.91),
                new Coordinate(37.515, 126.915),
                new Coordinate(37.52, 126.92));
        assertThat(segments.getLast().geometry()).isEmpty();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("malformedOptionalGeometry")
    void malformedOptionalGeometry_doesNotRejectAnOtherwiseValidWalk(
            String ignoredDescription,
            String optionalGeometry) throws Exception {
        JsonNode itinerary = itinerary("""
                [{
                  "mode": "WALK",
                  "sectionTime": 10,
                  "distance": 11,
                  "start": {"lon": 126.90, "lat": 37.50},
                  "end": {"lon": 126.91, "lat": 37.51},
                  %s
                }]
                """.formatted(optionalGeometry));

        List<TransitWalkSegment> segments = TransitWalkSegmentExtractor.extract(itinerary);

        assertThat(segments).singleElement()
                .extracting(TransitWalkSegment::geometry)
                .asList()
                .isEmpty();
    }

    @Test
    void itineraryWithoutWalks_returnsAnImmutableEmptyResultAndIgnoresTransitFields()
            throws Exception {
        JsonNode itinerary = itinerary("""
                [
                  {"mode": "BUS", "sectionTime": "bad", "distance": -1, "start": null},
                  {"mode": "SUBWAY", "end": false},
                  "malformed non-walk leg"
                ]
                """);

        List<TransitWalkSegment> segments = TransitWalkSegmentExtractor.extract(itinerary);

        assertThat(segments).isEmpty();
        assertThatThrownBy(() -> segments.add(null))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidRequiredWalkData")
    void invalidRequiredWalkData_isReportedAsProviderUnavailable(
            String ignoredDescription,
            String walkLeg) throws Exception {
        JsonNode itinerary = itinerary("[" + walkLeg + "]");

        assertThatThrownBy(() -> TransitWalkSegmentExtractor.extract(itinerary))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
    }

    @Test
    void resultAndNestedGeometry_areImmutable() throws Exception {
        List<TransitWalkSegment> segments = TransitWalkSegmentExtractor.extract(itinerary("""
                [{
                  "mode": "WALK",
                  "sectionTime": 10,
                  "distance": 11,
                  "start": {"lon": 126.90, "lat": 37.50},
                  "end": {"lon": 126.91, "lat": 37.51},
                  "passShape": {"linestring": "126.90,37.50 126.91,37.51"}
                }]
                """));

        assertThatThrownBy(() -> segments.add(segments.getFirst()))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> segments.getFirst().geometry().add(
                        new Coordinate(37.52, 126.92)))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    private JsonNode realResponse() throws Exception {
        try (InputStream input = getClass().getResourceAsStream(
                "/fixtures/tmap-transit-real-response.json")) {
            assertThat(input).isNotNull();
            return objectMapper.readTree(input);
        }
    }

    private JsonNode itinerary(String legs) throws Exception {
        return objectMapper.readTree("{\"legs\":" + legs + "}");
    }

    private static Stream<Arguments> malformedOptionalGeometry() {
        return Stream.of(
                Arguments.of("null steps", "\"steps\": null"),
                Arguments.of("non-array steps", "\"steps\": {}"),
                Arguments.of("malformed step object", "\"steps\": [false]"),
                Arguments.of(
                        "one malformed step discards all step points",
                        "\"steps\": [{\"linestring\":\"126.90,37.50 126.905,37.505\"},"
                                + "{\"linestring\":\"bad\"}]"),
                Arguments.of(
                        "out-of-range step point",
                        "\"steps\": [{\"linestring\":\"181.0,37.50 126.91,37.51\"}]"),
                Arguments.of(
                        "malformed pass shape",
                        "\"passShape\": {\"linestring\": \"126.90,37.50 bad\"}"));
    }

    private static Stream<Arguments> invalidRequiredWalkData() {
        String validStart = "\"start\":{\"lon\":126.90,\"lat\":37.50}";
        String validEnd = "\"end\":{\"lon\":126.91,\"lat\":37.51}";
        String validNumbers = "\"sectionTime\":10,\"distance\":11";
        return Stream.of(
                Arguments.of(
                        "missing start",
                        "{\"mode\":\"WALK\"," + validNumbers + "," + validEnd + "}"),
                Arguments.of(
                        "string longitude",
                        "{\"mode\":\"WALK\"," + validNumbers
                                + ",\"start\":{\"lon\":\"126.90\",\"lat\":37.50},"
                                + validEnd + "}"),
                Arguments.of(
                        "non-finite longitude",
                        "{\"mode\":\"WALK\"," + validNumbers
                                + ",\"start\":{\"lon\":1e309,\"lat\":37.50},"
                                + validEnd + "}"),
                Arguments.of(
                        "out-of-range latitude",
                        "{\"mode\":\"WALK\"," + validNumbers
                                + "," + validStart
                                + ",\"end\":{\"lon\":126.91,\"lat\":91.0}}"),
                Arguments.of(
                        "fractional duration",
                        "{\"mode\":\"WALK\",\"sectionTime\":10.5,\"distance\":11,"
                                + validStart + "," + validEnd + "}"),
                Arguments.of(
                        "overflow duration",
                        "{\"mode\":\"WALK\",\"sectionTime\":2147483648,\"distance\":11,"
                                + validStart + "," + validEnd + "}"),
                Arguments.of(
                        "boolean duration",
                        "{\"mode\":\"WALK\",\"sectionTime\":true,\"distance\":11,"
                                + validStart + "," + validEnd + "}"),
                Arguments.of(
                        "string distance",
                        "{\"mode\":\"WALK\",\"sectionTime\":10,\"distance\":\"11\","
                                + validStart + "," + validEnd + "}"),
                Arguments.of(
                        "missing distance",
                        "{\"mode\":\"WALK\",\"sectionTime\":10,"
                                + validStart + "," + validEnd + "}"),
                Arguments.of(
                        "negative distance",
                        "{\"mode\":\"WALK\",\"sectionTime\":10,\"distance\":-1,"
                                + validStart + "," + validEnd + "}"));
    }
}
