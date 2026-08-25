package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.PlaceTrendResult;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlaceTrendResultRepository extends JpaRepository<PlaceTrendResult, Long> {

    @Query(
            """
            select result
            from PlaceTrendResult result
            join fetch result.place place
            left join fetch place.category
            join result.run run
            where run.status = com.ddemachim.server.domain.place.enums.BlogTrendRunStatus.SUCCESS
              and run.runWeek = (
                  select max(latestRun.runWeek)
                  from PlaceTrendResult latestResult
                  join latestResult.run latestRun
                  where latestResult.place.id = result.place.id
                    and latestRun.status = com.ddemachim.server.domain.place.enums.BlogTrendRunStatus.SUCCESS
              )
            order by
                case when result.status = com.ddemachim.server.domain.place.enums.PlaceTrendStatus.TRENDING
                    then 0 else 1 end,
                case when result.interestChangePercent is null then 1 else 0 end,
                result.interestChangePercent desc,
                result.measuredAt desc,
                result.place.id asc
            """)
    List<PlaceTrendResult> findLatestStoredResults(Pageable pageable);

    @Query(
            """
            select result
            from PlaceTrendResult result
            join fetch result.place place
            left join fetch place.category
            join result.run run
            where result.place.id = :placeId
              and run.status = com.ddemachim.server.domain.place.enums.BlogTrendRunStatus.SUCCESS
              and result.expiresAt > CURRENT_TIMESTAMP
            order by run.runWeek desc, result.measuredAt desc
            """)
    List<PlaceTrendResult> findVisibleResultsByPlaceId(@Param("placeId") Long placeId, Pageable pageable);

    default Optional<PlaceTrendResult> findFirstVisibleByPlaceId(Long placeId) {
        return findVisibleResultsByPlaceId(placeId, Pageable.ofSize(1)).stream().findFirst();
    }
}
