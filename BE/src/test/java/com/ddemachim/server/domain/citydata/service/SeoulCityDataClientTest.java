package com.ddemachim.server.domain.citydata.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.ddemachim.server.global.properties.SeoulCityDataProperties;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

class SeoulCityDataClientTest {

    @Test
    void fetchCurrentCongestion_parsesJsonAndMapsPopulationFields() {
        TestClient testClient = testClient();
        testClient.server().expect(requestTo("https://example.test/test-key/json/citydata/1/5/POI088"))
                .andRespond(withSuccess("""
                        {
                          "CITYDATA": {
                            "LIVE_PPLTN_STTS": [{
                              "AREA_CONGEST_LVL": "약간 붐빔",
                              "AREA_CONGEST_MSG": "사람이 다소 몰려 있습니다.",
                              "AREA_PPLTN_MIN": "12000",
                              "AREA_PPLTN_MAX": "14000",
                              "PPLTN_TIME": "2026-08-12 17:15"
                            }]
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        CityDataAreaCongestion result = testClient.client().fetchCurrentCongestion(
                new CityDataArea("POI088", "광화문광장", "공원"));

        assertThat(result).isEqualTo(new CityDataAreaCongestion(
                "POI088",
                "광화문광장",
                "공원",
                "약간 붐빔",
                "사람이 다소 몰려 있습니다.",
                12000,
                14000,
                LocalDateTime.of(2026, 8, 12, 17, 15)));
        testClient.server().verify();
    }

    @Test
    void fetchCurrentCongestion_rejectsBlankResponseBody() {
        TestClient testClient = testClient();
        testClient.server().expect(requestTo("https://example.test/test-key/json/citydata/1/5/POI088"))
                .andRespond(withSuccess("   ", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().fetchCurrentCongestion(
                        new CityDataArea("POI088", "광화문광장", "공원")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("서울 실시간 도시데이터 응답이 비어 있습니다.")
                .hasMessageNotContaining("test-key");
        testClient.server().verify();
    }

    @Test
    void fetchCurrentCongestion_rejectsInvalidJsonWithoutExposingResponseContent() {
        TestClient testClient = testClient();
        String invalidResponse = "not-json-sensitive-upstream-content";
        testClient.server().expect(requestTo("https://example.test/test-key/json/citydata/1/5/POI088"))
                .andRespond(withSuccess(invalidResponse, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> testClient.client().fetchCurrentCongestion(
                        new CityDataArea("POI088", "광화문광장", "공원")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("서울 실시간 도시데이터 JSON 응답을 파싱할 수 없습니다.")
                .hasMessageNotContaining("test-key")
                .hasMessageNotContaining(invalidResponse)
                .hasCauseInstanceOf(tools.jackson.core.JacksonException.class);
        testClient.server().verify();
    }

    private TestClient testClient() {
        SeoulCityDataProperties properties = new SeoulCityDataProperties();
        properties.setApiKey("test-key");
        properties.setBaseUrl("https://example.test");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        SeoulCityDataClient client = new SeoulCityDataClient(properties, new ObjectMapper(), builder);
        return new TestClient(client, server);
    }

    private record TestClient(SeoulCityDataClient client, MockRestServiceServer server) {
    }
}
