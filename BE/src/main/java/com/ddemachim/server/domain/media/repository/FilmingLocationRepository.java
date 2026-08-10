package com.ddemachim.server.domain.media.repository;

import com.ddemachim.server.domain.media.entity.FilmingLocation;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FilmingLocationRepository extends JpaRepository<FilmingLocation, Long> {

    /** 특정 장소의 촬영지 매칭 목록 (matchStatus 무관 전체). */
    List<FilmingLocation> findByPlaceId(Long placeId);

    /** 특정 장소의 촬영지 매칭 목록 중 matchStatus가 AUTO_MATCH인 것만. */
    List<FilmingLocation> findByPlaceIdAndMatchStatus(Long placeId, String matchStatus);

    /** 특정 작품이 촬영된 장소 목록 (matchStatus 무관 전체). */
    List<FilmingLocation> findByMediaContentId(Long mediaContentId);

    /** 특정 작품이 촬영된 장소 목록 중 matchStatus가 AUTO_MATCH인 것만. */
    List<FilmingLocation> findByMediaContentIdAndMatchStatus(Long mediaContentId, String matchStatus);
}
