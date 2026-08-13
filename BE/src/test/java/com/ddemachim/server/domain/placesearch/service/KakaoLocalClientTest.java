package com.ddemachim.server.domain.placesearch.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParamCount;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.ddemachim.server.domain.placesearch.exception.PlaceSearchException;
import com.ddemachim.server.global.properties.KakaoLocalProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class KakaoLocalClientTest {

    @Test
    void search_sendsLocationParamsAndMapsDistance() {
        KakaoLocalProperties properties = properties("test-key");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/v2/local/search/keyword.json")))
                .andExpect(queryParam("query", "%EA%B2%BD%EB%B3%B5%EA%B6%81"))
                .andExpect(queryParam("size", "15"))
                .andExpect(queryParam("x", "126.9768"))
                .andExpect(queryParam("y", "37.5776"))
                .andExpect(queryParam("sort", "distance"))
                .andExpect(queryParam("radius", "1000"))
                .andExpect(queryParamCount(6))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "KakaoAK test-key"))
                .andRespond(withSuccess("""
                        {"documents":[{
                          "id":"27560651","place_name":"경복궁","category_name":"여행 > 관광,명소 > 궁궐",
                          "category_group_code":"AT4","road_address_name":"서울 종로구 사직로 161",
                          "address_name":"서울 종로구 세종로 1-1","x":"126.976896737645",
                          "y":"37.5776087830657","phone":"02-3700-3900",
                          "place_url":"https://place.map.kakao.com/27560651","distance":" 321 "
                        }]}
                        """, MediaType.APPLICATION_JSON));

        KakaoLocalClient client = new KakaoLocalClient(properties, builder);
        var result = client.search("경복궁", 37.5776, 126.9768, 1000);

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().providerPlaceId()).isEqualTo("27560651");
        assertThat(result.getFirst().longitude()).isEqualTo(126.976896737645);
        assertThat(result.getFirst().latitude()).isEqualTo(37.5776087830657);
        assertThat(result.getFirst().distanceMeters()).isEqualTo(321);
        server.verify();
    }

    @Test
    void search_withCoordinatesAndNoRadiusOmitsRadius() {
        KakaoLocalProperties properties = properties("test-key");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/v2/local/search/keyword.json")))
                .andExpect(queryParam("query", "%EA%B2%BD%EB%B3%B5%EA%B6%81"))
                .andExpect(queryParam("size", "15"))
                .andExpect(queryParam("x", "126.9768"))
                .andExpect(queryParam("y", "37.5776"))
                .andExpect(queryParam("sort", "distance"))
                .andExpect(queryParamCount(5))
                .andRespond(withSuccess("{\"documents\":[]}", MediaType.APPLICATION_JSON));

        KakaoLocalClient client = new KakaoLocalClient(properties, builder);

        assertThat(client.search("경복궁", 37.5776, 126.9768, null)).isEmpty();
        server.verify();
    }

    @Test
    void search_withoutCoordinatesOmitsLocationParams() {
        KakaoLocalProperties properties = properties("test-key");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/v2/local/search/keyword.json")))
                .andExpect(queryParam("query", "%EA%B2%BD%EB%B3%B5%EA%B6%81"))
                .andExpect(queryParam("size", "15"))
                .andExpect(queryParamCount(2))
                .andRespond(withSuccess("{\"documents\":[]}", MediaType.APPLICATION_JSON));

        KakaoLocalClient client = new KakaoLocalClient(properties, builder);

        assertThat(client.search("경복궁", null, null, null)).isEmpty();
        server.verify();
    }

    @Test
    void search_withoutCoordinatesOmitsLocationParamsEvenWhenRadiusIsProvided() {
        KakaoLocalProperties properties = properties("test-key");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/v2/local/search/keyword.json")))
                .andExpect(queryParam("query", "%EA%B2%BD%EB%B3%B5%EA%B6%81"))
                .andExpect(queryParam("size", "15"))
                .andExpect(queryParamCount(2))
                .andRespond(withSuccess("{\"documents\":[]}", MediaType.APPLICATION_JSON));

        KakaoLocalClient client = new KakaoLocalClient(properties, builder);

        assertThat(client.search("경복궁", null, null, 1000)).isEmpty();
        server.verify();
    }

    @Test
    void search_mapsBlankAndMissingDistanceToNull() {
        KakaoLocalProperties properties = properties("test-key");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withSuccess("""
                        {"documents":[
                          {"id":"1","place_name":"장소 1","x":"126.9","y":"37.5","distance":"   "},
                          {"id":"2","place_name":"장소 2","x":"127.0","y":"37.6"}
                        ]}
                        """, MediaType.APPLICATION_JSON));

        KakaoLocalClient client = new KakaoLocalClient(properties, builder);
        var result = client.search("장소", null, null, null);

        assertThat(result).extracting(response -> response.distanceMeters()).containsExactly(null, null);
        server.verify();
    }

    @Test
    void search_rejectsMalformedDistanceAsUpstreamFailure() {
        KakaoLocalProperties properties = properties("test-key");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withSuccess("""
                        {"documents":[{"id":"1","place_name":"장소","x":"126.9","y":"37.5","distance":"12m"}]}
                        """, MediaType.APPLICATION_JSON));

        KakaoLocalClient client = new KakaoLocalClient(properties, builder);

        assertThatThrownBy(() -> client.search("장소", 37.5, 126.9, null))
                .isInstanceOf(PlaceSearchException.class)
                .hasMessage("장소 검색 서비스 연결이 원활하지 않습니다.");
        server.verify();
    }

    @Test
    void search_rejectsMalformedCoordinatesAsUpstreamFailure() {
        KakaoLocalProperties properties = properties("test-key");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.any(String.class)))
                .andRespond(withSuccess("""
                        {"documents":[{"id":"1","place_name":"장소","x":"invalid","y":"37.5"}]}
                        """, MediaType.APPLICATION_JSON));

        KakaoLocalClient client = new KakaoLocalClient(properties, builder);

        assertThatThrownBy(() -> client.search("장소", null, null, null))
                .isInstanceOf(PlaceSearchException.class)
                .hasMessage("장소 검색 서비스 연결이 원활하지 않습니다.");
        server.verify();
    }

    @Test
    void search_failsSafelyWhenApiKeyIsMissing() {
        RestClient.Builder builder = RestClient.builder();
        KakaoLocalClient client = new KakaoLocalClient(properties(""), builder);

        assertThatThrownBy(() -> client.search("경복궁", null, null, null))
                .isInstanceOf(PlaceSearchException.class)
                .hasMessage("장소 검색 서비스를 사용할 수 없습니다.");
    }

    private KakaoLocalProperties properties(String key) {
        KakaoLocalProperties properties = new KakaoLocalProperties();
        properties.setRestApiKey(key);
        properties.setBaseUrl("https://dapi.kakao.com");
        return properties;
    }
}
