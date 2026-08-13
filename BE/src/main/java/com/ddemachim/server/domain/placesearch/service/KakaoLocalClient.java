package com.ddemachim.server.domain.placesearch.service;

import com.ddemachim.server.domain.placesearch.dto.KakaoPlaceSearchResponse;
import com.ddemachim.server.domain.placesearch.exception.PlaceSearchErrorStatus;
import com.ddemachim.server.domain.placesearch.exception.PlaceSearchException;
import com.ddemachim.server.global.properties.KakaoLocalProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class KakaoLocalClient {

    private static final int RESULT_SIZE = 15;

    private final KakaoLocalProperties properties;
    private final RestClient restClient;

    @Autowired
    public KakaoLocalClient(KakaoLocalProperties properties) {
        this(properties, RestClient.builder());
    }

    KakaoLocalClient(KakaoLocalProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClient = restClientBuilder.baseUrl(properties.getBaseUrl()).build();
    }

    public List<KakaoPlaceSearchResponse> search(
            String query, Double latitude, Double longitude, Integer radius) {
        if (!properties.hasRestApiKey()) {
            throw new PlaceSearchException(PlaceSearchErrorStatus.KAKAO_NOT_CONFIGURED);
        }

        try {
            KakaoKeywordResponse response = restClient.get()
                    .uri(uriBuilder -> {
                        uriBuilder
                                .path("/v2/local/search/keyword.json")
                                .queryParam("query", query)
                                .queryParam("size", RESULT_SIZE);
                        if (latitude != null && longitude != null) {
                            uriBuilder
                                    .queryParam("x", longitude)
                                    .queryParam("y", latitude)
                                    .queryParam("sort", "distance");
                            if (radius != null) {
                                uriBuilder.queryParam("radius", radius);
                            }
                        }
                        return uriBuilder.build();
                    })
                    .header(HttpHeaders.AUTHORIZATION, "KakaoAK " + properties.getRestApiKey().trim())
                    .retrieve()
                    .body(KakaoKeywordResponse.class);

            if (response == null || response.documents() == null) {
                throw new PlaceSearchException(PlaceSearchErrorStatus.KAKAO_UPSTREAM_ERROR);
            }
            return response.documents().stream().map(this::toResponse).toList();
        } catch (PlaceSearchException exception) {
            throw exception;
        } catch (RestClientException | IllegalArgumentException exception) {
            throw new PlaceSearchException(PlaceSearchErrorStatus.KAKAO_UPSTREAM_ERROR);
        }
    }

    private KakaoPlaceSearchResponse toResponse(KakaoDocument document) {
        if (document == null || document.id() == null || document.placeName() == null) {
            throw new PlaceSearchException(PlaceSearchErrorStatus.KAKAO_UPSTREAM_ERROR);
        }
        try {
            return new KakaoPlaceSearchResponse(
                    document.id(),
                    document.placeName(),
                    document.categoryName(),
                    document.categoryGroupCode(),
                    document.roadAddressName(),
                    document.addressName(),
                    Double.valueOf(document.x()),
                    Double.valueOf(document.y()),
                    parseDistanceMeters(document.distance()),
                    document.phone(),
                    document.placeUrl());
        } catch (NullPointerException | NumberFormatException exception) {
            throw new PlaceSearchException(PlaceSearchErrorStatus.KAKAO_UPSTREAM_ERROR);
        }
    }

    private Integer parseDistanceMeters(String distance) {
        if (distance == null || distance.isBlank()) {
            return null;
        }
        return Integer.valueOf(distance.trim());
    }

    record KakaoKeywordResponse(List<KakaoDocument> documents) {}

    record KakaoDocument(
            String id,
            @JsonProperty("place_name") String placeName,
            @JsonProperty("category_name") String categoryName,
            @JsonProperty("category_group_code") String categoryGroupCode,
            @JsonProperty("road_address_name") String roadAddressName,
            @JsonProperty("address_name") String addressName,
            String x,
            String y,
            String phone,
            @JsonProperty("place_url") String placeUrl,
            String distance) {}
}
