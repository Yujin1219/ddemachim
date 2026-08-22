package com.ddemachim.server.domain.place.service;

import com.ddemachim.server.domain.crowding.dto.CrowdingRequest;
import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.service.CrowdingService;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceOperatingHours;
import com.ddemachim.server.domain.place.repository.NearbyPlaceDistanceProjection;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.domain.route.service.CourseRouteProviderClient;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Transactional(readOnly = true)
public class AiPlaceSearchService {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final int MAX_LIMIT = 20;
    private static final int MAX_RADIUS_METERS = 10_000;
    private static final Map<String, String> CATEGORY_ALIASES = Map.ofEntries(
            Map.entry("촬영지", "FILMING_LOCATION"),
            Map.entry("FILMING", "FILMING_LOCATION"),
            Map.entry("FILMING_LOCATION", "FILMING_LOCATION"),
            Map.entry("요즘 유행하는 곳", "BLOG_TREND"),
            Map.entry("요즘 핫한 곳", "BLOG_TREND"),
            Map.entry("요즘 뜨는 곳", "BLOG_TREND"),
            Map.entry("요즘 갈만한 곳", "BLOG_TREND"),
            Map.entry("핫플", "BLOG_TREND"),
            Map.entry("HOT", "BLOG_TREND"),
            Map.entry("BLOG_TREND", "BLOG_TREND"),
            Map.entry("전시", "EXHIBITION"),
            Map.entry("행사", "POPUP"),
            Map.entry("음식점", "RESTAURANT"),
            Map.entry("맛집", "RESTAURANT"),
            Map.entry("카페", "CAFE"));
    private final PlaceRepository placeRepository;
    private final PlaceOperatingHoursRepository hoursRepository;
    private final CrowdingService crowdingService;
    private final CourseRouteProviderClient routeProviderClient;
    private final Clock clock;

    @Autowired
    public AiPlaceSearchService(
            PlaceRepository placeRepository,
            PlaceOperatingHoursRepository hoursRepository,
            CrowdingService crowdingService,
            CourseRouteProviderClient routeProviderClient) {
        this(placeRepository, hoursRepository, crowdingService, routeProviderClient, Clock.system(SEOUL));
    }

    AiPlaceSearchService(
            PlaceRepository placeRepository,
            PlaceOperatingHoursRepository hoursRepository,
            CrowdingService crowdingService,
            CourseRouteProviderClient routeProviderClient,
            Clock clock) {
        this.placeRepository = placeRepository;
        this.hoursRepository = hoursRepository;
        this.crowdingService = crowdingService;
        this.routeProviderClient = routeProviderClient;
        this.clock = clock;
    }

    public SearchResult search(SearchCondition condition) {
        Objects.requireNonNull(condition, "condition");
        int limit = safeLimit(condition.limit());
        LocalDate visitDate = condition.visitDate() == null ? LocalDate.now(clock) : condition.visitDate();
        String categoryFilter = categories(condition.query(), condition.categories());
        List<Place> places = placeRepository.searchForAi(
                repositoryQuery(condition.query()), catalogArea(condition.area()), categoryFilter, limit);
        Map<Long, PlaceOperatingHours> hours = hours(places, visitDate);
        return new SearchResult(places.stream().map(place -> toSearchPlace(place, hours.get(place.getId()))).toList());
    }

