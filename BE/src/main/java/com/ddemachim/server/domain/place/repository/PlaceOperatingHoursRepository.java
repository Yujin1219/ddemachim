package com.ddemachim.server.domain.place.repository;

import com.ddemachim.server.domain.place.entity.PlaceOperatingHours;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaceOperatingHoursRepository extends JpaRepository<PlaceOperatingHours, Long> {

    List<PlaceOperatingHours> findByPlaceIdOrderByDayOfWeek(Long placeId);
}
