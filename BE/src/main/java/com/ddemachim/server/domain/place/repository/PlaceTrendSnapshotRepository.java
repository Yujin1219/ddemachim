package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.PlaceTrendSnapshot;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PlaceTrendSnapshotRepository extends JpaRepository<PlaceTrendSnapshot, Long> {

    @Query(
            """
            select snapshot
            from PlaceTrendSnapshot snapshot
            join fetch snapshot.place place
            left join fetch place.category
            where snapshot.status in (
                com.ddemachim.server.domain.place.enums.PlaceTrendStatus.TRENDING,
                com.ddemachim.server.domain.place.enums.PlaceTrendStatus.WATCH
            )
            and snapshot.snapshotDate = (
                select max(latest.snapshotDate)
                from PlaceTrendSnapshot latest
                where latest.place.id = snapshot.place.id
            )
            order by
                case when snapshot.status = com.ddemachim.server.domain.place.enums.PlaceTrendStatus.TRENDING
                    then 0 else 1 end,
                snapshot.snapshotDate desc,
                snapshot.recentObservedPosts desc,
                snapshot.place.id asc
            """)
    List<PlaceTrendSnapshot> findLatestVisibleSnapshots(Pageable pageable);

    Optional<PlaceTrendSnapshot> findFirstByPlaceIdOrderBySnapshotDateDesc(Long placeId);
}