    public NearbyResult searchNearby(NearbyCondition condition) {
        validateCoordinates(condition.latitude(), condition.longitude());
        int radius = condition.radiusMeters() == null ? 1_000
                : Math.max(50, Math.min(MAX_RADIUS_METERS, condition.radiusMeters()));
        int limit = safeLimit(condition.limit());
        OffsetDateTime at = condition.at() == null ? OffsetDateTime.now(clock) : condition.at();
        String categoryFilter = category(condition.category());
        if (categoryFilter == null) categoryFilter = categoryFromQuery(condition.query());
        List<NearbyPlaceDistanceProjection> rows = placeRepository.findNearbyForAi(
                condition.latitude(), condition.longitude(), categoryFilter,
                blankToNull(condition.query()), radius, Math.min(MAX_LIMIT, limit * 2));
        Map<Long, Place> places = new HashMap<>();
        placeRepository.findAllById(rows.stream().map(NearbyPlaceDistanceProjection::getPlaceId).toList())
                .forEach(place -> places.put(place.getId(), place));
        Map<Long, PlaceOperatingHours> hours = hours(new ArrayList<>(places.values()), at.toLocalDate());
        Map<Long, CrowdingResponse.Point> crowding = crowding(rows, places, at);
        Coordinate origin = new Coordinate(condition.latitude(), condition.longitude());

        List<NearbyPlace> result = rows.stream()
                .map(row -> toNearbyPlace(row, places.get(row.getPlaceId()), hours.get(row.getPlaceId()),
                        crowding.get(row.getPlaceId()), origin, at.toLocalTime()))
                .filter(Objects::nonNull)
                .filter(place -> !Boolean.TRUE.equals(condition.openNow()) || Boolean.TRUE.equals(place.open()))
                .sorted(Comparator.comparingInt((NearbyPlace place) -> rank(place, condition.query()))
                        .thenComparingInt(NearbyPlace::walkingMinutes)
                        .thenComparingLong(NearbyPlace::placeId))
                .limit(limit)
                .toList();
        return new NearbyResult(result);
    }

    private Map<Long, CrowdingResponse.Point> crowding(
            List<NearbyPlaceDistanceProjection> rows, Map<Long, Place> places, OffsetDateTime at) {
        List<CrowdingRequest.Point> points = rows.stream().map(row -> places.get(row.getPlaceId()))
                .filter(Objects::nonNull).filter(place -> place.getLocation() != null)
                .map(place -> new CrowdingRequest.Point("place:" + place.getId(),
                        place.getLocation().getY(), place.getLocation().getX()))
                .toList();
        if (points.isEmpty()) return Map.of();
        try {
            Map<Long, CrowdingResponse.Point> result = new HashMap<>();
            for (CrowdingResponse.Point point : crowdingService.getPointCrowding(new CrowdingRequest.Points(at, points))) {
                if (point.referenceId() != null && point.referenceId().startsWith("place:")) {
                    result.put(Long.valueOf(point.referenceId().substring(6)), point);
                }
            }
            return result;
        } catch (RuntimeException ignored) {
            return Map.of();
        }
    }

    private NearbyPlace toNearbyPlace(
            NearbyPlaceDistanceProjection row, Place place, PlaceOperatingHours hours,
            CrowdingResponse.Point crowding, Coordinate origin, LocalTime at) {
        if (place == null || place.getLocation() == null) return null;
        int distance = (int) Math.round(row.getDistanceMeters() == null ? 0 : row.getDistanceMeters());
        int walkingMinutes = walkingMinutes(origin,
                new Coordinate(place.getLocation().getY(), place.getLocation().getX()), distance);
        return new NearbyPlace(
                place.getId(), place.getName(), category(place), distance, walkingMinutes,
                isOpen(hours, at), crowding == null || crowding.level() == null ? null : crowding.level().name(),
                place.getLocation().getY(), place.getLocation().getX(), safeTags(place));
    }

    private int walkingMinutes(Coordinate origin, Coordinate destination, int distanceMeters) {
        try {
            RouteOption route = routeProviderClient.findWalking(origin, destination);
            if (route != null && route.durationSeconds() != null && route.durationSeconds() > 0) {
                return Math.max(1, (int) Math.ceil(route.durationSeconds() / 60.0));
            }
        } catch (RouteProviderException ignored) {
            // PostGIS distance remains a deterministic fallback when a route provider is unavailable.
        }
        return Math.max(1, (int) Math.ceil(distanceMeters / 80.0));
    }

    private static int rank(NearbyPlace place, String query) {
        int score = Boolean.TRUE.equals(place.open()) ? 0 : 30;
        if ("LOW".equals(place.congestion()) || "RELAXED".equals(place.congestion())) score -= 10;
        if (StringUtils.hasText(query) && (place.name().contains(query)
                || place.tags().stream().anyMatch(tag -> tag.contains(query)))) score -= 10;
        return score;
    }

