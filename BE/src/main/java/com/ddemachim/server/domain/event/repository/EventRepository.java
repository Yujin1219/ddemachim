package com.ddemachim.server.domain.event.repository;

import com.ddemachim.server.domain.event.entity.Event;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventRepository extends JpaRepository<Event, Long> {

    @Query(
            "select e from Event e "
                    + "where (:keyword is null or e.title like concat('%', cast(:keyword as string), '%')) "
                    + "order by e.startDate asc nulls last, e.id")
    Page<Event> search(@Param("keyword") String keyword, Pageable pageable);
}
