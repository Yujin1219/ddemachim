package com.ddemachim.server.domain.place.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceTrendSnapshot;
import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.context.jdbc.Sql;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Sql(scripts = "/place-trend-test-schema.sql")
class PlaceTrendSnapshotRepositoryTest {

    @Autowired
    private PlaceTrendSnapshotRepository placeTrendSnapshotRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void findLatestVisibleSnapshots_usesLatestSnapshotBeforeFilteringAndOrdersVisibleRows() {
        Place hiddenByLatestSnapshot = place("최신 비공개 장소");
        Place trendingPlace = place("트렌딩 장소");
        Place watchPlace = place("관찰 장소");
        entityManager.persist(hiddenByLatestSnapshot);
        entityManager.persist(trendingPlace);
        entityManager.persist(watchPlace);
        entityManager.flush();

        entityManager.persist(snapshot(
                hiddenByLatestSnapshot,
                LocalDate.of(2026, 8, 12),
                PlaceTrendStatus.TRENDING,
                99));
        entityManager.persist(snapshot(
                hiddenByLatestSnapshot,
                LocalDate.of(2026, 8, 13),
                PlaceTrendStatus.INSUFFICIENT_EVIDENCE,
                100));
        entityManager.persist(snapshot(
                trendingPlace,
                LocalDate.of(2026, 8, 12),
                PlaceTrendStatus.TRENDING,
                2));
        entityManager.persist(snapshot(
                trendingPlace,
                LocalDate.of(2026, 8, 13),
                PlaceTrendStatus.TRENDING,
                1));
        entityManager.persist(snapshot(
                watchPlace,
                LocalDate.of(2026, 8, 13),
                PlaceTrendStatus.WATCH,
                20));
        entityManager.flush();
        entityManager.clear();

        List<PlaceTrendSnapshot> result = placeTrendSnapshotRepository.findLatestVisibleSnapshots(PageRequest.of(0, 20));

        assertThat(result).extracting(snapshot -> snapshot.getPlace().getName())
                .containsExactly("트렌딩 장소", "관찰 장소");
        assertThat(result).extracting(PlaceTrendSnapshot::getStatus)
                .containsExactly(PlaceTrendStatus.TRENDING, PlaceTrendStatus.WATCH);
        assertThat(result).extracting(PlaceTrendSnapshot::getRecentObservedPosts)
                .containsExactly(1, 20);
    }

    private static Place place(String name) {
        Place place = BeanUtils.instantiateClass(Place.class);
        ReflectionTestUtils.setField(place, "name", name);
        ReflectionTestUtils.setField(place, "normalizedName", name);
        ReflectionTestUtils.setField(place, "district", "종로구");
        return place;
    }

    private static PlaceTrendSnapshot snapshot(
            Place place, LocalDate snapshotDate, PlaceTrendStatus status, int recentObservedPosts) {
        PlaceTrendSnapshot snapshot = BeanUtils.instantiateClass(PlaceTrendSnapshot.class);
        ReflectionTestUtils.setField(snapshot, "place", place);
        ReflectionTestUtils.setField(snapshot, "snapshotDate", snapshotDate);
        ReflectionTestUtils.setField(snapshot, "status", status);
        ReflectionTestUtils.setField(snapshot, "uniquePosts", 3);
        ReflectionTestUtils.setField(snapshot, "uniqueAuthors", 3);
        ReflectionTestUtils.setField(snapshot, "uniqueQueries", 1);
        ReflectionTestUtils.setField(snapshot, "uniqueIntentCategories", 1);
        ReflectionTestUtils.setField(snapshot, "collectionDays", 2);
        ReflectionTestUtils.setField(snapshot, "recentObservedPosts", recentObservedPosts);
        ReflectionTestUtils.setField(snapshot, "adSuspectedRatio", 0.0d);
        ReflectionTestUtils.setField(snapshot, "minimumEvidencePassed", true);
        ReflectionTestUtils.setField(snapshot, "watchSignalCount", 2);
        ReflectionTestUtils.setField(snapshot, "trendAvailable", true);
        ReflectionTestUtils.setField(snapshot, "trendRising", true);
        ReflectionTestUtils.setField(snapshot, "semantics", "test semantics");
        return snapshot;
    }
}
