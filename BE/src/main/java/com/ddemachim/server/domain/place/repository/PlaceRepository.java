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
            value =
                    """
                    select p.*
                    from place p
                    left join place_category c on p.category_id = c.id
                    where (:category is null or c.code = :category)
                    and (:district is null or p.district = :district)
                    and (:tag is null or :tag = any(p.tags))
                    and (:keyword is null or p.normalized_name like concat('%', cast(:keyword as text), '%'))
                    order by p.id
                    """,
            countQuery =
                    """
                    select count(*)
                    from place p
                    left join place_category c on p.category_id = c.id
                    where (:category is null or c.code = :category)
                    and (:district is null or p.district = :district)
                    and (:tag is null or :tag = any(p.tags))
                    and (:keyword is null or p.normalized_name like concat('%', cast(:keyword as text), '%'))
                    """,
            nativeQuery = true)
    Page<Place> search(
            @Param("category") String category,
            @Param("district") String district,
            @Param("tag") String tag,
            @Param("keyword") String keyword,
            Pageable pageable);

    @Query(
            value =
                    """
                    select p.*
                    from place p
                    left join place_category c on p.category_id = c.id
                    where p.location is not null
                    and (:category is null or c.code = any(string_to_array(:category, ',')))
                    and (:tag is null or :tag = any(p.tags))
                    and ST_Intersects(p.location, ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326))
                    order by p.id
                    limit :limit
                    """,
            nativeQuery = true)
    List<Place> findInBounds(
            @Param("category") String category,
            @Param("tag") String tag,
            @Param("minLat") Double minLat,
            @Param("maxLat") Double maxLat,
            @Param("minLng") Double minLng,
            @Param("maxLng") Double maxLng,
            @Param("limit") int limit);
}
