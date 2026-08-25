package com.ddemachim.server.domain.route.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteLeg;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.global.properties.TmapProperties;
import java.net.SocketTimeoutException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

class TmapRouteClientTest {

    private static final Coordinate ORIGIN = new Coordinate(37.5665, 126.9780);
    private static final Coordinate DESTINATION = new Coordinate(37.5559, 126.9723);

    @Test
    void walking_normalizesSummaryAndLineString() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString(
                        "/tmap/routes/pedestrian?version=1")))
                .andExpect(header("appKey", "test-key"))
                .andExpect(content().json("""
                        {
                          "startX": 126.978,
                          "startY": 37.5665,
                          "endX": 126.9723,
                          "endY": 37.5559,
                          "startName": "현재 위치",
                          "endName": "선택 장소"
                        }
                        """))
                .andRespond(withSuccess(WALKING_RESPONSE, MediaType.APPLICATION_JSON));

        RouteOption route = testClient.client().findWalking(ORIGIN, DESTINATION);

        assertThat(route.mode()).isEqualTo(RouteMode.WALK);
        assertThat(route.durationSeconds()).isEqualTo(840);
        assertThat(route.distanceMeters()).isEqualTo(920);
        assertThat(route.walkDistanceMeters()).isEqualTo(920);
        assertThat(route.legs()).hasSize(1);
        assertThat(route.legs().getFirst().geometry().coordinates().getFirst())
                .containsExactly(126.9780, 37.5665);
        testClient.server().verify();
    }

    @Test
    void walkingVariant_sendsEachApprovedSearchOptionToThePedestrianEndpoint() {
        // Mutation caught: omitting, substituting, or inventing a TMAP pedestrian searchOption.
        TestClient testClient = testClient("test-key");
        expectWalkingVariant(testClient, "0");
        expectWalkingVariant(testClient, "4");
        expectWalkingVariant(testClient, "10");
        expectWalkingVariant(testClient, "30");

        RouteOption recommended = testClient.client().findWalkingVariant(
                ORIGIN, DESTINATION, PedestrianSearchOption.RECOMMENDED);
        RouteOption mainRoad = testClient.client().findWalkingVariant(
                ORIGIN, DESTINATION, PedestrianSearchOption.RECOMMENDED_MAIN_ROAD);
        RouteOption shortest = testClient.client().findWalkingVariant(
                ORIGIN, DESTINATION, PedestrianSearchOption.SHORTEST);
        RouteOption withoutStairs = testClient.client().findWalkingVariant(
                ORIGIN, DESTINATION, PedestrianSearchOption.SHORTEST_WITHOUT_STAIRS);

        assertThat(recommended.legs().getFirst().geometry().coordinates())
                .isEqualTo(mainRoad.legs().getFirst().geometry().coordinates())
                .isEqualTo(shortest.legs().getFirst().geometry().coordinates())
                .isEqualTo(withoutStairs.legs().getFirst().geometry().coordinates());
        testClient.server().verify();
    }

    @Test
    void transit_selectsFastestItineraryAndMapsTransferFareAndLegs() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString("/transit/routes")))
                .andExpect(header("appKey", "test-key"))
                .andExpect(content().json("""
                        {
                          "startX": 126.978,
                          "startY": 37.5665,
                          "endX": 126.9723,
                          "endY": 37.5559,
                          "startName": "현재 위치",
                          "endName": "선택 장소",
                          "count": 10,
                          "lang": 0,
                          "format": "json"
                        }
                        """))
                .andRespond(withSuccess(TRANSIT_RESPONSE, MediaType.APPLICATION_JSON));

        SelectedTransitRoute selected = testClient.client()
                .findSelectedTransit(ORIGIN, DESTINATION);
        RouteOption route = selected.option();
        RouteOption publicRoute = testClient.client().findTransit(ORIGIN, DESTINATION);

        assertThat(publicRoute).isEqualTo(route);
        assertThat(route.mode()).isEqualTo(RouteMode.TRANSIT);
        assertThat(route.durationSeconds()).isEqualTo(1_320);
        assertThat(route.transferCount()).isEqualTo(1);
        assertThat(route.fareWon()).isEqualTo(1_500);
        assertThat(route.legs()).extracting(RouteLeg::mode)
                .containsExactly(RouteMode.WALK, RouteMode.TRANSIT, RouteMode.WALK);
        assertThat(route.legs().get(1).routeName()).isEqualTo("종로01");
        assertThat(route.legs().get(1).geometry().coordinates().getFirst())
                .containsExactly(126.9775, 37.5655);
        assertThat(route.legs().getFirst().steps())
                .singleElement()
                .satisfies(step -> {
                    assertThat(step.streetName()).isEqualTo("세종대로23길");
                    assertThat(step.description()).isEqualTo("광화문 방향으로 직진");
                });
        assertThat(route.legs().get(1).steps()).isEmpty();
        assertThat(route.legs().get(2).steps()).isEmpty();
        assertThat(selected.walkSegments())
                .extracting(TransitWalkSegment::walkOrdinal, TransitWalkSegment::legIndex)
                .containsExactly(tuple(1, 0), tuple(2, 2));
        assertThat(selected.walkSegments().getFirst().geometry()).containsExactly(
                new Coordinate(37.5665, 126.9780),
                new Coordinate(37.5660, 126.9777));
        assertThatThrownBy(() -> selected.walkSegments().add(
                        selected.walkSegments().getFirst()))
                .isInstanceOf(UnsupportedOperationException.class);
        testClient.server().verify();
    }

    @Test
    void transitFailure_isNotCachedAndTheSamePairIsRetriedAcrossEntrypoints() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString("/transit/routes")))
                .andRespond(withServerError());
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString("/transit/routes")))
                .andRespond(withSuccess(TRANSIT_RESPONSE, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().findTransit(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);

        SelectedTransitRoute retried = testClient.client()
                .findSelectedTransit(ORIGIN, DESTINATION);

        assertThat(retried.option().durationSeconds()).isEqualTo(1_320);
        testClient.server().verify();
    }

    @Test
    void transit_walkLegWithoutSteps_isNormalizedToEmptyImmutableList() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString("/transit/routes")))
                .andRespond(withSuccess("""
                        {
                          "metaData": {"plan": {"itineraries": [{
                            "totalTime": 300,
                            "legs": [{
                            "mode": "WALK",
                            "sectionTime": 300,
                            "distance": 250,
                            "start": {"lon": 126.9780, "lat": 37.5665},
                            "end": {"lon": 126.9723, "lat": 37.5559},
                            "passShape": {"linestring": "126.9780,37.5665 126.9723,37.5559"}
                            }]
                          }]}}
                        }
                        """, MediaType.APPLICATION_JSON));

        RouteOption route = testClient.client().findTransit(ORIGIN, DESTINATION);

        assertThat(route.legs().getFirst().steps()).isEmpty();
        assertThatThrownBy(() -> route.legs().add(route.legs().getFirst()))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> route.legs().getFirst().steps().add(null))
                .isInstanceOf(UnsupportedOperationException.class);
        testClient.server().verify();
    }

    @Test
    void taxi_mapsEstimatedFareWithoutConfusingTotalFare() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString(
                        "/tmap/routes?version=1")))
                .andExpect(header("appKey", "test-key"))
                .andExpect(content().json("""
                        {
                          "startX": 126.978,
                          "startY": 37.5665,
                          "endX": 126.9723,
                          "endY": 37.5559,
                          "startName": "현재 위치",
                          "endName": "선택 장소",
                          "reqCoordType": "WGS84GEO",
                          "resCoordType": "WGS84GEO",
                          "searchOption": "0"
                        }
                        """))
                .andRespond(withSuccess(TAXI_RESPONSE, MediaType.APPLICATION_JSON));

        RouteOption route = testClient.client().findTaxi(ORIGIN, DESTINATION);

        assertThat(route.mode()).isEqualTo(RouteMode.TAXI);
        assertThat(route.durationSeconds()).isEqualTo(610);
        assertThat(route.fareWon()).isEqualTo(8_700);
        assertThat(route.distanceMeters()).isEqualTo(3_200);
        testClient.server().verify();
    }

    @Test
    void blankKey_isReportedAsNotConfiguredWithoutCallingUpstream() {
        TmapRouteClient client = testClient("   ").client();

        assertThatThrownBy(() -> client.findWalking(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.NOT_CONFIGURED);
    }

    @Test
    void malformedGeometry_isReportedAsProviderUnavailable() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString(
                        "/tmap/routes/pedestrian?version=1")))
                .andRespond(withSuccess("""
                        {
                          "type": "FeatureCollection",
                          "features": [{
                            "type": "Feature",
                            "geometry": {"type": "LineString", "coordinates": [[126.9780]]},
                            "properties": {"distance": 920, "time": 840}
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().findWalking(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
        testClient.server().verify();
    }

    @Test
    void outOfRangeGeometryCoordinates_areReportedAsProviderUnavailable() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString(
                        "/tmap/routes/pedestrian?version=1")))
                .andRespond(withSuccess("""
                        {
                          "type": "FeatureCollection",
                          "features": [{
                            "type": "Feature",
                            "geometry": {"type": "LineString", "coordinates": [
                              [200.0, 100.0], [126.9723, 37.5559]
                            ]},
                            "properties": {"distance": 920, "time": 840}
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().findWalking(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
        testClient.server().verify();
    }

    @Test
    void malformedCoordinates_areReportedAsProviderUnavailableWithoutCallingUpstream() {
        TmapRouteClient client = testClient("test-key").client();

        assertThatThrownBy(() -> client.findWalking(
                        new Coordinate(Double.NaN, 126.9780), DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
    }

    @Test
    void upstreamHttpError_isReportedAsProviderUnavailable() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString(
                        "/tmap/routes/pedestrian?version=1")))
                .andRespond(withServerError());

        assertThatThrownBy(() -> testClient.client().findWalking(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
        testClient.server().verify();
    }

    @Test
    void timeout_isReportedAsTypedProviderExceptionWithoutUpstreamDetails() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString(
                        "/tmap/routes?version=1")))
                .andRespond(withException(new SocketTimeoutException("sensitive timeout detail")));

        assertThatThrownBy(() -> testClient.client().findTaxi(ORIGIN, DESTINATION))
                .isInstanceOfSatisfying(RouteProviderException.class, exception -> {
                    assertThat(exception.reason()).isEqualTo(RouteUnavailableReason.TIMEOUT);
                    assertThat(exception.getCause()).isNull();
                    assertThat(exception.getMessage()).doesNotContain("sensitive timeout detail");
                });
        testClient.server().verify();
    }

    @Test
    void properties_exposeRequiredDefaults() {
        TmapProperties properties = new TmapProperties();

        assertThat(properties.getBaseUrl()).isEqualTo("https://apis.openapi.sk.com");
        assertThat(properties.getAppKey()).isBlank();
        assertThat(properties.getConnectTimeout()).hasSeconds(2);
        assertThat(properties.getReadTimeout()).hasSeconds(4);
        assertThat(properties.getCacheTtl()).hasMinutes(2);
        assertThat(properties.getCacheMaximumSize()).isEqualTo(1_000);
    }

    private TestClient testClient(String appKey) {
        TmapProperties properties = new TmapProperties();
        properties.setAppKey(appKey);
        properties.setBaseUrl("https://example.test");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        TmapRouteClient client = new TmapRouteClient(properties, new ObjectMapper(), builder);
        return new TestClient(client, server);
    }

    private void expectWalkingVariant(TestClient testClient, String searchOption) {
        testClient.server().expect(requestTo(org.hamcrest.Matchers.containsString(
                        "/tmap/routes/pedestrian?version=1")))
                .andExpect(header("appKey", "test-key"))
                .andExpect(content().json("""
                        {
                          "startX": 126.978,
                          "startY": 37.5665,
                          "endX": 126.9723,
                          "endY": 37.5559,
                          "startName": "현재 위치",
                          "endName": "선택 장소",
                          "searchOption": "%s"
                        }
                        """.formatted(searchOption)))
                .andRespond(withSuccess(WALKING_RESPONSE, MediaType.APPLICATION_JSON));
    }

    private record TestClient(TmapRouteClient client, MockRestServiceServer server) {
    }

    private static final String WALKING_RESPONSE = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": {"type": "Point", "coordinates": [126.9780, 37.5665]},
                  "properties": {"pointType": "SP"}
                },
                {
                  "type": "Feature",
                  "geometry": {"type": "LineString", "coordinates": [
                    [126.9780, 37.5665], [126.9760, 37.5620], [126.9723, 37.5559]
                  ]},
                  "properties": {"distance": 920, "time": 840}
                },
                {
                  "type": "Feature",
                  "geometry": {"type": "Point", "coordinates": [126.9723, 37.5559]},
                  "properties": {"pointType": "EP"}
                }
              ]
            }
            """;

    private static final String TRANSIT_RESPONSE = """
            {
              "metaData": {
                "plan": {
                  "itineraries": [
                    {
                      "totalTime": 1560,
                      "transferCount": 2,
                      "totalDistance": 4300,
                      "fare": {"regular": {"totalFare": 1600}},
                      "legs": []
                    },
                    {
                      "totalTime": 1320,
                      "transferCount": 1,
                      "totalDistance": 4200,
                      "totalWalkDistance": 1000,
                      "fare": {"regular": {"totalFare": 1500}},
                      "legs": [
                        {
                          "mode": "WALK",
                          "sectionTime": 180,
                          "distance": 180,
                          "start": {"lon": 126.9780, "lat": 37.5665},
                          "end": {"lon": 126.9775, "lat": 37.5655},
                          "steps": [{
                            "streetName": "세종대로23길",
                            "distance": 80,
                            "description": "광화문 방향으로 직진",
                            "linestring": "126.9780,37.5665 126.9777,37.5660"
                          }],
                          "passShape": {"linestring": "126.9780,37.5665 126.9775,37.5655"}
                        },
                        {
                          "mode": "BUS",
                          "route": "종로01",
                          "sectionTime": 960,
                          "distance": 3200,
                          "passShape": {"linestring": "126.9775,37.5655 126.9740,37.5600"}
                        },
                        {
                          "mode": "WALK",
                          "sectionTime": 180,
                          "distance": 820,
                          "start": {"lon": 126.9740, "lat": 37.5600},
                          "end": {"lon": 126.9723, "lat": 37.5559},
                          "passShape": {"linestring": "126.9740,37.5600 126.9723,37.5559"}
                        }
                      ]
                    }
                  ]
                }
              }
            }
            """;

    private static final String TAXI_RESPONSE = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": {"type": "LineString", "coordinates": [
                    [126.9780, 37.5665], [126.9750, 37.5610], [126.9723, 37.5559]
                  ]},
                  "properties": {
                    "totalTime": 610,
                    "totalDistance": 3200,
                    "taxiFare": 8700,
                    "totalFare": 999999
                  }
                }
              ]
            }
            """;
}
