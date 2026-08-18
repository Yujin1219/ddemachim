package com.ddemachim.server.domain.course.entity;

import com.ddemachim.server.domain.course.enums.CourseStatus;
import com.ddemachim.server.domain.user.entity.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(
        name = "course",
        indexes = @Index(
                name = "idx_course_member_updated_at",
                columnList = "member_id, updated_at DESC"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Course {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CourseStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_revision_id")
    private CourseRevision currentRevision;

    @Column(name = "planned_stop_count", nullable = false)
    private Integer plannedStopCount;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public static Course create(Member member, String title) {
        if (member == null) {
            throw new IllegalArgumentException("member is required");
        }
        if (title == null || title.isBlank() || title.length() > 200) {
            throw new IllegalArgumentException("title is required and must not exceed 200 characters");
        }

        Course course = new Course();
        course.member = member;
        course.title = title;
        course.status = CourseStatus.READY;
        course.plannedStopCount = 0;
        course.version = 0L;
        return course;
    }

    public void changeCurrentRevision(CourseRevision revision, int plannedStopCount) {
        if (revision == null) {
            throw new IllegalArgumentException("revision is required");
        }
        if (plannedStopCount < 0) {
            throw new IllegalArgumentException("plannedStopCount must not be negative");
        }
        if (!belongsToThisCourse(revision.getCourse())) {
            throw new IllegalArgumentException("revision must belong to this course");
        }

        this.currentRevision = revision;
        this.plannedStopCount = plannedStopCount;
    }

    private boolean belongsToThisCourse(Course revisionCourse) {
        if (revisionCourse == this) {
            return true;
        }
        return revisionCourse != null
                && id != null
                && revisionCourse.id != null
                && id.equals(revisionCourse.id);
    }
}
