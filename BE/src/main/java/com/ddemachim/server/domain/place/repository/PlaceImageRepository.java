package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.PlaceImage;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaceImageRepository extends JpaRepository<PlaceImage, Long> {

    List<PlaceImage> findByPlaceId(Long placeId);
}
