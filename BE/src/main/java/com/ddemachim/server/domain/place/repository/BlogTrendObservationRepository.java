package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.BlogTrendObservation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BlogTrendObservationRepository extends JpaRepository<BlogTrendObservation, Long> {

    Page<BlogTrendObservation> findByPlaceIdOrderByCollectionDateDesc(Long placeId, Pageable pageable);
}
