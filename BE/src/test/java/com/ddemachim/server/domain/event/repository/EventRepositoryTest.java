package com.ddemachim.server.domain.event.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.event.entity.Event;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class EventRepositoryTest {

    private static final LocalDate BUSINESS_DATE = LocalDate.of(2026, 8, 12);
    private static final LocalTime BUSINESS_TIME = LocalTime.of(12, 0);
    private static final GeometryFactory GEOMETRY_FACTORY = new GeometryFactory();

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void dateSortBranchesKeepLegacyOrderingAndLatestTieBreak() {
        String keyword = "EVENT_REPOSITORY_SORT_" + UUID.randomUUID();
        Event startDateFirst = event(
                keyword + " start-first",
                LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 31),
                LocalDate.of(2026, 3, 1),
                point(126.9780, 37.5665));
        Event startDateSecond = event(
                keyword + " start-second",
                LocalDate.of(2026, 8, 2),
                LocalDate.of(2026, 8, 31),
                LocalDate.of(2026, 3, 1),
                point(126.9790, 37.5665));
        Event oldRegistration = event(
                keyword + " old-registration",
                LocalDate.of(2026, 8, 3),
                LocalDate.of(2026, 8, 31),
                LocalDate.of(2026, 1, 1),
                point(126.9800, 37.5665));
        Event noRegistration = event(
                keyword + " no-registration", null, null, null, null);

        entityManager.persist(startDateFirst);
        entityManager.persist(startDateSecond);
        entityManager.persist(oldRegistration);
        entityManager.persist(noRegistration);
        entityManager.flush();
        entityManager.clear();

        PageRequest page = PageRequest.of(0, 10);
        Page<Event> defaultResult = eventRepository.searchByStartDate(
                keyword, null, BUSINESS_DATE, BUSINESS_TIME, page);
        Page<Event> latestResult = eventRepository.searchByLatestApplyDate(
                keyword, null, BUSINESS_DATE, BUSINESS_TIME, page);

        assertThat(defaultResult.getContent())
                .extracting(Event::getTitle)
                .containsExactly(
                        startDateFirst.getTitle(),
                        startDateSecond.getTitle(),
                        oldRegistration.getTitle(),
                        noRegistration.getTitle());
        assertThat(latestResult.getContent())
                .extracting(Event::getTitle)
                .containsExactly(
                        startDateSecond.getTitle(),
                        startDateFirst.getTitle(),
                        oldRegistration.getTitle(),
                        noRegistration.getTitle());
    }

    @Test
    void statusFilterRemainsCorrectForLegacyDateBranch() {
        String keyword = "EVENT_REPOSITORY_STATUS_" + UUID.randomUUID();
        Event ongoing = event(
                keyword + " ongoing",
                LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 31),
                LocalDate.of(2026, 3, 1),
                null);
        Event ended = event(
                keyword + " ended",
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 8, 11),
                LocalDate.of(2026, 2, 1),
                null);
        Event upcoming = event(
                keyword + " upcoming",
                LocalDate.of(2026, 8, 20),
                LocalDate.of(2026, 8, 31),
                LocalDate.of(2026, 4, 1),
                null);

        entityManager.persist(ongoing);
        entityManager.persist(ended);
        entityManager.persist(upcoming);
        entityManager.flush();
        entityManager.clear();

        PageRequest page = PageRequest.of(0, 10);
        Page<Event> ongoingResult = eventRepository.searchByStartDate(
                keyword, "ONGOING", BUSINESS_DATE, BUSINESS_TIME, page);
        Page<Event> endedResult = eventRepository.searchByStartDate(
                keyword, "ENDED", BUSINESS_DATE, BUSINESS_TIME, page);

        assertThat(ongoingResult.getContent()).extracting(Event::getTitle).containsExactly(ongoing.getTitle());
        assertThat(endedResult.getContent()).extracting(Event::getTitle).containsExactly(ended.getTitle());
    }

    @Test
    void nearestSortUsesPostgisDistanceAndPlacesMissingLocationsLast() {
        String keyword = "EVENT_REPOSITORY_NEAREST_" + UUID.randomUUID();
        Event nearest = event(
                keyword + " nearest",
                LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 31),
                null,
                point(126.9781, 37.5665));
        Event sameDistanceLowerId = event(
                keyword + " tie-lower",
                LocalDate.of(2026, 8, 2),
                LocalDate.of(2026, 8, 31),
                null,
                point(126.9800, 37.5665));
        Event sameDistanceHigherId = event(
                keyword + " tie-higher",
                LocalDate.of(2026, 8, 3),
                LocalDate.of(2026, 8, 31),
                null,
                point(126.9800, 37.5665));
        Event far = event(
                keyword + " far",
                LocalDate.of(2026, 8, 4),
                LocalDate.of(2026, 8, 31),
                null,
                point(127.1000, 37.6000));
        Event noLocation = event(
                keyword + " no-location", null, null, null, null);

        entityManager.persist(nearest);
        entityManager.persist(sameDistanceLowerId);
        entityManager.persist(sameDistanceHigherId);
        entityManager.persist(far);
        entityManager.persist(noLocation);
        entityManager.flush();
        entityManager.clear();

        Page<Event> result = eventRepository.searchByNearestLocation(
                keyword,
                null,
                BUSINESS_DATE,
                BUSINESS_TIME,
                37.5665,
                126.9780,
                PageRequest.of(0, 10));

        assertThat(result.getTotalElements()).isEqualTo(5);
        assertThat(result.getContent())
                .extracting(Event::getTitle)
                .containsExactly(
                        nearest.getTitle(),
                        sameDistanceLowerId.getTitle(),
                        sameDistanceHigherId.getTitle(),
                        far.getTitle(),
                        noLocation.getTitle());
    }

    @Test
    void timeAwareStatusBoundariesTreatUnknownBoundsAndMultiDayEventsConsistently() {
        String keyword = "EVENT_REPOSITORY_TIME_" + UUID.randomUUID();
        Event sameDayWindow = event(
                keyword + " same-day-window",
                BUSINESS_DATE,
                BUSINESS_DATE,
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                LocalDate.of(2026, 3, 1),
                point(126.9780, 37.5665));
        Event unknownStart = event(
                keyword + " unknown-start",
                BUSINESS_DATE,
                BUSINESS_DATE.plusDays(1),
                null,
                LocalTime.of(18, 0),
                LocalDate.of(2026, 3, 2),
                point(126.9790, 37.5665));
        Event unknownEnd = event(
                keyword + " unknown-end",
                BUSINESS_DATE.minusDays(1),
                BUSINESS_DATE,
                LocalTime.of(10, 0),
                null,
                LocalDate.of(2026, 3, 3),
                point(126.9800, 37.5665));
        Event multiDay = event(
                keyword + " multi-day",
                BUSINESS_DATE.minusDays(1),
                BUSINESS_DATE.plusDays(1),
                LocalTime.of(23, 0),
                LocalTime.of(1, 0),
                LocalDate.of(2026, 3, 4),
                point(126.9810, 37.5665));

        entityManager.persist(sameDayWindow);
        entityManager.persist(unknownStart);
        entityManager.persist(unknownEnd);
        entityManager.persist(multiDay);
        entityManager.flush();
        entityManager.clear();

        PageRequest page = PageRequest.of(0, 10);
        assertThat(eventRepository.searchByStartDate(
                        keyword,
                        "ONGOING",
                        BUSINESS_DATE,
                        LocalTime.of(9, 59, 59),
                        page))
                .extracting(Event::getTitle)
                .containsExactlyInAnyOrder(
                        unknownStart.getTitle(), unknownEnd.getTitle(), multiDay.getTitle());
        assertThat(eventRepository.searchByStartDate(
                        keyword, "ONGOING", BUSINESS_DATE, LocalTime.of(10, 0), page))
                .extracting(Event::getTitle)
                .containsExactlyInAnyOrder(
                        sameDayWindow.getTitle(),
                        unknownStart.getTitle(),
                        unknownEnd.getTitle(),
                        multiDay.getTitle());
        assertThat(eventRepository.searchByStartDate(
                        keyword, "ONGOING", BUSINESS_DATE, LocalTime.of(18, 0), page))
                .extracting(Event::getTitle)
                .containsExactlyInAnyOrder(
                        sameDayWindow.getTitle(),
                        unknownStart.getTitle(),
                        unknownEnd.getTitle(),
                        multiDay.getTitle());

        Page<Event> endedAfterSameDayWindow = eventRepository.searchByStartDate(
                keyword, "ENDED", BUSINESS_DATE, LocalTime.of(18, 0, 1), page);
        assertThat(endedAfterSameDayWindow.getContent())
                .extracting(Event::getTitle)
                .containsExactly(sameDayWindow.getTitle());

        Page<Event> latestOngoing = eventRepository.searchByLatestApplyDate(
                keyword, "ONGOING", BUSINESS_DATE, LocalTime.of(18, 0, 1), page);
        Page<Event> nearestOngoing = eventRepository.searchByNearestLocation(
                keyword,
                "ONGOING",
                BUSINESS_DATE,
                LocalTime.of(18, 0, 1),
                37.5665,
                126.9780,
                page);

        assertThat(latestOngoing.getContent())
                .extracting(Event::getTitle)
                .containsExactlyInAnyOrder(
                        unknownStart.getTitle(), unknownEnd.getTitle(), multiDay.getTitle());
        assertThat(nearestOngoing.getTotalElements()).isEqualTo(3);
        assertThat(nearestOngoing.getContent())
                .extracting(Event::getTitle)
                .containsExactlyInAnyOrder(
                        unknownStart.getTitle(), unknownEnd.getTitle(), multiDay.getTitle());
    }

    private Event event(
            String title,
            LocalDate startDate,
            LocalDate endDate,
            LocalDate applyDate,
            Point location) {
        return event(title, startDate, endDate, null, null, applyDate, location);
    }

    private Event event(
            String title,
            LocalDate startDate,
            LocalDate endDate,
            LocalTime eventStartTime,
            LocalTime eventEndTime,
            LocalDate applyDate,
            Point location) {
        Event event = BeanUtils.instantiateClass(Event.class);
        ReflectionTestUtils.setField(event, "title", title);
        ReflectionTestUtils.setField(event, "startDate", startDate);
        ReflectionTestUtils.setField(event, "endDate", endDate);
        ReflectionTestUtils.setField(event, "eventStartTime", eventStartTime);
        ReflectionTestUtils.setField(event, "eventEndTime", eventEndTime);
        ReflectionTestUtils.setField(event, "applyDate", applyDate);
        ReflectionTestUtils.setField(event, "source", "EVENT_REPOSITORY_TEST");
        ReflectionTestUtils.setField(event, "sourceId", UUID.randomUUID().toString());
        ReflectionTestUtils.setField(event, "location", location);
        return event;
    }

    private Point point(double longitude, double latitude) {
        Point point = GEOMETRY_FACTORY.createPoint(new Coordinate(longitude, latitude));
        point.setSRID(4326);
        return point;
    }
}
