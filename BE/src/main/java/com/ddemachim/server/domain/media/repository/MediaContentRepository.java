package com.ddemachim.server.domain.media.repository;

import com.ddemachim.server.domain.media.entity.MediaContent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaContentRepository extends JpaRepository<MediaContent, Long> {

    @Query(
            value = """
                    select media
                    from MediaContent media
                    where exists (
                        select filming.id
                        from FilmingLocation filming
                        join filming.place place
                        where filming.mediaContent = media
                          and filming.matchStatus = :matchStatus
                          and (:contentType is null or filming.contentType = :contentType)
                    )
                    order by case when media.posterPath is null or media.posterPath = '' then 1 else 0 end,
                             media.releaseDate desc nulls last,
                             media.id desc
                    """,
            countQuery = """
                    select count(media.id)
                    from MediaContent media
                    where exists (
                        select filming.id
                        from FilmingLocation filming
                        join filming.place place
                        where filming.mediaContent = media
                          and filming.matchStatus = :matchStatus
                          and (:contentType is null or filming.contentType = :contentType)
                    )
                    """)
    Page<MediaContent> findFilmingWorks(
            @Param("matchStatus") String matchStatus,
            @Param("contentType") String contentType,
            Pageable pageable);
}
