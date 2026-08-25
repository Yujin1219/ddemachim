package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.Place;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlaceRepository extends JpaRepository<Place, Long> {

    Optional<Place> findFirstByNameIgnoreCaseAndLocationIsNotNullOrderByIdAsc(String name);

    @Query(
            """
            select distinct fl.place.id as placeId, fl.contentType as contentType
            from FilmingLocation fl
            where fl.place.id in :placeIds
            and fl.contentType is not null
            """)
    List<PlaceFilmingContentTypeProjection> findFilmingContentTypesByPlaceIds(
            @Param("placeIds") List<Long> placeIds);

    @Query(
            value =
                    """
                    select p.*
                    from place p
                    left join place_category c on p.category_id = c.id
                    where (:category is null or c.code = any(string_to_array(:category, ',')))
                    and (:district is null or p.district = :district)
                    and (:tag is null or :tag = any(p.tags))
                    and (:filmingContentType is null or exists (
                        select 1 from filming_location fl
                        where fl.place_id = p.id
                        and fl.content_type = :filmingContentType
                    ))
                    and (:keyword is null or p.normalized_name like concat('%', cast(:keyword as text), '%'))
                    order by
                        case
                            when :tag = 'FILMING_LOCATION'
                                and p.image_url is not null
                                and exists (
                                    select 1 from place_menu pm
                                    where pm.place_id = p.id
                                )
                            then 0
                            when :tag = 'FILMING_LOCATION'
                                and p.image_url is not null
                            then 1
                            when :tag = 'FILMING_LOCATION'
                                and exists (
                                    select 1 from place_menu pm
                                    where pm.place_id = p.id
                                )
                            then 2
                            else 3
                        end,
                        p.id
                    """,
            countQuery =
                    """
                    select count(*)
                    from place p
                    left join place_category c on p.category_id = c.id
                    where (:category is null or c.code = any(string_to_array(:category, ',')))
                    and (:district is null or p.district = :district)
                    and (:tag is null or :tag = any(p.tags))
                    and (:filmingContentType is null or exists (
                        select 1 from filming_location fl
                        where fl.place_id = p.id
                        and fl.content_type = :filmingContentType
                    ))
                    and (:keyword is null or p.normalized_name like concat('%', cast(:keyword as text), '%'))
                    """,
            nativeQuery = true)
    Page<Place> search(
            @Param("category") String category,
            @Param("district") String district,
            @Param("tag") String tag,
            @Param("filmingContentType") String filmingContentType,
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

    @Query(
            value = """
                    select distinct p.*
                    from place p
                    left join place_category c on p.category_id = c.id
                    where p.location is not null
                    and (:categories is null
                        or c.code = any(string_to_array(:categories, ','))
                        or ('FILMING_LOCATION' = any(string_to_array(:categories, ','))
                            and 'FILMING_LOCATION' = any(p.tags))
                        or ('BLOG_TREND' = any(string_to_array(:categories, ','))
                            and 'BLOG_TREND' = any(p.tags)))
                    and (:area is null or p.district ilike concat('%', cast(:area as text), '%')
                        or p.neighborhood ilike concat('%', cast(:area as text), '%')
                        or p.road_address ilike concat('%', cast(:area as text), '%')
                        or p.lot_address ilike concat('%', cast(:area as text), '%'))
                    and (:query is null or :categories is not null
                        or p.name ilike concat('%', cast(:query as text), '%')
                        or p.description ilike concat('%', cast(:query as text), '%')
                        or array_to_string(p.tags, ' ') ilike concat('%', cast(:query as text), '%'))
                    order by p.id
                    limit :limit
                    """,
            nativeQuery = true)
    List<Place> searchForAi(
            @Param("query") String query,
            @Param("area") String area,
            @Param("categories") String categories,
            @Param("limit") int limit);

    @Query(
            value = """
                    select p.id as "placeId",
                           ST_Distance(
                               cast(p.location as geography),
                               cast(ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326) as geography)
                           ) as "distanceMeters"
                    from place p
                    left join place_category c on p.category_id = c.id
                    where p.location is not null
                    and (:category is null
                        or c.code = :category
                        or (:category = 'FILMING_LOCATION' and 'FILMING_LOCATION' = any(p.tags))
                        or (:category = 'BLOG_TREND' and 'BLOG_TREND' = any(p.tags)))
                    and (:query is null or :category is not null
                        or p.name ilike concat('%', cast(:query as text), '%')
                        or p.description ilike concat('%', cast(:query as text), '%')
                        or array_to_string(p.tags, ' ') ilike concat('%', cast(:query as text), '%'))
                    and ST_DWithin(
                        cast(p.location as geography),
                        cast(ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326) as geography),
                        :radiusMeters
                    )
                    order by "distanceMeters", p.id
                    limit :limit
                    """,
            nativeQuery = true)
    List<NearbyPlaceDistanceProjection> findNearbyForAi(
            @Param("latitude") double latitude,
            @Param("longitude") double longitude,
            @Param("category") String category,
            @Param("query") String query,
            @Param("radiusMeters") int radiusMeters,
            @Param("limit") int limit);
}
