package com.ddemachim.server.domain.placesearch.service;

import com.ddemachim.server.domain.placesearch.dto.KakaoPlaceSearchResponse;
import com.ddemachim.server.domain.placesearch.exception.PlaceSearchErrorStatus;
import com.ddemachim.server.domain.placesearch.exception.PlaceSearchException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PlaceSearchService {

    private static final int MAX_QUERY_LENGTH = 100;
    private static final double MIN_LATITUDE = -90.0;
    private static final double MAX_LATITUDE = 90.0;
    private static final double MIN_LONGITUDE = -180.0;
    private static final double MAX_LONGITUDE = 180.0;
    private static final int MIN_RADIUS = 0;
    private static final int MAX_RADIUS = 20000;

    private final KakaoLocalClient kakaoLocalClient;

    public List<KakaoPlaceSearchResponse> searchKakaoPlaces(
            String query, Double latitude, Double longitude, Integer radius) {
        String normalizedQuery = query == null ? "" : query.trim();
        if (normalizedQuery.isEmpty() || normalizedQuery.length() > MAX_QUERY_LENGTH) {
            throw new PlaceSearchException(PlaceSearchErrorStatus.INVALID_QUERY);
        }

        validateLocationParams(latitude, longitude, radius);
        return kakaoLocalClient.search(normalizedQuery, latitude, longitude, radius);
    }

    private void validateLocationParams(Double latitude, Double longitude, Integer radius) {
        boolean hasLatitude = latitude != null;
        boolean hasLongitude = longitude != null;

        if (hasLatitude != hasLongitude || (!hasLatitude && radius != null)) {
            throw new PlaceSearchException(PlaceSearchErrorStatus.INVALID_LOCATION_PARAMETERS);
        }
        if (!hasLatitude) {
            return;
        }

        boolean hasInvalidCoordinates = !Double.isFinite(latitude)
                || !Double.isFinite(longitude)
                || latitude < MIN_LATITUDE
                || latitude > MAX_LATITUDE
                || longitude < MIN_LONGITUDE
                || longitude > MAX_LONGITUDE;
        boolean hasInvalidRadius = radius != null && (radius < MIN_RADIUS || radius > MAX_RADIUS);
        if (hasInvalidCoordinates || hasInvalidRadius) {
            throw new PlaceSearchException(PlaceSearchErrorStatus.INVALID_LOCATION_PARAMETERS);
        }
    }
}
