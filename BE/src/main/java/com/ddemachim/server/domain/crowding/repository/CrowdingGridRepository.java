package com.ddemachim.server.domain.crowding.repository;

import com.ddemachim.server.domain.crowding.entity.CrowdingGrid;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrowdingGridRepository extends JpaRepository<CrowdingGrid, Long> {

    @Query(
            value =
                    """
                    select cg.*
                    from crowding_grid cg
                    where ST_Intersects(
                        cg.geometry,
                        ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326)
                    )
                    order by cg.grid_code
                    limit :limit
                    """,
            nativeQuery = true)
    List<CrowdingGrid> findIntersectingBounds(
            @Param("minLat") double minLat,
            @Param("maxLat") double maxLat,
            @Param("minLng") double minLng,
            @Param("maxLng") double maxLng,
            @Param("limit") int limit);
}
