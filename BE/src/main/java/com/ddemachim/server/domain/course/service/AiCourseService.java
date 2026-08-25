package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import com.ddemachim.server.domain.course.dto.AiCourseResponse;
import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.service.CoursePreviewInputResolver.ResolvedPlace;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceOperatingHours;
import com.ddemachim.server.domain.place.repository.PlaceOperatingHoursRepository;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.locationtech.jts.geom.Point;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stateless AI-only course input adapter. It never reads or writes a course basket. */
@Service
public class AiCourseService {

    private static final LocalTime FALLBACK_OPEN = LocalTime.of(9, 0);
    private static final LocalTime FALLBACK_CLOSE = LocalTime.of(22, 0);
    private final PlaceRepository placeRepository;
    private final PlaceOperatingHoursRepository hoursRepository;
    private final CoursePreviewService coursePlanner;

    public AiCourseService(
            PlaceRepository placeRepository,
            PlaceOperatingHoursRepository hoursRepository,
            CoursePreviewService coursePlanner) {
        this.placeRepository = placeRepository;
        this.hoursRepository = hoursRepository;
        this.coursePlanner = coursePlanner;
    }

    @Transactional(readOnly = true)
    public AiCourseResponse create(AiCourseRequest request) {
        validate(request);
        List<Long> requiredIds = distinct(request.requiredPlaceIds());
        List<Long> candidateIds = distinct(request.candidatePlaceIds()).stream()
                .filter(id -> !requiredIds.contains(id)).toList();
        Set<Long> requestedIds = new LinkedHashSet<>(requiredIds);
        requestedIds.addAll(candidateIds);
        Map<Long, Place> places = loadPlaces(requestedIds);
        Map<Long, PlaceOperatingHours> hours = loadHours(new ArrayList<>(requestedIds), request);

        List<Long> selectedIds = selectPlaces(request, requiredIds, candidateIds, places, hours);
        List<ResolvedPlace> resolved = selectedIds.stream()
                .map(id -> resolve(places.get(id), hours.get(id)))
                .toList();
        CoursePreviewRequest plannerRequest = new CoursePreviewRequest(
                request.date(), request.startTime(),
                new CoursePreviewRequest.Start(CourseStartType.CURRENT_LOCATION,
                        request.startLocation().name(), request.startLocation().latitude(),
                        request.startLocation().longitude()),
                selectedIds.stream().map(id -> new CoursePreviewRequest.Place(id,
                        places.get(id).getDefaultDwellMinutes(), null)).toList(),
                request.availableMinutes());
        CoursePreviewResponse preview = coursePlanner.previewResolved(plannerRequest, resolved);
        CoursePreviewResponse.Option option = selectOption(preview, request.routePreference());
        List<Long> excluded = candidateIds.stream().filter(id -> !selectedIds.contains(id)).toList();
        List<AiCourseResponse.Stop> stops = option.stops().stream().map(stop -> new AiCourseResponse.Stop(
                stop.sequenceNo(), stop.placeId(), stop.placeName(), stop.scheduledArrival(),
                stop.scheduledDeparture(), stop.dwellMinutes(), stop.travelMinutesFromPrevious(),
                stop.travelDistanceMeters(), stop.congestionScore(), stop.ascentMeters(), stop.selectedMode())).toList();
        return new AiCourseResponse(request.date(), request.startTime(), option.scheduledEnd(),
                option.totalDurationMinutes(), option.totalTravelMinutes(), option.strategy(),
                requiredIds, excluded, stops, preview);
    }

    private List<Long> selectPlaces(
            AiCourseRequest request, List<Long> requiredIds, List<Long> candidateIds,
            Map<Long, Place> places, Map<Long, PlaceOperatingHours> hours) {
        List<Long> selected = new ArrayList<>(requiredIds);
        int usedMinutes = requiredIds.stream().map(places::get).mapToInt(Place::getDefaultDwellMinutes).sum();
        double latitude = request.startLocation().latitude();
        double longitude = request.startLocation().longitude();
        List<Long> remaining = new ArrayList<>(candidateIds);
        boolean filmingCourse = isFilmingCourse(candidateIds, places);
        while (!remaining.isEmpty()) {
            double currentLatitude = latitude;
            double currentLongitude = longitude;
            Map<String, Long> selectedCategoryCounts = selected.stream()
                    .map(places::get)
                    .filter(Objects::nonNull)
                    .collect(java.util.stream.Collectors.groupingBy(
                            AiCourseService::categoryCode, java.util.stream.Collectors.counting()));
            Comparator<Long> selectionOrder = filmingCourse
                    ? Comparator
                            .comparingLong((Long id) -> selectedCategoryCounts.getOrDefault(
                                    categoryCode(places.get(id)), 0L))
                            .thenComparingInt(id -> filmingCategoryPriority(categoryCode(places.get(id))))
                            .thenComparingDouble(id -> distance(currentLatitude, currentLongitude, places.get(id)))
                    : Comparator.comparingDouble(
                            id -> distance(currentLatitude, currentLongitude, places.get(id)));
            Long next = remaining.stream().filter(id -> !isClosed(hours.get(id)))
                    .min(selectionOrder)
                    .orElse(null);
            if (next == null) break;
            Place place = places.get(next);
            int estimate = place.getDefaultDwellMinutes()
                    + Math.max(5, (int) Math.ceil(distance(latitude, longitude, place) / 80.0));
            if (usedMinutes + estimate <= request.availableMinutes()) {
                selected.add(next);
                usedMinutes += estimate;
                latitude = place.getLocation().getY();
                longitude = place.getLocation().getX();
            }
            remaining.remove(next);
        }
        if (selected.isEmpty()) throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        return List.copyOf(selected);
    }