    private SearchPlace toSearchPlace(Place place, PlaceOperatingHours hours) {
        Point point = place.getLocation();
        return new SearchPlace(place.getId(), place.getName(), category(place),
                point == null ? null : point.getY(), point == null ? null : point.getX(),
                hours == null || hours.isClosed() ? null : hours.getOpenTime(),
                hours == null || hours.isClosed() ? null : hours.getCloseTime(),
                place.getDefaultDwellMinutes(), safeTags(place));
    }

    private Map<Long, PlaceOperatingHours> hours(List<Place> places, LocalDate date) {
        List<Long> ids = places.stream().map(Place::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) return Map.of();
        short day = (short) (date.getDayOfWeek().getValue() - 1);
        Map<Long, PlaceOperatingHours> result = new LinkedHashMap<>();
        hoursRepository.findByPlaceIdInAndDayOfWeek(ids, day)
                .forEach(hours -> result.put(hours.getPlace().getId(), hours));
        return result;
    }

    private static Boolean isOpen(PlaceOperatingHours hours, LocalTime at) {
        if (hours == null) return null;
        if (hours.isClosed()) return false;
        if (hours.getOpenTime() == null || hours.getCloseTime() == null) return true;
        return !at.isBefore(hours.getOpenTime()) && !at.isAfter(hours.getCloseTime());
    }

    private static String category(Place place) {
        return place.getCategory() == null ? null : place.getCategory().getCode();
    }

    private static List<String> safeTags(Place place) {
        return place.getTags() == null ? List.of() : List.of(place.getTags());
    }

    private static String categories(String query, List<String> requestedCategories) {
        LinkedHashSet<String> values = new LinkedHashSet<>();
        if (requestedCategories != null) {
            requestedCategories.stream().filter(StringUtils::hasText)
                    .map(AiPlaceSearchService::category).filter(StringUtils::hasText).forEach(values::add);
        }
        if (values.isEmpty()) {
            String inferred = categoryFromQuery(query);
            if (inferred != null) values.add(inferred);
        }
        return values.isEmpty() ? null : String.join(",", values);
    }

    private static String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : null;
    }

    private static String category(String value) {
        String normalized = normalize(value);
        return normalized == null ? null : CATEGORY_ALIASES.getOrDefault(normalized, normalized);
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String catalogArea(String value) {
        String area = blankToNull(value);
        if (area == null || !area.endsWith("역") || area.length() < 2) {
            return area;
        }
        return area.substring(0, area.length() - 1);
    }

    private static String repositoryQuery(String value) {
        String query = blankToNull(value);
        return query != null && query.contains("촬영지") ? "FILMING_LOCATION" : query;
    }

    private static String categoryFromQuery(String value) {
        String normalized = normalize(value);
        if (normalized == null) return null;
        return CATEGORY_ALIASES.entrySet().stream()
                .filter(entry -> normalized.contains(entry.getKey()))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElse(null);
    }

    private static int safeLimit(Integer limit) {
        return limit == null ? 10 : Math.max(1, Math.min(MAX_LIMIT, limit));
    }

    private static void validateCoordinates(Double latitude, Double longitude) {
        if (latitude == null || longitude == null || !Double.isFinite(latitude) || !Double.isFinite(longitude)
                || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new IllegalArgumentException("valid latitude and longitude are required");
        }
    }

    public record SearchCondition(String query, String area, List<String> categories, LocalDate visitDate, Integer limit) {}
    public record SearchResult(List<SearchPlace> places) {}
    public record SearchPlace(Long placeId, String name, String category, Double latitude, Double longitude,
                              LocalTime openingTime, LocalTime closingTime, Integer recommendedStayMinutes,
                              List<String> tags) {}
    public record NearbyCondition(Double latitude, Double longitude, String category, Integer radiusMeters,
                                  String query, Boolean openNow, Integer limit, OffsetDateTime at) {}
    public record NearbyResult(List<NearbyPlace> places) {}
    public record NearbyPlace(Long placeId, String name, String category, Integer distanceMeters,
                              Integer walkingMinutes, Boolean open, String congestion,
                              Double latitude, Double longitude, List<String> tags) {}
}
