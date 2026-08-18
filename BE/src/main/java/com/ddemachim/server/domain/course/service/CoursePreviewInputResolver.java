package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.repository.CourseBasketItemRepository;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.UserPlace;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.locationtech.jts.geom.Point;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CoursePreviewInputResolver {

    private final CourseBasketItemRepository courseBasketItemRepository;

    @Transactional(readOnly = true)
    public List<ResolvedPlace> resolve(Long memberId, List<CoursePreviewRequest.Place> requestedPlaces) {
        validateRequest(memberId, requestedPlaces);

        List<Long> basketItemIds = requestedPlaces.stream()
                .map(CoursePreviewRequest.Place::basketItemId)
                .toList();
        Map<Long, CourseBasketItem> basketItemsById = courseBasketItemRepository
                .findAllByMemberIdAndIdIn(memberId, basketItemIds)
                .stream()
                .collect(Collectors.toMap(CourseBasketItem::getId, Function.identity()));

        return requestedPlaces.stream()
                .map(requestedPlace -> resolvePlace(requestedPlace, basketItemsById))
                .toList();
    }

    private void validateRequest(Long memberId, List<CoursePreviewRequest.Place> requestedPlaces) {
        if (memberId == null || requestedPlaces == null || requestedPlaces.isEmpty()) {
            throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        }
        boolean invalidPlace = requestedPlaces.stream().anyMatch(place -> place == null
                || place.basketItemId() == null
                || place.dwellMinutes() == null
                || place.dwellMinutes() < 1
                || place.dwellMinutes() > 1440);
        if (invalidPlace) {
            throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        }
    }

    private ResolvedPlace resolvePlace(
            CoursePreviewRequest.Place requestedPlace,
            Map<Long, CourseBasketItem> basketItemsById) {
        CourseBasketItem basketItem = basketItemsById.get(requestedPlace.basketItemId());
        if (basketItem == null) {
            throw new CourseException(CourseErrorStatus.BASKET_ITEM_NOT_FOUND);
        }
        if (basketItem.getPlace() != null && basketItem.getUserPlace() == null) {
            return resolveInternalPlace(basketItem, requestedPlace);
        }
        if (basketItem.getPlace() == null && basketItem.getUserPlace() != null) {
            return resolveUserPlace(basketItem, requestedPlace);
        }
        throw new CourseException(CourseErrorStatus.BASKET_ITEM_NOT_FOUND);
    }

    private ResolvedPlace resolveInternalPlace(
            CourseBasketItem basketItem,
            CoursePreviewRequest.Place requestedPlace) {
        Place place = basketItem.getPlace();
        Point location = place.getLocation();
        if (location == null) {
            throw new CourseException(CourseErrorStatus.PLACE_LOCATION_MISSING);
        }
        return createResolvedPlace(
                basketItem,
                place,
                null,
                place.getName(),
                firstNonBlank(place.getRoadAddress(), place.getLotAddress()),
                location.getY(),
                location.getX(),
                place.getDefaultDwellMinutes(),
                requestedPlace);
    }

    private ResolvedPlace resolveUserPlace(
            CourseBasketItem basketItem,
            CoursePreviewRequest.Place requestedPlace) {
        UserPlace userPlace = basketItem.getUserPlace();
        if (userPlace.getLatitude() == null || userPlace.getLongitude() == null) {
            throw new CourseException(CourseErrorStatus.PLACE_LOCATION_MISSING);
        }
        return createResolvedPlace(
                basketItem,
                null,
                userPlace,
                userPlace.getName(),
                firstNonBlank(userPlace.getRoadAddress(), userPlace.getLotAddress()),
                userPlace.getLatitude(),
                userPlace.getLongitude(),
                userPlace.getDefaultDwellMinutes(),
                requestedPlace);
    }

    private ResolvedPlace createResolvedPlace(
            CourseBasketItem basketItem,
            Place place,
            UserPlace userPlace,
            String placeName,
            String address,
            Double latitude,
            Double longitude,
            Integer defaultDwellMinutes,
            CoursePreviewRequest.Place requestedPlace) {
        if (defaultDwellMinutes == null) {
            throw new CourseException(CourseErrorStatus.INVALID_PREVIEW_INPUT);
        }
        CourseDwellSource dwellSource = Objects.equals(defaultDwellMinutes, requestedPlace.dwellMinutes())
                ? CourseDwellSource.DEFAULT
                : CourseDwellSource.USER_MODIFIED;
        return new ResolvedPlace(
                basketItem.getId(),
                place,
                userPlace,
                placeName,
                address,
                latitude,
                longitude,
                defaultDwellMinutes,
                requestedPlace.dwellMinutes(),
                dwellSource,
                requestedPlace.arrivalDeadline());
    }

    private String firstNonBlank(String preferred, String fallback) {
        return preferred != null && !preferred.isBlank() ? preferred : fallback;
    }

    public record ResolvedPlace(
            Long basketItemId,
            Place place,
            UserPlace userPlace,
            String placeName,
            String address,
            Double latitude,
            Double longitude,
            Integer defaultDwellMinutes,
            Integer dwellMinutes,
            CourseDwellSource dwellSource,
            LocalTime arrivalDeadline) {
    }
}
