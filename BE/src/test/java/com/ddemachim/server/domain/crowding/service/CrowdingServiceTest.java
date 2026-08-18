package com.ddemachim.server.domain.crowding.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.crowding.dto.CrowdingRequest;
import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.entity.CrowdingGrid;
import com.ddemachim.server.domain.crowding.enums.CrowdingLevel;
import com.ddemachim.server.domain.crowding.exception.CrowdingErrorStatus;
import com.ddemachim.server.domain.crowding.exception.CrowdingException;
import com.ddemachim.server.domain.crowding.repository.CrowdingGridRepository;
import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;

@ExtendWith(MockitoExtension.class)
class CrowdingServiceTest {

    private static final GeometryFactory GEOMETRY_FACTORY =
            new GeometryFactory(new PrecisionModel(), 4326);
    private static final OffsetDateTime REQUEST_TIME =
            OffsetDateTime.parse("2026-08-18T14:17:00+09:00");
    private static final OffsetDateTime SLOT_START =
            OffsetDateTime.parse("2026-08-18T14:00:00+09:00");

    @Mock
    private CrowdingGridRepository crowdingGridRepository;

    @Mock
    private CrowdingRedisCache crowdingRedisCache;

    @Mock
    private CrowdingSlotResolver crowdingSlotResolver;

    private CrowdingMockProperties properties;
    private CrowdingService crowdingService;

    @BeforeEach
    void setUp() {
        properties = new CrowdingMockProperties();
        properties.setMaximumViewportGrids(2);
        properties.setMaximumBatchPoints(2);
        crowdingService = new CrowdingService(
                crowdingGridRepository,
                new CrowdingGridLocator(),
                crowdingRedisCache,
                crowdingSlotResolver,
                properties);
    }

    @Test
    void viewportMapsLongitudeLatitudePolygonAndMockScoreMetadata() {
        CrowdingGrid grid = grid(
                "G-100-100",
                polygon(126.970, 37.570, 126.980, 37.580));
        when(crowdingGridRepository.findIntersectingBounds(
                        37.569, 37.581, 126.969, 126.981, 3))
                .thenReturn(List.of(grid));
        when(crowdingSlotResolver.resolve(REQUEST_TIME)).thenReturn(SLOT_START);
        when(crowdingRedisCache.resolveScores(anyCollection(), eq(SLOT_START)))
                .thenReturn(Map.of("G-100-100", 76));

        List<CrowdingResponse.Grid> result = crowdingService.getViewportGrids(
                37.569,
                37.581,
                126.969,
                126.981,
                REQUEST_TIME);

        assertThat(result).hasSize(1);
        CrowdingResponse.Grid response = result.getFirst();
        assertThat(response.gridCode()).isEqualTo("G-100-100");
        assertThat(response.coordinates().getFirst().getFirst())
                .containsExactly(126.970, 37.570);
        assertThat(response.score()).isEqualTo(76);
        assertThat(response.level()).isEqualTo(CrowdingLevel.VERY_CROWDED);
        assertThat(response.levelLabel()).isEqualTo("붐빔");
        assertThat(response.mock()).isTrue();
        assertThat(response.slotStart()).isEqualTo(SLOT_START);
        assertThat(response.slotEnd()).isEqualTo(SLOT_START.plusMinutes(30));
    }

    @Test
    void viewportRejectsLimitPlusOneBeforeResolvingScores() {
        when(crowdingGridRepository.findIntersectingBounds(
                        37.50, 37.70, 126.90, 127.10, 3))
                .thenReturn(List.of(
                        grid("G-1", polygon(126.91, 37.51, 126.92, 37.52)),
                        grid("G-2", polygon(126.93, 37.53, 126.94, 37.54)),
                        grid("G-3", polygon(126.95, 37.55, 126.96, 37.56))));

        assertThatThrownBy(() -> crowdingService.getViewportGrids(
                        37.50,
                        37.70,
                        126.90,
                        127.10,
                        REQUEST_TIME))
                .isInstanceOfSatisfying(CrowdingException.class, exception -> assertThat(
                                exception.getErrorReasonHttpStatus().getCode())
                        .isEqualTo(CrowdingErrorStatus.VIEWPORT_LIMIT_EXCEEDED.getCode()));

        verifyNoInteractions(crowdingRedisCache, crowdingSlotResolver);
    }

    @Test
    void invalidViewportBoundsUseTypedBadRequest() {
        assertThatThrownBy(() -> crowdingService.getViewportGrids(
                        37.60,
                        37.50,
                        126.90,
                        127.10,
                        REQUEST_TIME))
                .isInstanceOfSatisfying(CrowdingException.class, exception -> assertThat(
                                exception.getErrorReasonHttpStatus().getCode())
                        .isEqualTo(CrowdingErrorStatus.INVALID_BOUNDS.getCode()));

        verifyNoInteractions(crowdingGridRepository, crowdingRedisCache, crowdingSlotResolver);
    }

