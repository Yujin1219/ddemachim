package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.PlaceCategory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaceCategoryRepository extends JpaRepository<PlaceCategory, Long> {}
