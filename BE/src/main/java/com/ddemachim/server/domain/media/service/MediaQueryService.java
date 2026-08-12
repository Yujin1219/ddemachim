package com.ddemachim.server.domain.media.service;

import com.ddemachim.server.domain.media.dto.FilmingLocationResponse;
import com.ddemachim.server.domain.media.dto.FilmingWorkSummaryResponse;
import com.ddemachim.server.domain.media.dto.FilmingWorkSummaryResponse.RepresentativePlace;
import com.ddemachim.server.domain.media.dto.MediaContentDetailResponse;
import com.ddemachim.server.domain.media.dto.MediaCreditResponse;
import com.ddemachim.server.domain.media.dto.MediaContentSummaryResponse;
import com.ddemachim.server.domain.media.entity.FilmingLocation;
import com.ddemachim.server.domain.media.entity.MediaContent;
import com.ddemachim.server.domain.media.exception.MediaContentNotFoundException;
import com.ddemachim.server.domain.media.exception.InvalidMediaContentTypeException;
import com.ddemachim.server.domain.media.repository.FilmingLocationRepository;
import com.ddemachim.server.domain.media.repository.MediaCreditRepository;
import com.ddemachim.server.domain.media.repository.MediaContentRepository;
import com.ddemachim.server.domain.place.entity.PlaceImage;
import com.ddemachim.server.domain.place.repository.PlaceImageRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
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
public class MediaQueryService {

    /**
     * REVIEW_REQUIRED는 아직 확정되지 않은 매칭(제목 유사도 기반 후보)이라, 일반 공개 조회 API에서
     * 노출하면 사용자에게 오매칭된 촬영지 정보를 보여줄 위험이 있다. 그래서 공개 조회 API는
     * matchStatus='AUTO_MATCH'인 것만 필터링해서 내려준다. (검수 화면 등 REVIEW_REQUIRED까지
     * 봐야 하는 별도 관리용 API는 이번 스코프에 포함하지 않음)
     */
    private static final String PUBLIC_MATCH_STATUS = "AUTO_MATCH";

    private final MediaContentRepository mediaContentRepository;
    private final MediaCreditRepository mediaCreditRepository;
    private final FilmingLocationRepository filmingLocationRepository;
    private final PlaceImageRepository placeImageRepository;

    public Page<MediaContentSummaryResponse> search(Pageable pageable) {
        return mediaContentRepository.findAll(pageable).map(MediaContentSummaryResponse::from);
    }

    public MediaContentDetailResponse getDetail(Long id) {
        MediaContent mediaContent =
                mediaContentRepository.findById(id).orElseThrow(MediaContentNotFoundException::new);
        List<MediaCreditResponse> credits = mediaCreditRepository
                .findByMediaContentIdWithPersonOrderByRoleAndCastOrder(mediaContent.getId())
                .stream()
                .map(MediaCreditResponse::from)
                .toList();
        return MediaContentDetailResponse.from(mediaContent, credits);
    }

    public Page<FilmingWorkSummaryResponse> getFilmingWorks(String contentType, Pageable pageable) {
        String normalizedContentType = normalizeContentType(contentType);
        Page<MediaContent> mediaPage = mediaContentRepository.findFilmingWorks(
                PUBLIC_MATCH_STATUS, normalizedContentType, pageable);
        if (mediaPage.isEmpty()) {
            return mediaPage.map(mediaContent -> FilmingWorkSummaryResponse.of(mediaContent, List.of(), 0, List.of()));
        }

        List<Long> mediaIds = mediaPage.getContent().stream().map(MediaContent::getId).toList();
        List<FilmingLocation> filmingRows = filmingLocationRepository.findPublicRowsForWorks(
                mediaIds, PUBLIC_MATCH_STATUS, normalizedContentType);

        Map<Long, List<FilmingLocation>> rowsByMediaId = new LinkedHashMap<>();
        Set<Long> placeIds = new LinkedHashSet<>();
        for (FilmingLocation row : filmingRows) {
            rowsByMediaId.computeIfAbsent(row.getMediaContent().getId(), ignored -> new ArrayList<>()).add(row);
            placeIds.add(row.getPlace().getId());
        }

        Map<Long, String> thumbnailByPlaceId = new LinkedHashMap<>();
        if (!placeIds.isEmpty()) {
            for (PlaceImage image : placeImageRepository.findByPlaceIdInOrderByPlaceIdAscIdAsc(List.copyOf(placeIds))) {
                thumbnailByPlaceId.putIfAbsent(image.getPlace().getId(), image.getSourceUrl());
            }
        }

        return mediaPage.map(mediaContent -> toFilmingWorkSummary(
                mediaContent,
                rowsByMediaId.getOrDefault(mediaContent.getId(), List.of()),
                thumbnailByPlaceId));
    }

    public List<FilmingLocationResponse> getFilmingLocationsByPlace(Long placeId) {
        return filmingLocationRepository
                .findByPlaceIdAndMatchStatus(placeId, PUBLIC_MATCH_STATUS)
                .stream()
                .map(FilmingLocationResponse::from)
                .toList();
    }

    public List<FilmingLocationResponse> getFilmingLocationsByMediaContent(Long mediaContentId) {
        return filmingLocationRepository
                .findByMediaContentIdAndMatchStatus(mediaContentId, PUBLIC_MATCH_STATUS)
                .stream()
                .map(FilmingLocationResponse::from)
                .toList();
    }

    private FilmingWorkSummaryResponse toFilmingWorkSummary(
            MediaContent mediaContent,
            List<FilmingLocation> rows,
            Map<Long, String> thumbnailByPlaceId) {
        List<String> contentTypes = rows.stream()
                .map(FilmingLocation::getContentType)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .toList();

        Map<Long, RepresentativePlace> distinctPlaces = new LinkedHashMap<>();
        for (FilmingLocation row : rows) {
            Long placeId = row.getPlace().getId();
            distinctPlaces.putIfAbsent(
                    placeId,
                    new RepresentativePlace(placeId, row.getPlace().getName(), thumbnailByPlaceId.get(placeId)));
        }

        return FilmingWorkSummaryResponse.of(
                mediaContent,
                contentTypes,
                distinctPlaces.size(),
                distinctPlaces.values().stream().limit(2).toList());
    }

    private String normalizeContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return null;
        }
        String normalized = contentType.trim().toUpperCase();
        if (!Set.of("DRAMA", "VARIETY", "MOVIE").contains(normalized)) {
            throw new InvalidMediaContentTypeException();
        }
        return normalized;
    }
}
