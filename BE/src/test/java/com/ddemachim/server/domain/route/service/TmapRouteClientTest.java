package com.ddemachim.server.domain.route.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
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
