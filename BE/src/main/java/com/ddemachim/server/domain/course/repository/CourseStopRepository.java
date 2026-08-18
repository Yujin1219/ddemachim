package com.ddemachim.server.domain.course.repository;

import com.ddemachim.server.domain.course.entity.CourseStop;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseStopRepository extends JpaRepository<CourseStop, Long> {

    List<CourseStop> findAllByCourseRevisionIdOrderBySequenceNoAsc(Long courseRevisionId);
}
