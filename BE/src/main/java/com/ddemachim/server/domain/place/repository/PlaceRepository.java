package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.Place;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlaceRepository extends JpaRepository<Place, Long> {

    @Query(
            "select p from Place p "
                    + "left join p.category c "
                    + "where (:category is null or c.code = :category) "
                    + "and (:district is null or p.district = :district) "
                    + "and (:keyword is null or p.normalizedName like concat('%', cast(:keyword as string), '%')) "
                    + "order by p.id")
    Page<Place> search(
            @Param("category") String category,
            @Param("district") String district,
            @Param("keyword") String keyword,
            Pageable pageable);

    @Query(
            value =
                    """
                    select p.*
                    from place p
                    where p.location is not null
                    and ST_Intersects(p.location, ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326))
                    order by p.id
                    limit :limit
                    """,
            nativeQuery = true)
    List<Place> findInBounds(
            @Param("minLat") Double minLat,
            @Param("maxLat") Double maxLat,
            @Param("minLng") Double minLng,
            @Param("maxLng") Double maxLng,
            @Param("limit") int limit);
}
