package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.PlaceMenu;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaceMenuRepository extends JpaRepository<PlaceMenu, Long> {

    List<PlaceMenu> findByPlaceIdOrderById(Long placeId);
}
