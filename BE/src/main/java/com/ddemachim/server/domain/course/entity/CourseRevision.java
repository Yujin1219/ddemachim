package com.ddemachim.server.domain.course.entity;

import com.ddemachim.server.domain.course.enums.CourseReplanReason;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartType;
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
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(
        name = "course_revision",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_course_revision_course_revision_no",
                columnNames = {"course_id", "revision_no"}),
        indexes = @Index(
                name = "idx_course_revision_course_revision_no",
                columnList = "course_id, revision_no DESC"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @Column(name = "revision_no", nullable = false)
    private Integer revisionNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "route_strategy", nullable = false, length = 20)
    private CourseRouteStrategy routeStrategy;

    @Column(name = "service_date", nullable = false)
    private LocalDate serviceDate;

    @Column(name = "desired_start_time", nullable = false)
    private LocalTime desiredStartTime;

    @Column(name = "desired_end_time", nullable = false)
    private LocalTime desiredEndTime;

    @Enumerated(EnumType.STRING)
    @Column(name = "start_type", nullable = false, length = 30)
    private CourseStartType startType;

    @Column(name = "start_name", length = 200)
    private String startName;

    @Column(name = "start_latitude", nullable = false)
    private Double startLatitude;

    @Column(name = "start_longitude", nullable = false)
    private Double startLongitude;

    @Column(name = "algorithm_version", nullable = false, length = 50)
    private String algorithmVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "replan_reason", nullable = false, length = 30)
    private CourseReplanReason replanReason;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static CourseRevision create(
            Course course,
            int revisionNo,
            CourseRouteStrategy routeStrategy,
            LocalDate serviceDate,
            LocalTime desiredStartTime,
            LocalTime desiredEndTime,
            CourseStartType startType,
            String startName,
            Double startLatitude,
            Double startLongitude,
            String algorithmVersion,
            CourseReplanReason replanReason) {
        validateRequiredValues(
                course,
                routeStrategy,
                serviceDate,
                desiredStartTime,
                desiredEndTime,
                startType,
                startLatitude,
                startLongitude,
                algorithmVersion,
                replanReason);
        if (revisionNo < 1) {
            throw new IllegalArgumentException("revisionNo must be at least 1");
        }
        if (!desiredEndTime.isAfter(desiredStartTime)) {
            throw new IllegalArgumentException("desiredEndTime must be after desiredStartTime");
        }
        if (startType == CourseStartType.SEARCHED_PLACE && (startName == null || startName.isBlank())) {
            throw new IllegalArgumentException("startName is required for a searched place");
        }
        if (startName != null && startName.length() > 200) {
            throw new IllegalArgumentException("startName must not exceed 200 characters");
        }
        validateCoordinate(startLatitude, -90.0, 90.0, "startLatitude");
        validateCoordinate(startLongitude, -180.0, 180.0, "startLongitude");

        CourseRevision revision = new CourseRevision();
        revision.course = course;
        revision.revisionNo = revisionNo;
        revision.routeStrategy = routeStrategy;
        revision.serviceDate = serviceDate;
        revision.desiredStartTime = desiredStartTime;
        revision.desiredEndTime = desiredEndTime;
        revision.startType = startType;
        revision.startName = startName;
        revision.startLatitude = startLatitude;
        revision.startLongitude = startLongitude;
        revision.algorithmVersion = algorithmVersion;
        revision.replanReason = replanReason;
        return revision;
    }

    private static void validateRequiredValues(
            Course course,
            CourseRouteStrategy routeStrategy,
            LocalDate serviceDate,
            LocalTime desiredStartTime,
            LocalTime desiredEndTime,
            CourseStartType startType,
            Double startLatitude,
            Double startLongitude,
            String algorithmVersion,
            CourseReplanReason replanReason) {
        if (course == null
                || routeStrategy == null
                || serviceDate == null
                || desiredStartTime == null
                || desiredEndTime == null
                || startType == null
                || startLatitude == null
                || startLongitude == null
                || algorithmVersion == null
                || algorithmVersion.isBlank()
                || algorithmVersion.length() > 50
                || replanReason == null) {
            throw new IllegalArgumentException("required revision value is missing or invalid");
        }
    }

    private static void validateCoordinate(Double value, double minimum, double maximum, String name) {
        if (!Double.isFinite(value) || value < minimum || value > maximum) {
            throw new IllegalArgumentException(name + " is outside its supported range");
        }
    }
}
