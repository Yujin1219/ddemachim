package com.ddemachim.server.domain.media.service;

import com.ddemachim.server.domain.media.dto.FilmingLocationResponse;
import com.ddemachim.server.domain.media.dto.MediaContentDetailResponse;
import com.ddemachim.server.domain.media.dto.MediaContentSummaryResponse;
import com.ddemachim.server.domain.media.entity.MediaContent;
import com.ddemachim.server.domain.media.exception.MediaContentNotFoundException;
import com.ddemachim.server.domain.media.repository.FilmingLocationRepository;
import com.ddemachim.server.domain.media.repository.MediaContentRepository;
import java.util.List;
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
    private final FilmingLocationRepository filmingLocationRepository;

    public Page<MediaContentSummaryResponse> search(Pageable pageable) {
        return mediaContentRepository.findAll(pageable).map(MediaContentSummaryResponse::from);
    }

    public MediaContentDetailResponse getDetail(Long id) {
        MediaContent mediaContent =
                mediaContentRepository.findById(id).orElseThrow(MediaContentNotFoundException::new);
        return MediaContentDetailResponse.from(mediaContent);
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
}
