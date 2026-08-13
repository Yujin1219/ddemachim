package com.ddemachim.server.domain.citydata.service;

import com.ddemachim.server.global.properties.SeoulCityDataProperties;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class SeoulCityDataClient {

    private static final DateTimeFormatter SEOUL_CITY_DATA_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final SeoulCityDataProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    @Autowired
    public SeoulCityDataClient(SeoulCityDataProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, RestClient.builder());
    }

    SeoulCityDataClient(
            SeoulCityDataProperties properties,
            ObjectMapper objectMapper,
            RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.restClient = restClientBuilder.baseUrl(properties.getBaseUrl()).build();
    }

    CityDataAreaCongestion fetchCurrentCongestion(CityDataArea area) {
        String responseBody = restClient.get()
                .uri("/{key}/json/citydata/1/5/{areaCode}", properties.getApiKey(), area.areaCode())
                .retrieve()
                .body(String.class);
        JsonNode body = parseBody(responseBody);
        JsonNode livePopulation = body.path("CITYDATA").path("LIVE_PPLTN_STTS").path(0);
        if (livePopulation.isMissingNode()) {
            throw new IllegalStateException("서울 실시간 도시데이터 인구 응답이 비어 있습니다.");
        }
        return new CityDataAreaCongestion(
                area.areaCode(),
                area.areaName(),
                area.category(),
                text(livePopulation, "AREA_CONGEST_LVL", "정보없음"),
                text(livePopulation, "AREA_CONGEST_MSG", null),
                integer(livePopulation, "AREA_PPLTN_MIN"),
                integer(livePopulation, "AREA_PPLTN_MAX"),
                dateTime(livePopulation, "PPLTN_TIME"));
    }

    private JsonNode parseBody(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            throw new IllegalStateException("서울 실시간 도시데이터 응답이 비어 있습니다.");
        }
        try {
            return objectMapper.readTree(responseBody);
        } catch (JacksonException exception) {
            throw new IllegalStateException("서울 실시간 도시데이터 JSON 응답을 파싱할 수 없습니다.", exception);
        }
    }

    private static String text(JsonNode node, String field, String fallback) {
        String value = node.path(field).asString("");
        return value.isBlank() ? fallback : value;
    }

    private static Integer integer(JsonNode node, String field) {
        String value = node.path(field).asString("");
        if (value.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static LocalDateTime dateTime(JsonNode node, String field) {
        String value = node.path(field).asString("");
        if (value.isBlank()) {
            return null;
        }
        return LocalDateTime.parse(value, SEOUL_CITY_DATA_TIME_FORMATTER);
    }
}