    @Test
    void pointBatchQueriesBoundsOnceReusesGridScoreAndPreservesReferences() {
        properties.setMaximumBatchPoints(3);
        CrowdingGrid grid = grid(
                "G-100-100",
                polygon(126.970, 37.570, 126.980, 37.580));
        when(crowdingGridRepository.findIntersectingBounds(
                        anyDouble(), anyDouble(), anyDouble(), anyDouble(), eq(12_001)))
                .thenReturn(List.of(grid));
        when(crowdingSlotResolver.resolve(REQUEST_TIME)).thenReturn(SLOT_START);
        when(crowdingRedisCache.resolveScores(anyCollection(), eq(SLOT_START)))
                .thenReturn(Map.of("G-100-100", 42));
        CrowdingRequest.Points request = new CrowdingRequest.Points(
                REQUEST_TIME,
                List.of(
                        new CrowdingRequest.Point("place:101", 37.575, 126.975),
                        new CrowdingRequest.Point("event:202", 37.576, 126.976),
                        new CrowdingRequest.Point("place:outside", 37.590, 126.990)));

        List<CrowdingResponse.Point> result = crowdingService.getPointCrowding(request);

        assertThat(result).extracting(CrowdingResponse.Point::referenceId)
                .containsExactly("place:101", "event:202", "place:outside");
        assertThat(result.get(0).covered()).isTrue();
        assertThat(result.get(0).gridCode()).isEqualTo("G-100-100");
        assertThat(result.get(0).score()).isEqualTo(42);
        assertThat(result.get(1).score()).isEqualTo(42);
        assertThat(result.get(2).covered()).isFalse();
        assertThat(result.get(2).gridCode()).isNull();
        assertThat(result.get(2).score()).isNull();
        assertThat(result.get(2).level()).isNull();
        assertThat(result.get(2).mock()).isTrue();
        assertThat(result.get(2).slotStart()).isEqualTo(SLOT_START);
        assertThat(result.get(2).slotEnd()).isEqualTo(SLOT_START.plusMinutes(30));

        verify(crowdingGridRepository, times(1)).findIntersectingBounds(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), eq(12_001));
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<String>> gridCodes = ArgumentCaptor.forClass(Collection.class);
        verify(crowdingRedisCache, times(1)).resolveScores(gridCodes.capture(), eq(SLOT_START));
        assertThat(gridCodes.getValue()).containsExactly("G-100-100");
    }

    @Test
    void boundaryPointUsesStableLowestGridCodeTieBreak() {
        CrowdingGrid gridB = grid(
                "G-B",
                polygon(126.970, 37.570, 126.980, 37.580));
        CrowdingGrid gridA = grid(
                "G-A",
                polygon(126.980, 37.570, 126.990, 37.580));
        when(crowdingGridRepository.findIntersectingBounds(
                        anyDouble(), anyDouble(), anyDouble(), anyDouble(), eq(12_001)))
                .thenReturn(List.of(gridB, gridA));
        when(crowdingSlotResolver.resolve(REQUEST_TIME)).thenReturn(SLOT_START);
        when(crowdingRedisCache.resolveScores(anyCollection(), eq(SLOT_START)))
                .thenReturn(Map.of("G-A", 25));

        List<CrowdingResponse.Point> result = crowdingService.getPointCrowding(
                new CrowdingRequest.Points(
                        REQUEST_TIME,
                        List.of(new CrowdingRequest.Point(
                                "boundary", 37.575, 126.980))));

        assertThat(result.getFirst().gridCode()).isEqualTo("G-A");
        assertThat(result.getFirst().level()).isEqualTo(CrowdingLevel.RELAXED);
        verify(crowdingRedisCache).resolveScores(anyCollection(), eq(SLOT_START));
    }

    @Test
    void pointBatchRejectsConfiguredLimitBeforeQuerying() {
        CrowdingRequest.Points request = new CrowdingRequest.Points(
                REQUEST_TIME,
                List.of(
                        new CrowdingRequest.Point("1", 37.575, 126.975),
                        new CrowdingRequest.Point("2", 37.576, 126.976),
                        new CrowdingRequest.Point("3", 37.577, 126.977)));

        assertThatThrownBy(() -> crowdingService.getPointCrowding(request))
                .isInstanceOfSatisfying(CrowdingException.class, exception -> assertThat(
                                exception.getErrorReasonHttpStatus().getCode())
                        .isEqualTo(CrowdingErrorStatus.BATCH_LIMIT_EXCEEDED.getCode()));

        verifyNoInteractions(crowdingGridRepository, crowdingRedisCache, crowdingSlotResolver);
    }

    @Test
    void pointBatchRejectsCandidateLimitPlusOneInsteadOfPartiallyMatching() {
        CrowdingGrid candidate = grid(
                "G-100-100",
                polygon(126.970, 37.570, 126.980, 37.580));
        when(crowdingGridRepository.findIntersectingBounds(
                        anyDouble(), anyDouble(), anyDouble(), anyDouble(), eq(12_001)))
                .thenReturn(Collections.nCopies(12_001, candidate));

        assertThatThrownBy(() -> crowdingService.getPointCrowding(
                        new CrowdingRequest.Points(
                                REQUEST_TIME,
                                List.of(new CrowdingRequest.Point(
                                        "wide-batch", 37.575, 126.975)))))
                .isInstanceOfSatisfying(CrowdingException.class, exception -> assertThat(
                                exception.getErrorReasonHttpStatus().getCode())
                        .isEqualTo(CrowdingErrorStatus.BATCH_AREA_LIMIT_EXCEEDED.getCode()));

        verifyNoInteractions(crowdingRedisCache);
    }

    @Test
    void invalidPointCoordinateUsesTypedBadRequest() {
        CrowdingRequest.Points request = new CrowdingRequest.Points(
                REQUEST_TIME,
                List.of(new CrowdingRequest.Point("invalid", 91.0, 126.975)));

        assertThatThrownBy(() -> crowdingService.getPointCrowding(request))
                .isInstanceOfSatisfying(CrowdingException.class, exception -> assertThat(
                                exception.getErrorReasonHttpStatus().getCode())
                        .isEqualTo(CrowdingErrorStatus.INVALID_POINTS.getCode()));

        verifyNoInteractions(crowdingGridRepository, crowdingRedisCache, crowdingSlotResolver);
    }

    @Test
    void redisOutageStillReturnsCoveredDeterministicResult() {
        StringRedisTemplate unavailableRedis = mock(StringRedisTemplate.class);
        when(unavailableRedis.opsForValue())
                .thenThrow(new RedisConnectionFailureException("offline"));
        CrowdingRedisCache fallbackCache = new CrowdingRedisCache(
                unavailableRedis,
                new DeterministicCrowdingScoreGenerator(properties),
                properties);
        CrowdingService serviceWithFallback = new CrowdingService(
                crowdingGridRepository,
                new CrowdingGridLocator(),
                fallbackCache,
                crowdingSlotResolver,
                properties);
        when(crowdingGridRepository.findIntersectingBounds(
                        anyDouble(), anyDouble(), anyDouble(), anyDouble(), eq(12_001)))
                .thenReturn(List.of(grid(
                        "G-100-100",
                        polygon(126.970, 37.570, 126.980, 37.580))));
        when(crowdingSlotResolver.resolve(REQUEST_TIME)).thenReturn(SLOT_START);

        List<CrowdingResponse.Point> result = serviceWithFallback.getPointCrowding(
                new CrowdingRequest.Points(
                        REQUEST_TIME,
                        List.of(new CrowdingRequest.Point(
                                "place:101", 37.575, 126.975))));

        assertThat(result.getFirst().covered()).isTrue();
        assertThat(result.getFirst().score()).isBetween(1, 100);
        assertThat(result.getFirst().mock()).isTrue();
    }

    @Test
    void repositoryFailureBecomesTypedServerError() {
        when(crowdingGridRepository.findIntersectingBounds(
                        37.50, 37.60, 126.90, 127.00, 3))
                .thenThrow(new IllegalStateException("database unavailable"));

        assertThatThrownBy(() -> crowdingService.getViewportGrids(
                        37.50,
                        37.60,
                        126.90,
                        127.00,
                        REQUEST_TIME))
                .isInstanceOfSatisfying(CrowdingException.class, exception -> assertThat(
                                exception.getErrorReasonHttpStatus().getCode())
                        .isEqualTo(CrowdingErrorStatus.GRID_QUERY_FAILED.getCode()));

        verify(crowdingRedisCache, never()).resolveScores(anyCollection(), eq(SLOT_START));
    }

    private static CrowdingGrid grid(String gridCode, Polygon polygon) {
        return CrowdingGrid.create(
                gridCode,
                100,
                100,
                polygon,
                polygon.getCentroid().getY(),
                polygon.getCentroid().getX());
    }

    private static Polygon polygon(
            double minLongitude,
            double minLatitude,
            double maxLongitude,
            double maxLatitude) {
        return GEOMETRY_FACTORY.createPolygon(new Coordinate[] {
            new Coordinate(minLongitude, minLatitude),
            new Coordinate(maxLongitude, minLatitude),
            new Coordinate(maxLongitude, maxLatitude),
            new Coordinate(minLongitude, maxLatitude),
            new Coordinate(minLongitude, minLatitude)
        });
    }
}
