package com.ddemachim.server.domain.place.service;

import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.placesearch.dto.KakaoPlaceSearchResponse;
import com.ddemachim.server.domain.placesearch.exception.PlaceSearchException;
import com.ddemachim.server.domain.placesearch.service.PlaceSearchService;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.locationtech.jts.geom.Point;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/** Resolves a named landmark before finding only saved places around its coordinates. */
@Service
public class AiPlaceReferenceSearchService {

    private static final int REFERENCE_CANDIDATE_LIMIT = 10;

    private final PlaceRepository placeRepository;
    private final PlaceSearchService placeSearchService;
    private final AiPlaceSearchService aiPlaceSearchService;

    public AiPlaceReferenceSearchService(
            PlaceRepository placeRepository,
            PlaceSearchService placeSearchService,
            AiPlaceSearchService aiPlaceSearchService) {
        this.placeRepository = placeRepository;
        this.placeSearchService = placeSearchService;
        this.aiPlaceSearchService = aiPlaceSearchService;
    }

    public NearReferenceResult search(NearReferenceCondition condition) {
        String referenceName = normalizedReference(condition.reference());
        ReferencePlace reference = resolveSaved(referenceName);
        if (reference == null) reference = resolveKakao(referenceName);
        if (reference == null) {
            return new NearReferenceResult(null, new AiPlaceSearchService.NearbyResult(List.of()));
        }
        AiPlaceSearchService.NearbyResult places = aiPlaceSearchService.searchNearby(
                new AiPlaceSearchService.NearbyCondition(
                        reference.latitude(), reference.longitude(), condition.category(), condition.radiusMeters(),
                        condition.query(), condition.openNow(), condition.limit(), condition.at()));
        return new NearReferenceResult(reference, places);
    }

    private ReferencePlace resolveSaved(String referenceName) {
        ReferencePlace exact = placeRepository
                .findFirstByNameIgnoreCaseAndLocationIsNotNullOrderByIdAsc(referenceName)
                .map(this::toSavedReference)
                .orElse(null);
        if (exact != null) {
            return exact;
        }
        String normalizedReferenceName = normalize(referenceName);
        return placeRepository.searchForAi(referenceName, null, null, REFERENCE_CANDIDATE_LIMIT).stream()
                .filter(place -> place.getLocation() != null
                        && normalize(place.getName()).contains(normalizedReferenceName))
                .min(Comparator.comparingInt((Place place) -> exactNameScore(place, referenceName))
                        .thenComparing(Place::getId, Comparator.nullsLast(Long::compareTo)))
                .map(this::toSavedReference)
                .orElse(null);
    }

    private ReferencePlace resolveKakao(String referenceName) {
        try {
            return placeSearchService.searchKakaoPlaces(referenceName, null, null, null).stream()
                    .filter(place -> validCoordinates(place.latitude(), place.longitude()))
                    .findFirst()
                    .map(this::toKakaoReference)
                    .orElse(null);
        } catch (PlaceSearchException ignored) {
            return null;
        }
    }

    private ReferencePlace toSavedReference(Place place) {
        Point point = place.getLocation();
        return new ReferencePlace(place.getName(), "DDEMACHIM", place.getRoadAddress(), point.getY(), point.getX());
    }

    private ReferencePlace toKakaoReference(KakaoPlaceSearchResponse place) {
        String address = StringUtils.hasText(place.roadAddress()) ? place.roadAddress() : place.lotAddress();
        return new ReferencePlace(place.name(), "KAKAO", address, place.latitude(), place.longitude());
    }

    private static int exactNameScore(Place place, String referenceName) {
        return referenceName.equals(normalize(place.getName())) ? 0 : 1;
    }

    private static boolean validCoordinates(Double latitude, Double longitude) {
        return latitude != null && longitude != null && Double.isFinite(latitude) && Double.isFinite(longitude);
    }

    private static String normalizedReference(String reference) {
        if (!StringUtils.hasText(reference)) throw new IllegalArgumentException("reference is required");
        return reference.trim();
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    public record NearReferenceCondition(String reference, String category, Integer radiusMeters, String query,
                                         Boolean openNow, Integer limit, OffsetDateTime at) {}
    public record NearReferenceResult(ReferencePlace reference, AiPlaceSearchService.NearbyResult places) {}
    public record ReferencePlace(String name, String source, String address, Double latitude, Double longitude) {}
}
