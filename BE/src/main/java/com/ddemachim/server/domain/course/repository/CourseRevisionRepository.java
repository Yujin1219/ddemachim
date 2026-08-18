package com.ddemachim.server.domain.course.repository;

import com.ddemachim.server.domain.course.entity.CourseRevision;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseRevisionRepository extends JpaRepository<CourseRevision, Long> {

    Optional<CourseRevision> findFirstByCourseIdOrderByRevisionNoDesc(Long courseId);
}
