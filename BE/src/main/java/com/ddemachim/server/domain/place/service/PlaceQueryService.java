package com.ddemachim.server.domain.place.service;

import com.ddemachim.server.domain.place.dto.PlaceDetailResponse;
import com.ddemachim.server.domain.place.dto.PlaceImageResponse;
import com.ddemachim.server.domain.place.dto.PlaceOperatingHoursResponse;
import com.ddemachim.server.domain.place.dto.PlaceSummaryResponse;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceImage;
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

    private final PlaceRepository placeRepository;
    private final PlaceImageRepository placeImageRepository;
    private final PlaceOperatingHoursRepository placeOperatingHoursRepository;

    public Page<PlaceSummaryResponse> search(
            String category, String district, String keyword, Pageable pageable) {
        Page<Place> places = placeRepository.search(category, district, keyword, pageable);

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
}