    private static boolean isFilmingCourse(List<Long> candidateIds, Map<Long, Place> places) {
        return candidateIds.size() > 1 && candidateIds.stream()
                .map(places::get)
                .filter(Objects::nonNull)
                .allMatch(AiCourseService::hasFilmingTag);
    }

    private static boolean hasFilmingTag(Place place) {
        return place.getTags() != null && Arrays.asList(place.getTags()).contains("FILMING_LOCATION");
    }

    private static String categoryCode(Place place) {
        return place != null && place.getCategory() != null && place.getCategory().getCode() != null
                ? place.getCategory().getCode() : "ETC";
    }

    private static int filmingCategoryPriority(String category) {
        return switch (category) {
            case "ETC", "ATTRACTION", "CULTURE", "PHOTO_SPOT" -> 0;
            case "SHOPPING" -> 1;
            case "CAFE" -> 2;
            case "RESTAURANT" -> 3;
            default -> 1;
        };
    }

    private Map<Long, Place> loadPlaces(Set<Long> ids) {
        Map<Long, Place> result = new HashMap<>();
        placeRepository.findAllById(ids).forEach(place -> result.put(place.getId(), place));
        if (result.size() != ids.size() || result.values().stream().anyMatch(place -> place.getLocation() == null)) {
            throw new CourseException(CourseErrorStatus.PLACE_LOCATION_MISSING);
        }
        return result;
    }

    private Map<Long, PlaceOperatingHours> loadHours(List<Long> ids, AiCourseRequest request) {
        short day = (short) (request.date().getDayOfWeek().getValue() - 1);
        Map<Long, PlaceOperatingHours> result = new HashMap<>();
        hoursRepository.findByPlaceIdInAndDayOfWeek(ids, day)
                .forEach(hours -> result.put(hours.getPlace().getId(), hours));
        return result;
    }

    private ResolvedPlace resolve(Place place, PlaceOperatingHours hours) {
        boolean closed = isClosed(hours);
        LocalTime open = hours == null || hours.getOpenTime() == null ? FALLBACK_OPEN : hours.getOpenTime();
        LocalTime close = hours == null || hours.getCloseTime() == null ? FALLBACK_CLOSE : hours.getCloseTime();
        Point point = place.getLocation();
        return new ResolvedPlace(null, place, null, place.getName(),
                firstNonBlank(place.getRoadAddress(), place.getLotAddress()), point.getY(), point.getX(),
                place.getDefaultDwellMinutes(), place.getDefaultDwellMinutes(), CourseDwellSource.DEFAULT,
                null, hours == null ? CourseHoursSourceType.DEMO_DEFAULT : CourseHoursSourceType.REAL,
                closed ? null : open, closed ? null : close, closed, place.getId());
    }

    private static CoursePreviewResponse.Option selectOption(
            CoursePreviewResponse preview, AiCourseRequest.RoutePreference preference) {
        CourseRouteStrategy desired = preference == AiCourseRequest.RoutePreference.COMFORT
                ? CourseRouteStrategy.EASY : CourseRouteStrategy.FAST;
        return preview.options().stream().filter(option -> option.strategy() == desired).findFirst()
                .or(() -> preview.options().stream().filter(option -> option.strategy() == CourseRouteStrategy.FAST).findFirst())
                .orElseThrow(() -> new CourseException(CourseErrorStatus.FAST_PLAN_UNAVAILABLE));
    }

    private static void validate(AiCourseRequest request) {
        if (request == null || request.date() == null || request.startTime() == null
                || request.startLocation() == null || request.availableMinutes() == null
                || request.availableMinutes() < 30 || request.availableMinutes() > 1440
                || request.startLocation().latitude() == null || request.startLocation().longitude() == null
                || !Double.isFinite(request.startLocation().latitude())
                || !Double.isFinite(request.startLocation().longitude())
                || request.startLocation().latitude() < -90 || request.startLocation().latitude() > 90
                || request.startLocation().longitude() < -180 || request.startLocation().longitude() > 180
                || (distinct(request.requiredPlaceIds()).isEmpty()
                && distinct(request.candidatePlaceIds()).isEmpty())) {
            throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        }
    }

    private static List<Long> distinct(List<Long> ids) {
        if (ids == null) return List.of();
        Set<Long> result = new LinkedHashSet<>();
        for (Long id : ids) if (id != null && id > 0) result.add(id);
        return List.copyOf(result);
    }

    private static boolean isClosed(PlaceOperatingHours hours) {
        return hours != null && hours.isClosed();
    }

    private static double distance(double latitude, double longitude, Place place) {
        Point point = Objects.requireNonNull(place.getLocation());
        double latRadians = Math.toRadians(point.getY() - latitude);
        double lonRadians = Math.toRadians(point.getX() - longitude);
        double a = Math.sin(latRadians / 2) * Math.sin(latRadians / 2)
                + Math.cos(Math.toRadians(latitude)) * Math.cos(Math.toRadians(point.getY()))
                * Math.sin(lonRadians / 2) * Math.sin(lonRadians / 2);
        return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private static String firstNonBlank(String first, String second) {
        return first != null && !first.isBlank() ? first : second;
    }
}
