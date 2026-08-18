package com.ddemachim.server.domain.course.repository;

import com.ddemachim.server.domain.course.entity.Course;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseRepository extends JpaRepository<Course, Long> {

    Optional<Course> findByIdAndMemberId(Long id, Long memberId);
}
