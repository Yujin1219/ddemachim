package com.ddemachim.server.domain.event.repository;

import com.ddemachim.server.domain.event.entity.Event;
import java.time.LocalDate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventRepository extends JpaRepository<Event, Long> {

    @Query(
            """
            select e from Event e
            where (:keyword is null or e.title like concat('%', cast(:keyword as string), '%'))
            and (
                :status is null
                or (
                    :status = 'ONGOING'
                    and e.startDate is not null
                    and e.startDate <= :businessDate
                    and (e.endDate is null or e.endDate >= :businessDate)
                )
                or (
                    :status = 'ENDED'
                    and e.endDate is not null
                    and e.endDate < :businessDate
                )
            )
            order by e.startDate asc nulls last, e.id asc
            """)
    Page<Event> searchByStartDate(
            @Param("keyword") String keyword,
            @Param("status") String status,
            @Param("businessDate") LocalDate businessDate,
            Pageable pageable);

    @Query(
            """
            select e from Event e
            where (:keyword is null or e.title like concat('%', cast(:keyword as string), '%'))
            and (
                :status is null
                or (
                    :status = 'ONGOING'
                    and e.startDate is not null
                    and e.startDate <= :businessDate
                    and (e.endDate is null or e.endDate >= :businessDate)
                )
                or (
                    :status = 'ENDED'
                    and e.endDate is not null
                    and e.endDate < :businessDate
                )
            )
            order by e.applyDate desc nulls last, e.id desc
            """)
    Page<Event> searchByLatestApplyDate(
            @Param("keyword") String keyword,
            @Param("status") String status,
            @Param("businessDate") LocalDate businessDate,
            Pageable pageable);

    @Query(
            value =
                    """
                    select e.*
                    from event e
                    where (:keyword is null or e.title like concat('%', cast(:keyword as text), '%'))
                    and (
                        cast(:status as text) is null
                        or (
                            cast(:status as text) = 'ONGOING'
                            and e.start_date is not null
                            and e.start_date <= :businessDate
                            and (e.end_date is null or e.end_date >= :businessDate)
                        )
                        or (
                            cast(:status as text) = 'ENDED'
                            and e.end_date is not null
                            and e.end_date < :businessDate
                        )
                    )
                    order by
                        case when e.location is null then 1 else 0 end,
                        ST_Distance(
                            cast(e.location as geography),
                            cast(ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326) as geography)
                        ) asc,
                        e.id asc
                    """,
            countQuery =
                    """
                    select count(*)
                    from event e
                    where (:keyword is null or e.title like concat('%', cast(:keyword as text), '%'))
                    and (
                        cast(:status as text) is null
                        or (
                            cast(:status as text) = 'ONGOING'
                            and e.start_date is not null
                            and e.start_date <= :businessDate
                            and (e.end_date is null or e.end_date >= :businessDate)
                        )
                        or (
                            cast(:status as text) = 'ENDED'
                            and e.end_date is not null
                            and e.end_date < :businessDate
                        )
                    )
                    """,
            nativeQuery = true)
    Page<Event> searchByNearestLocation(
            @Param("keyword") String keyword,
            @Param("status") String status,
            @Param("businessDate") LocalDate businessDate,
            @Param("latitude") Double latitude,
            @Param("longitude") Double longitude,
            Pageable pageable);
}
