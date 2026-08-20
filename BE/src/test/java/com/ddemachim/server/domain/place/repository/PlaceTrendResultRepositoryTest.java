package com.ddemachim.server.domain.place.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.place.entity.BlogTrendRun;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceTrendResult;
import com.ddemachim.server.domain.place.enums.BlogTrendRunStatus;
import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.util.ReflectionTestUtils;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Sql(scripts = "/place-trend-test-schema.sql")
class PlaceTrendResultRepositoryTest {

    @Autowired
    private PlaceTrendResultRepository placeTrendResultRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void findLatestVisibleResults_filtersRunAndExpiry_deduplicatesPlaces_andOrdersResults() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime future = now.plusDays(1);
        OffsetDateTime past = now.minusDays(1);

        Place latestPlace = place("최신 결과 장소");
        Place trendingHighPlace = place("높은 트렌딩 장소");
        Place trendingLowPlace = place("낮은 트렌딩 장소");
        Place watchPlace = place("관찰 장소");
        Place failedPlace = place("실패 실행 장소");
        Place expiredPlace = place("만료 결과 장소");
        persist(latestPlace, trendingHighPlace, trendingLowPlace, watchPlace, failedPlace, expiredPlace);

        BlogTrendRun oldRun = run(LocalDate.of(2026, 8, 3), BlogTrendRunStatus.SUCCESS);
        BlogTrendRun latestRun = run(LocalDate.of(2026, 8, 10), BlogTrendRunStatus.SUCCESS);
        BlogTrendRun highRun = run(LocalDate.of(2026, 8, 11), BlogTrendRunStatus.SUCCESS);
        BlogTrendRun lowRun = run(LocalDate.of(2026, 8, 12), BlogTrendRunStatus.SUCCESS);
        BlogTrendRun watchRun = run(LocalDate.of(2026, 8, 13), BlogTrendRunStatus.SUCCESS);
        BlogTrendRun failedRun = run(LocalDate.of(2026, 8, 14), BlogTrendRunStatus.FAILED);
        BlogTrendRun expiredRun = run(LocalDate.of(2026, 8, 15), BlogTrendRunStatus.SUCCESS);
        persist(oldRun, latestRun, highRun, lowRun, watchRun, failedRun, expiredRun);

        persist(result(oldRun, latestPlace, PlaceTrendStatus.TRENDING, 5.0, future));
        persist(result(latestRun, latestPlace, PlaceTrendStatus.TRENDING, 15.0, future));
        persist(result(highRun, trendingHighPlace, PlaceTrendStatus.TRENDING, 30.0, future));
        persist(result(lowRun, trendingLowPlace, PlaceTrendStatus.TRENDING, 10.0, future));
        persist(result(watchRun, watchPlace, PlaceTrendStatus.WATCH, 99.0, future));
        persist(result(failedRun, failedPlace, PlaceTrendStatus.TRENDING, 100.0, future));
        persist(result(expiredRun, expiredPlace, PlaceTrendStatus.TRENDING, 100.0, past));
        entityManager.flush();
        entityManager.clear();

        List<PlaceTrendResult> results = placeTrendResultRepository.findLatestVisibleResults(PageRequest.of(0, 20));

        assertThat(results).extracting(result -> result.getPlace().getName())
                .containsExactly("높은 트렌딩 장소", "최신 결과 장소", "낮은 트렌딩 장소", "관찰 장소");
        assertThat(results).extracting(PlaceTrendResult::getStatus)
                .containsExactly(
                        PlaceTrendStatus.TRENDING,
                        PlaceTrendStatus.TRENDING,
                        PlaceTrendStatus.TRENDING,
                        PlaceTrendStatus.WATCH);
        assertThat(results).extracting(PlaceTrendResult::getInterestChangePercent)
                .containsExactly(30.0, 15.0, 10.0, 99.0);

        PlaceTrendResult detailResult = placeTrendResultRepository
                .findFirstVisibleByPlaceId(latestPlace.getId())
                .orElseThrow();
        assertThat(detailResult.getInterestChangePercent()).isEqualTo(15.0);
        assertThat(placeTrendResultRepository.findFirstVisibleByPlaceId(failedPlace.getId()))
                .isEmpty();
        assertThat(placeTrendResultRepository.findFirstVisibleByPlaceId(expiredPlace.getId()))
                .isEmpty();
    }

    private void persist(Object... entities) {
        for (Object entity : entities) {
            entityManager.persist(entity);
        }
    }

    private static Place place(String name) {
        Place place = BeanUtils.instantiateClass(Place.class);
        ReflectionTestUtils.setField(place, "name", name);
        ReflectionTestUtils.setField(place, "normalizedName", name);
        ReflectionTestUtils.setField(place, "district", "종로구");
        return place;
    }

    private static BlogTrendRun run(LocalDate runWeek, BlogTrendRunStatus status) {
        BlogTrendRun run = BeanUtils.instantiateClass(BlogTrendRun.class);
        ReflectionTestUtils.setField(run, "runWeek", runWeek);
        ReflectionTestUtils.setField(run, "status", status);
        ReflectionTestUtils.setField(run, "startedAt", OffsetDateTime.now(ZoneOffset.UTC).minusHours(1));
        ReflectionTestUtils.setField(run, "processedPlaceCount", 1);
        ReflectionTestUtils.setField(run, "resultCount", 1);
        return run;
    }

    private static PlaceTrendResult result(
            BlogTrendRun run,
            Place place,
            PlaceTrendStatus status,
            Double interestChangePercent,
            OffsetDateTime expiresAt) {
        PlaceTrendResult result = BeanUtils.instantiateClass(PlaceTrendResult.class);
        ReflectionTestUtils.setField(result, "run", run);
        ReflectionTestUtils.setField(result, "place", place);
        ReflectionTestUtils.setField(result, "status", status);
        ReflectionTestUtils.setField(result, "recentInterestAverage", 70.0);
        ReflectionTestUtils.setField(result, "previousInterestAverage", 50.0);
        ReflectionTestUtils.setField(result, "interestChangePercent", interestChangePercent);
        ReflectionTestUtils.setField(result, "measuredAt", OffsetDateTime.now(ZoneOffset.UTC));
        ReflectionTestUtils.setField(result, "expiresAt", expiresAt);
        return result;
    }
}
