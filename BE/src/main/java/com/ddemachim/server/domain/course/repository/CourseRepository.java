package com.ddemachim.server.domain.course.repository;

import com.ddemachim.server.domain.course.entity.Course;
import com.ddemachim.server.domain.course.enums.CourseStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseRepository extends JpaRepository<Course, Long> {

    Optional<Course> findByIdAndMemberId(Long id, Long memberId);

    Optional<Course> findFirstByMemberIdAndStatusOrderByUpdatedAtDesc(Long memberId, CourseStatus status);

    List<Course> findAllByMemberIdAndStatusOrderByUpdatedAtDesc(Long memberId, CourseStatus status);
}
