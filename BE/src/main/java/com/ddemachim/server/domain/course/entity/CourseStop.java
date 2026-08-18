package com.ddemachim.server.domain.course.entity;

import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.event.entity.Event;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.UserPlace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(
        name = "course_stop",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_course_stop_revision_sequence",
                columnNames = {"course_revision_id", "sequence_no"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseStop {

    private static final int DEFAULT_ARRIVAL_BUFFER_MINUTES = 10;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "course_revision_id", nullable = false)
    private CourseRevision courseRevision;

    @Column(name = "sequence_no", nullable = false)
    private Integer sequenceNo;

    @Column(name = "source_basket_item_id")
    private Long sourceBasketItemId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "place_id")
    private Place place;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_place_id")
    private UserPlace userPlace;

    @Column(name = "place_name_snapshot", nullable = false, length = 200)
    private String placeNameSnapshot;

    @Column(name = "address_snapshot", columnDefinition = "text")
    private String addressSnapshot;

    @Column(name = "latitude_snapshot", nullable = false)
    private Double latitudeSnapshot;

    @Column(name = "longitude_snapshot", nullable = false)
    private Double longitudeSnapshot;

    @Column(name = "default_dwell_minutes", nullable = false)
    private Integer defaultDwellMinutes;

    @Column(name = "dwell_minutes", nullable = false)
    private Integer dwellMinutes;

    @Enumerated(EnumType.STRING)
    @Column(name = "dwell_source", nullable = false, length = 20)
    private CourseDwellSource dwellSource;

    @Column(name = "arrival_deadline")
    private LocalTime arrivalDeadline;

    @Column(name = "arrival_buffer_minutes", nullable = false)
    private Integer arrivalBufferMinutes = DEFAULT_ARRIVAL_BUFFER_MINUTES;

    @Column(name = "scheduled_arrival", nullable = false)
    private LocalTime scheduledArrival;

    @Column(name = "scheduled_departure", nullable = false)
    private LocalTime scheduledDeparture;

    @Column(name = "travel_minutes_from_previous", nullable = false)
    private Integer travelMinutesFromPrevious;

    @Column(name = "travel_distance_meters", nullable = false)
    private Integer travelDistanceMeters;

    @Column(name = "ascent_meters", precision = 10, scale = 2)
    private BigDecimal ascentMeters;

    @Column(name = "congestion_score_snapshot", precision = 5, scale = 2)
    private BigDecimal congestionScoreSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "hours_source_type", nullable = false, length = 20)
    private CourseHoursSourceType hoursSourceType;

    @Column(name = "open_time_snapshot", nullable = false)
    private LocalTime openTimeSnapshot;

    @Column(name = "close_time_snapshot", nullable = false)
    private LocalTime closeTimeSnapshot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id")
    private Event event;

    @Column(name = "event_end_time_snapshot")
    private LocalTime eventEndTimeSnapshot;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static CourseStop forPlace(
            CourseRevision courseRevision,
            int sequenceNo,
            Long sourceBasketItemId,
            Place place,
            String placeNameSnapshot,
            String addressSnapshot,
            Double latitudeSnapshot,
            Double longitudeSnapshot,
            int defaultDwellMinutes,
            int dwellMinutes,
            CourseDwellSource dwellSource,
            LocalTime arrivalDeadline,
            LocalTime scheduledArrival,
            LocalTime scheduledDeparture,
            int travelMinutesFromPrevious,
            int travelDistanceMeters,
            BigDecimal ascentMeters,
            BigDecimal congestionScoreSnapshot,
            CourseHoursSourceType hoursSourceType,
            LocalTime openTimeSnapshot,
            LocalTime closeTimeSnapshot,
            Event event,
            LocalTime eventEndTimeSnapshot) {
        return initialize(
                courseRevision,
                sequenceNo,
                sourceBasketItemId,
                place,
                null,
                placeNameSnapshot,
                addressSnapshot,
                latitudeSnapshot,
                longitudeSnapshot,
                defaultDwellMinutes,
                dwellMinutes,
                dwellSource,
                arrivalDeadline,
                scheduledArrival,
                scheduledDeparture,
                travelMinutesFromPrevious,
                travelDistanceMeters,
                ascentMeters,
                congestionScoreSnapshot,
                hoursSourceType,
                openTimeSnapshot,
                closeTimeSnapshot,
                event,
                eventEndTimeSnapshot);
    }

    public static CourseStop forUserPlace(
            CourseRevision courseRevision,
            int sequenceNo,
            Long sourceBasketItemId,
            UserPlace userPlace,
            String placeNameSnapshot,
            String addressSnapshot,
            Double latitudeSnapshot,
            Double longitudeSnapshot,
            int defaultDwellMinutes,
            int dwellMinutes,
            CourseDwellSource dwellSource,
            LocalTime arrivalDeadline,
            LocalTime scheduledArrival,
            LocalTime scheduledDeparture,
            int travelMinutesFromPrevious,
            int travelDistanceMeters,
            BigDecimal ascentMeters,
            BigDecimal congestionScoreSnapshot,
            CourseHoursSourceType hoursSourceType,
            LocalTime openTimeSnapshot,
            LocalTime closeTimeSnapshot,
            Event event,
            LocalTime eventEndTimeSnapshot) {
        return initialize(
                courseRevision,
                sequenceNo,
                sourceBasketItemId,
                null,
                userPlace,
                placeNameSnapshot,
                addressSnapshot,
                latitudeSnapshot,
                longitudeSnapshot,
                defaultDwellMinutes,
                dwellMinutes,
                dwellSource,
                arrivalDeadline,
                scheduledArrival,
                scheduledDeparture,
                travelMinutesFromPrevious,
                travelDistanceMeters,
                ascentMeters,
                congestionScoreSnapshot,
                hoursSourceType,
                openTimeSnapshot,
                closeTimeSnapshot,
                event,
                eventEndTimeSnapshot);
    }

    private static CourseStop initialize(
            CourseRevision courseRevision,
            int sequenceNo,
            Long sourceBasketItemId,
            Place place,
            UserPlace userPlace,
            String placeNameSnapshot,
            String addressSnapshot,
            Double latitudeSnapshot,
            Double longitudeSnapshot,
            int defaultDwellMinutes,
            int dwellMinutes,
            CourseDwellSource dwellSource,
            LocalTime arrivalDeadline,
            LocalTime scheduledArrival,
            LocalTime scheduledDeparture,
            int travelMinutesFromPrevious,
            int travelDistanceMeters,
            BigDecimal ascentMeters,
            BigDecimal congestionScoreSnapshot,
            CourseHoursSourceType hoursSourceType,
            LocalTime openTimeSnapshot,
            LocalTime closeTimeSnapshot,
            Event event,
            LocalTime eventEndTimeSnapshot) {
        validate(
                courseRevision,
                sequenceNo,
                place,
                userPlace,
                placeNameSnapshot,
                latitudeSnapshot,
                longitudeSnapshot,
                defaultDwellMinutes,
                dwellMinutes,
                dwellSource,
                scheduledArrival,
                scheduledDeparture,
                travelMinutesFromPrevious,
                travelDistanceMeters,
                congestionScoreSnapshot,
                hoursSourceType,
                openTimeSnapshot,
                closeTimeSnapshot);

        CourseStop stop = new CourseStop();
        stop.courseRevision = courseRevision;
        stop.sequenceNo = sequenceNo;
        stop.sourceBasketItemId = sourceBasketItemId;
        stop.place = place;
        stop.userPlace = userPlace;
        stop.placeNameSnapshot = placeNameSnapshot;
        stop.addressSnapshot = addressSnapshot;
        stop.latitudeSnapshot = latitudeSnapshot;
        stop.longitudeSnapshot = longitudeSnapshot;
        stop.defaultDwellMinutes = defaultDwellMinutes;
        stop.dwellMinutes = dwellMinutes;
        stop.dwellSource = dwellSource;
        stop.arrivalDeadline = arrivalDeadline;
        stop.arrivalBufferMinutes = DEFAULT_ARRIVAL_BUFFER_MINUTES;
        stop.scheduledArrival = scheduledArrival;
        stop.scheduledDeparture = scheduledDeparture;
        stop.travelMinutesFromPrevious = travelMinutesFromPrevious;
        stop.travelDistanceMeters = travelDistanceMeters;
        stop.ascentMeters = ascentMeters;
        stop.congestionScoreSnapshot = congestionScoreSnapshot;
        stop.hoursSourceType = hoursSourceType;
        stop.openTimeSnapshot = openTimeSnapshot;
        stop.closeTimeSnapshot = closeTimeSnapshot;
        stop.event = event;
        stop.eventEndTimeSnapshot = eventEndTimeSnapshot;
        return stop;
    }

    private static void validate(
            CourseRevision courseRevision,
            int sequenceNo,
            Place place,
            UserPlace userPlace,
            String placeNameSnapshot,
            Double latitudeSnapshot,
            Double longitudeSnapshot,
            int defaultDwellMinutes,
            int dwellMinutes,
            CourseDwellSource dwellSource,
            LocalTime scheduledArrival,
            LocalTime scheduledDeparture,
            int travelMinutesFromPrevious,
            int travelDistanceMeters,
            BigDecimal congestionScoreSnapshot,
            CourseHoursSourceType hoursSourceType,
            LocalTime openTimeSnapshot,
            LocalTime closeTimeSnapshot) {
        if (courseRevision == null
                || (place == null) == (userPlace == null)
                || placeNameSnapshot == null
                || placeNameSnapshot.isBlank()
                || placeNameSnapshot.length() > 200
                || latitudeSnapshot == null
                || longitudeSnapshot == null
                || dwellSource == null
                || scheduledArrival == null
                || scheduledDeparture == null
                || hoursSourceType == null
                || openTimeSnapshot == null
                || closeTimeSnapshot == null) {
            throw new IllegalArgumentException("required stop value is missing or invalid");
        }
        if (sequenceNo < 1) {
            throw new IllegalArgumentException("sequenceNo must be at least 1");
        }
        validateCoordinate(latitudeSnapshot, -90.0, 90.0, "latitudeSnapshot");
        validateCoordinate(longitudeSnapshot, -180.0, 180.0, "longitudeSnapshot");
        validateDwellMinutes(defaultDwellMinutes, "defaultDwellMinutes");
        validateDwellMinutes(dwellMinutes, "dwellMinutes");
        if (scheduledDeparture.isBefore(scheduledArrival)) {
            throw new IllegalArgumentException("scheduledDeparture must not precede scheduledArrival");
        }
        if (travelMinutesFromPrevious < 0 || travelDistanceMeters < 0) {
            throw new IllegalArgumentException("travel metrics must not be negative");
        }
        if (congestionScoreSnapshot != null
                && (congestionScoreSnapshot.compareTo(BigDecimal.ZERO) < 0
                        || congestionScoreSnapshot.compareTo(new BigDecimal("100.00")) > 0)) {
            throw new IllegalArgumentException("congestionScoreSnapshot must be between 0 and 100");
        }
    }

    private static void validateCoordinate(Double value, double minimum, double maximum, String name) {
        if (!Double.isFinite(value) || value < minimum || value > maximum) {
            throw new IllegalArgumentException(name + " is outside its supported range");
        }
    }

    private static void validateDwellMinutes(int value, String name) {
        if (value < 1 || value > 1440) {
            throw new IllegalArgumentException(name + " must be between 1 and 1440");
        }
    }
}
