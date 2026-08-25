package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.PlaceMenu;
import java.util.List;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlaceMenuRepository extends JpaRepository<PlaceMenu, Long> {

    List<PlaceMenu> findByPlaceIdOrderById(Long placeId);

    @Query("""
            select distinct menu.place.id
            from PlaceMenu menu
            where menu.place.id <> :excludedPlaceId
              and menu.place.category.code in :categoryCodes
            order by menu.place.id
            """)
    List<Long> findDistinctPlaceIdsWithMenusByCategoryCodes(
            @Param("categoryCodes") Set<String> categoryCodes,
            @Param("excludedPlaceId") Long excludedPlaceId);
}
