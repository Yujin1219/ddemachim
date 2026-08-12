package com.ddemachim.server.domain.course.repository;

import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseBasketItemRepository extends JpaRepository<CourseBasketItem, Long> {

    @EntityGraph(attributePaths = "place")
    Optional<CourseBasketItem> findByMemberIdAndPlaceId(Long memberId, Long placeId);
}
