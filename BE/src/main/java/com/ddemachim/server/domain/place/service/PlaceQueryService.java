package com.ddemachim.server.domain.place.service;

import com.ddemachim.server.domain.place.dto.PlaceDetailResponse;
import com.ddemachim.server.domain.place.dto.PlaceImageResponse;
import com.ddemachim.server.domain.place.dto.PlaceMapResponse;
import com.ddemachim.server.domain.place.dto.PlaceOperatingHoursResponse;
import com.ddemachim.server.domain.place.dto.PlaceSummaryResponse;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceImage;
import com.ddemachim.server.domain.place.exception.InvalidPlaceBoundsException;
import com.ddemachim.server.domain.place.exception.PlaceNotFoundException;
import com.ddemachim.server.domain.place.repository.PlaceImageRepository;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlaceQueryService {

    private static final int DEFAULT_MAP_LIMIT = 300;
    private static final int MIN_MAP_LIMIT = 1;
    private static final int MAX_MAP_LIMIT = 500;

    private final PlaceRepository placeRepository;
    private final PlaceImageRepository placeImageRepository;
    private final PlaceOperatingHoursRepository placeOperatingHoursRepository;

    public Page<PlaceSummaryResponse> search(
            String category, String district, String tag, String keyword, Pageable pageable) {
        Page<Place> places = placeRepository.search(category, district, tag, keyword, pageable);

        List<Long> placeIds = places.getContent().stream().map(Place::getId).toList();
        Map<Long, String> thumbnailByPlaceId = firstImageUrlByPlaceId(placeIds);

        return places.map(
                place -> PlaceSummaryResponse.of(place, thumbnailByPlaceId.get(place.getId())));
    }

    public PlaceDetailResponse getDetail(Long id) {
        Place place = placeRepository.findById(id).orElseThrow(PlaceNotFoundException::new);

        List<PlaceOperatingHoursResponse> operatingHours =
                placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(id).stream()
                        .map(PlaceOperatingHoursResponse::from)
                        .toList();

        List<PlaceImageResponse> images =
                placeImageRepository.findByPlaceId(id).stream().map(PlaceImageResponse::from).toList();

        return PlaceDetailResponse.of(place, operatingHours, images);
    }

    public List<PlaceMapResponse> getPlacesInBounds(
            String category, String tag, Double minLat, Double maxLat, Double minLng, Double maxLng, Integer limit) {
        validateBounds(minLat, maxLat, minLng, maxLng);
        int safeLimit = normalizeLimit(limit);
        String safeCategory = normalizeFilter(category);
        String safeTag = normalizeFilter(tag);

        return placeRepository.findInBounds(safeCategory, safeTag, minLat, maxLat, minLng, maxLng, safeLimit).stream()
                .map(PlaceMapResponse::from)
                .toList();
    }

    private Map<Long, String> firstImageUrlByPlaceId(List<Long> placeIds) {
        if (placeIds.isEmpty()) {
            return Map.of();
        }

        Map<Long, String> result = new HashMap<>();
        for (Long placeId : placeIds) {
            for (PlaceImage image : placeImageRepository.findByPlaceId(placeId)) {
                result.put(placeId, image.getSourceUrl());
                break;
            }
        }
        return result;
    }

    private void validateBounds(Double minLat, Double maxLat, Double minLng, Double maxLng) {
        if (minLat == null || maxLat == null || minLng == null || maxLng == null) {
            throw new InvalidPlaceBoundsException();
        }
        if (!isLatitude(minLat) || !isLatitude(maxLat) || !isLongitude(minLng) || !isLongitude(maxLng)) {
            throw new InvalidPlaceBoundsException();
        }
        if (minLat > maxLat || minLng > maxLng) {
            throw new InvalidPlaceBoundsException();
        }
    }

    private boolean isLatitude(Double latitude) {
        return Double.isFinite(latitude) && latitude >= -90 && latitude <= 90;
    }

    private boolean isLongitude(Double longitude) {
        return Double.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    }

    private int normalizeLimit(Integer limit) {
        if (limit == null) {
            return DEFAULT_MAP_LIMIT;
        }
        return Math.max(MIN_MAP_LIMIT, Math.min(MAX_MAP_LIMIT, limit));
    }

    private String normalizeFilter(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().replaceAll("\\s*,\\s*", ",");
    }
}
