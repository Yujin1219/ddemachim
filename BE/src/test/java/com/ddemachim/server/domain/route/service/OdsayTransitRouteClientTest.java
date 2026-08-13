package com.ddemachim.server.domain.route.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
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
import com.ddemachim.server.global.properties.OdsayProperties;
import java.net.SocketTimeoutException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

class OdsayTransitRouteClientTest {

    private static final Coordinate ORIGIN = new Coordinate(37.5665, 126.9780);
    private static final Coordinate DESTINATION = new Coordinate(37.5559, 126.9723);

    @Test
    void transit_normalizesFastestPathAndUsesSingleOdsayRequest() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(allOf(
                        containsString("/v1/api/searchPubTransPathT"),
                        containsString("SX=126.978"),
                        containsString("SY=37.5665"),
                        containsString("EX=126.9723"),
                        containsString("EY=37.5559"),
                        containsString("OPT=0"),
                        containsString("SearchType=0"),
                        containsString("SearchPathType=0"),
                        containsString("lang=0"),
                        containsString("output=json"),
                        containsString("apiKey=test-key"))))
                .andRespond(withSuccess(TRANSIT_RESPONSE, MediaType.APPLICATION_JSON));

        RouteOption route = testClient.client().findTransit(ORIGIN, DESTINATION);

        assertThat(route.mode()).isEqualTo(RouteMode.TRANSIT);
        assertThat(route.durationSeconds()).isEqualTo(1_320);
        assertThat(route.distanceMeters()).isEqualTo(4_200);
        assertThat(route.fareWon()).isEqualTo(1_500);
        assertThat(route.transferCount()).isEqualTo(1);
        assertThat(route.walkDistanceMeters()).isEqualTo(1_000);
        assertThat(route.legs()).extracting(RouteLeg::mode)
                .containsExactly(RouteMode.WALK, RouteMode.TRANSIT, RouteMode.WALK);
        assertThat(route.legs()).allMatch(leg -> leg.geometry() == null);
        assertThat(route.legs().get(0).durationSeconds()).isEqualTo(300);
        assertThat(route.legs().get(1).durationSeconds()).isEqualTo(600);
        assertThat(route.legs().get(1).routeName()).isEqualTo("종로01");
        testClient.server().verify();
    }

    @Test
    void subwayLaneName_isUsedForTransitLegRouteName() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withSuccess(SUBWAY_RESPONSE, MediaType.APPLICATION_JSON));

        RouteOption route = testClient.client().findTransit(ORIGIN, DESTINATION);

        assertThat(route.legs()).extracting(RouteLeg::routeName)
                .containsExactly(null, "2호선", null);
        testClient.server().verify();
    }

    @Test
    void equalCandidateTimes_preserveTheFirstCandidate() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withSuccess(TIED_RESPONSE, MediaType.APPLICATION_JSON));

        RouteOption route = testClient.client().findTransit(ORIGIN, DESTINATION);

        assertThat(route.fareWon()).isEqualTo(1_100);
        assertThat(route.legs().get(1).routeName()).isEqualTo("첫번째노선");
        testClient.server().verify();
    }

    @Test
    void invalidCandidate_isSkippedWhenAnotherValidCandidateExists() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withSuccess("""
                        {"result":{"path":[
                          {"info":{"totalTime":"not-a-number","totalDistance":4200},
                           "subPath":[]},
                          {"info":{"totalTime":22,"totalDistance":4200,
                                    "totalWalk":1000,"payment":1500,
                                    "busTransitCount":1,"subwayTransitCount":0},
                           "subPath":[
                             {"trafficType":3,"sectionTime":5,"distance":300},
                             {"trafficType":2,"sectionTime":10,"distance":3200,
                              "lane":[{"busNo":"유효노선"}]},
                             {"trafficType":3,"sectionTime":7,"distance":700}
                           ]}
                        ]}}
                        """, MediaType.APPLICATION_JSON));

        RouteOption route = testClient.client().findTransit(ORIGIN, DESTINATION);

        assertThat(route.durationSeconds()).isEqualTo(1_320);
        assertThat(route.legs().get(1).routeName()).isEqualTo("유효노선");
        testClient.server().verify();
    }

    @Test
    void blankKey_isReportedAsNotConfiguredWithoutCallingUpstream() {
        OdsayTransitRouteClient client = testClient("   ").client();

        assertThatThrownBy(() -> client.findTransit(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.NOT_CONFIGURED);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}",
            "{\"result\":{}}",
            "{\"result\":{\"path\":[]}}"
    })
    void missingOrEmptyResultPath_isReportedAsNoRoute(String response) {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().findTransit(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.NO_ROUTE);
        testClient.server().verify();
    }

    @ParameterizedTest
    @ValueSource(ints = {3, 4, 5, 6, -98, -99})
    void knownOdsayNoResultCodes_areReportedAsNoRoute(int code) {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withSuccess("{\"error\":{\"code\":%d}}".formatted(code),
                        MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().findTransit(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.NO_ROUTE);
        testClient.server().verify();
    }

    @Test
    void malformedNumericField_isReportedAsProviderUnavailable() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withSuccess("""
                        {"result":{"path":[{
                          "info":{"totalTime":"not-a-number","totalDistance":4200},
                          "subPath":[]
                        }]}}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().findTransit(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
        testClient.server().verify();
    }

    @Test
    void unsupportedTrafficType_isReportedAsProviderUnavailable() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withSuccess("""
                        {"result":{"path":[{
                          "info":{"totalTime":22,"totalDistance":4200},
                          "subPath":[{"trafficType":9,"sectionTime":22,"distance":4200}]
                        }]}}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().findTransit(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
        testClient.server().verify();
    }

    @Test
    void upstreamHttpError_isReportedAsProviderUnavailable() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withServerError());

        assertThatThrownBy(() -> testClient.client().findTransit(ORIGIN, DESTINATION))
                .isInstanceOf(RouteProviderException.class)
                .extracting("reason")
                .isEqualTo(RouteUnavailableReason.PROVIDER_UNAVAILABLE);
        testClient.server().verify();
    }

    @Test
    void timeout_isReportedAsTypedProviderExceptionWithoutUpstreamDetails() {
        TestClient testClient = testClient("test-key");
        testClient.server().expect(requestTo(containsString("/v1/api/searchPubTransPathT")))
                .andRespond(withException(new SocketTimeoutException("sensitive timeout detail")));

        assertThatThrownBy(() -> testClient.client().findTransit(ORIGIN, DESTINATION))
                .isInstanceOfSatisfying(RouteProviderException.class, exception -> {
                    assertThat(exception.reason()).isEqualTo(RouteUnavailableReason.TIMEOUT);
                    assertThat(exception.getCause()).isNull();
                    assertThat(exception.getMessage()).doesNotContain("sensitive timeout detail");
                });
        testClient.server().verify();
    }

    @Test
    void properties_exposeRequiredDefaults() {
        OdsayProperties properties = new OdsayProperties();

        assertThat(properties.getBaseUrl()).isEqualTo("https://api.odsay.com");
        assertThat(properties.getApiKey()).isBlank();
        assertThat(properties.getConnectTimeout()).hasSeconds(2);
        assertThat(properties.getReadTimeout()).hasSeconds(4);
        assertThat(properties.hasApiKey()).isFalse();
    }

    private TestClient testClient(String apiKey) {
        OdsayProperties properties = new OdsayProperties();
        properties.setApiKey(apiKey);
        properties.setBaseUrl("https://example.test");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        OdsayTransitRouteClient client = new OdsayTransitRouteClient(
                properties, new ObjectMapper(), builder);
        return new TestClient(client, server);
    }

    private record TestClient(OdsayTransitRouteClient client, MockRestServiceServer server) {
    }

    private static final String TRANSIT_RESPONSE = """
            {
              "result": {
                "path": [
                  {
                    "info": {
                      "totalTime": 30,
                      "totalDistance": 4300,
                      "totalWalk": 1200,
                      "payment": 1600,
                      "busTransitCount": 2,
                      "subwayTransitCount": 0
                    },
                    "subPath": [
                      {"trafficType": 3, "sectionTime": 5, "distance": 300},
                      {"trafficType": 2, "sectionTime": 20, "distance": 3500,
                       "lane": [{"busNo": "느린버스"}]},
                      {"trafficType": 3, "sectionTime": 5, "distance": 500}
                    ]
                  },
                  {
                    "info": {
                      "totalTime": 22,
                      "totalDistance": 4200,
                      "totalWalk": 1000,
                      "payment": 1500,
                      "busTransitCount": 1,
                      "subwayTransitCount": 0
                    },
                    "subPath": [
                      {"trafficType": 3, "sectionTime": 5, "distance": 300},
                      {"trafficType": 2, "sectionTime": 10, "distance": 3200,
                       "lane": [{"busNo": "종로01"}]},
                      {"trafficType": 3, "sectionTime": 7, "distance": 700}
                    ]
                  }
                ]
              }
            }
            """;

    private static final String SUBWAY_RESPONSE = """
            {"result":{"path":[{
              "info":{"totalTime":22,"totalDistance":4200,"totalWalk":1000,
                      "payment":1500,"busTransitCount":0,"subwayTransitCount":1},
              "subPath":[
                {"trafficType":3,"sectionTime":5,"distance":300},
                {"trafficType":1,"sectionTime":10,"distance":3200,
                 "lane":[{"name":"2호선"}]},
                {"trafficType":3,"sectionTime":7,"distance":700}
              ]
            }]}}
            """;

    private static final String TIED_RESPONSE = """
            {"result":{"path":[
              {"info":{"totalTime":22,"totalDistance":4200,"totalWalk":1000,
                        "payment":1100,"busTransitCount":1,"subwayTransitCount":0},
               "subPath":[
                 {"trafficType":3,"sectionTime":5,"distance":300},
                 {"trafficType":2,"sectionTime":10,"distance":3200,
                  "lane":[{"busNo":"첫번째노선"}]},
                 {"trafficType":3,"sectionTime":7,"distance":700}]},
              {"info":{"totalTime":22,"totalDistance":4200,"totalWalk":1000,
                        "payment":2200,"busTransitCount":1,"subwayTransitCount":0},
               "subPath":[
                 {"trafficType":3,"sectionTime":5,"distance":300},
                 {"trafficType":2,"sectionTime":10,"distance":3200,
                  "lane":[{"busNo":"두번째노선"}]},
                 {"trafficType":3,"sectionTime":7,"distance":700}]}
            ]}}
            """;
}
