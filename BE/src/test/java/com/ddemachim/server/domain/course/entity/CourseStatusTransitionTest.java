package com.ddemachim.server.domain.course.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ddemachim.server.domain.course.enums.CourseStatus;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import org.junit.jupiter.api.Test;

class CourseStatusTransitionTest {

    @Test
    void readyCourseCanStartAndThenBeArchived() {
        Course course = Course.create(
                Member.create("course@example.com", "encoded", "course-user", Role.USER),
                "경복궁 외 2곳");

        course.start();
        assertThat(course.getStatus()).isEqualTo(CourseStatus.IN_PROGRESS);

        course.archiveActive();
        assertThat(course.getStatus()).isEqualTo(CourseStatus.ARCHIVED);
    }

    @Test
    void onlyReadyCourseCanStart() {
        Course course = Course.create(
                Member.create("course@example.com", "encoded", "course-user", Role.USER),
                "경복궁");
        course.start();

        assertThatThrownBy(course::start).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void inProgressCourseCanComplete() {
        Course course = Course.create(
                Member.create("course@example.com", "encoded", "course-user", Role.USER),
                "경복궁");
        course.start();

        course.complete();

        assertThat(course.getStatus()).isEqualTo(CourseStatus.COMPLETED);
    }
}
