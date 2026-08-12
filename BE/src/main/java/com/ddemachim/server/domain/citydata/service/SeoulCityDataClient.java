package com.ddemachim.server.domain.citydata.service;

import com.ddemachim.server.global.properties.SeoulCityDataProperties;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class SeoulCityDataClient {

    private static final DateTimeFormatter SEOUL_CITY_DATA_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final SeoulCityDataProperties properties;
    private final RestClient restClient;

    public SeoulCityDataClient(SeoulCityDataProperties properties) {
        this.properties = properties;
        this.restClient = RestClient.builder().baseUrl(properties.getBaseUrl()).build();
    }

    CityDataAreaCongestion fetchCurrentCongestion(CityDataArea area) {
        JsonNode body = restClient.get()
                .uri("/{key}/json/citydata/1/5/{areaCode}", properties.getApiKey(), area.areaCode())
                .retrieve()
                .body(JsonNode.class);
        JsonNode livePopulation = body == null
                ? null
                : body.path("CITYDATA").path("LIVE_PPLTN_STTS").path(0);
        if (livePopulation == null || livePopulation.isMissingNode()) {
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

    private static String text(JsonNode node, String field, String fallback) {
        String value = node.path(field).asText("");
        return value.isBlank() ? fallback : value;
    }

    private static Integer integer(JsonNode node, String field) {
        String value = node.path(field).asText("");
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
        String value = node.path(field).asText("");
        if (value.isBlank()) {
            return null;
        }
        return LocalDateTime.parse(value, SEOUL_CITY_DATA_TIME_FORMATTER);
    }
}
