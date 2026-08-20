package com.ddemachim.server.domain.place.service;

import com.ddemachim.server.domain.place.dto.PlaceDetailResponse;
import com.ddemachim.server.domain.place.dto.PlaceMapResponse;
import com.ddemachim.server.domain.place.dto.PlaceMenuResponse;
import com.ddemachim.server.domain.place.dto.PlaceOperatingHoursResponse;
import com.ddemachim.server.domain.place.dto.PlaceSummaryResponse;
import com.ddemachim.server.domain.place.dto.PlaceTrendResponse;
import com.ddemachim.server.domain.place.dto.PlaceTrendSummaryResponse;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceTrendResult;
import com.ddemachim.server.domain.place.exception.InvalidFilmingContentTypeException;
import com.ddemachim.server.domain.place.exception.InvalidPlaceBoundsException;
import com.ddemachim.server.domain.place.exception.InvalidPlaceTrendLimitException;
import com.ddemachim.server.domain.place.exception.PlaceNotFoundException;
import com.ddemachim.server.domain.place.repository.PlaceFilmingContentTypeProjection;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceMenuRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.place.repository.PlaceTrendResultRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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
    private static final int DEFAULT_TREND_LIMIT = 6;
    private static final int MIN_TREND_LIMIT = 1;
    private static final int MAX_TREND_LIMIT = 50;
    private static final Set<String> FILMING_CONTENT_TYPES = Set.of("DRAMA", "VARIETY", "MOVIE");
    private static final List<String> FILMING_CONTENT_TYPE_ORDER = List.of("DRAMA", "VARIETY", "MOVIE");
    private final PlaceRepository placeRepository;
    private final PlaceOperatingHoursRepository placeOperatingHoursRepository;
    private final PlaceMenuRepository placeMenuRepository;
    private final PlaceTrendResultRepository placeTrendResultRepository;

    public Page<PlaceSummaryResponse> search(
            String category,
            String district,
            String tag,
            String filmingContentType,
            String keyword,
            Pageable pageable) {
        String safeCategory = normalizeFilter(category);
        String safeTag = normalizeFilter(tag);
        String safeFilmingContentType = normalizeFilmingContentType(filmingContentType);
        Page<Place> places = placeRepository.search(
                safeCategory, district, safeTag, safeFilmingContentType, keyword, pageable);

        List<Long> placeIds = places.getContent().stream().map(Place::getId).toList();
        Map<Long, List<String>> filmingContentTypesByPlaceId = filmingContentTypesByPlaceId(placeIds);

        return places.map(
                place -> PlaceSummaryResponse.of(
                        place,
                        filmingContentTypesByPlaceId.getOrDefault(place.getId(), List.of())));
    }

    public PlaceDetailResponse getDetail(Long id) {
        Place place = placeRepository.findById(id).orElseThrow(PlaceNotFoundException::new);

        List<PlaceOperatingHoursResponse> operatingHours =
                placeOperatingHoursRepository.findByPlaceIdOrderByDayOfWeek(id).stream()
                        .map(PlaceOperatingHoursResponse::from)
                        .toList();

        List<PlaceMenuResponse> menus = placeMenuRepository.findByPlaceIdOrderById(id).stream()
                .map(PlaceMenuResponse::from)
                .toList();

        PlaceTrendResponse trend = findVisibleTrend(id);
        return PlaceDetailResponse.of(place, operatingHours, menus, trend);
    }

    public List<PlaceTrendSummaryResponse> getTrends(Integer limit) {
        int safeLimit = normalizeTrendLimit(limit);
        List<PlaceTrendResult> results = placeTrendResultRepository.findLatestVisibleResults(
                org.springframework.data.domain.PageRequest.of(0, safeLimit));

        return results.stream()
                .map(result -> PlaceTrendSummaryResponse.of(
                        result.getPlace(),
                        PlaceTrendResponse.from(result)))
                .toList();
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

    private Map<Long, List<String>> filmingContentTypesByPlaceId(List<Long> placeIds) {
        if (placeIds.isEmpty()) {
            return Map.of();
        }

        Map<Long, List<String>> result = new HashMap<>();
        for (PlaceFilmingContentTypeProjection row :
                placeRepository.findFilmingContentTypesByPlaceIds(placeIds)) {
            result.computeIfAbsent(row.getPlaceId(), ignored -> new java.util.ArrayList<>())
                    .add(row.getContentType());
        }
        result.values().forEach(types -> types.sort(
                java.util.Comparator.comparingInt(FILMING_CONTENT_TYPE_ORDER::indexOf)));
        return result;
    }

    private PlaceTrendResponse findVisibleTrend(Long placeId) {
        return placeTrendResultRepository.findFirstVisibleByPlaceId(placeId)
                .map(PlaceTrendResponse::from)
                .orElse(null);
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

    private int normalizeTrendLimit(Integer limit) {
        int safeLimit = limit == null ? DEFAULT_TREND_LIMIT : limit;
        if (safeLimit < MIN_TREND_LIMIT || safeLimit > MAX_TREND_LIMIT) {
            throw new InvalidPlaceTrendLimitException();
        }
        return safeLimit;
    }

    private String normalizeFilter(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().replaceAll("\\s*,\\s*", ",");
    }

    private String normalizeFilmingContentType(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!FILMING_CONTENT_TYPES.contains(normalized)) {
            throw new InvalidFilmingContentTypeException();
        }
        return normalized;
    }
}
