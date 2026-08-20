package com.ddemachim.server.domain.course.repository;

import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseBasketItemRepository extends JpaRepository<CourseBasketItem, Long> {

    Optional<CourseBasketItem> findByIdAndMemberId(Long id, Long memberId);

    @EntityGraph(attributePaths = {"place", "place.category"})
    Optional<CourseBasketItem> findByMemberIdAndPlaceId(Long memberId, Long placeId);

    @EntityGraph(attributePaths = "userPlace")
    Optional<CourseBasketItem> findByMemberIdAndUserPlaceId(Long memberId, Long userPlaceId);

    @EntityGraph(attributePaths = {"place", "place.category", "userPlace"})
    List<CourseBasketItem> findAllByMemberIdOrderByCreatedAtDescIdDesc(Long memberId);

    @EntityGraph(attributePaths = {"place", "userPlace"})
    List<CourseBasketItem> findAllByMemberIdAndIdIn(Long memberId, List<Long> ids);

    void deleteAllByMemberIdAndIdIn(Long memberId, List<Long> ids);
}
