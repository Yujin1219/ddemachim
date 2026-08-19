package com.ddemachim.server.domain.crowding.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

@ExtendWith(OutputCaptureExtension.class)
class CrowdingRedisCacheTest {

    private static final OffsetDateTime SLOT = OffsetDateTime.parse("2026-08-18T14:00:00+09:00");
    private static final String GRID_1_KEY = "crowding:v1:GRID-001:2026-08-18:14:00";
    private static final String GRID_2_KEY = "crowding:v1:GRID-002:2026-08-18:14:00";

    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> operations;
    private CrowdingRedisCache cache;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        CrowdingMockProperties properties = new CrowdingMockProperties();
        properties.setSeed("test-seed");
        redisTemplate = mock(StringRedisTemplate.class);
        operations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(operations);
        cache = new CrowdingRedisCache(
                redisTemplate,
                new DeterministicCrowdingScoreGenerator(properties),
                properties);
    }

    @Test
    void resolveScoresUsesOneMultiGetForUniqueGridCodes() {
        List<String> keys = List.of(GRID_1_KEY, GRID_2_KEY);
        when(operations.multiGet(keys)).thenReturn(List.of("25", "76"));

        Map<String, Integer> scores = cache.resolveScores(
                List.of("GRID-001", "GRID-001", "GRID-002"),
                SLOT);

        assertThat(scores).containsExactly(
                Map.entry("GRID-001", 25),
                Map.entry("GRID-002", 76));
        verify(operations).multiGet(keys);
        verify(operations, never()).setIfAbsent(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void resolveScoresGeneratesAMissAndStoresItWithTheConfiguredTtl() {
        when(operations.multiGet(List.of(GRID_1_KEY)))
                .thenReturn(Collections.singletonList(null));
        when(operations.setIfAbsent(GRID_1_KEY, "26", Duration.ofHours(24)))
                .thenReturn(true);

        Map<String, Integer> scores = cache.resolveScores(List.of("GRID-001"), SLOT);

        assertThat(scores).containsExactly(Map.entry("GRID-001", 26));
        verify(operations).setIfAbsent(GRID_1_KEY, "26", Duration.ofHours(24));
    }

    @Test
    void resolveScoresReadsTheWinnerAfterLosingTheFirstWriteRace() {
        when(operations.multiGet(List.of(GRID_1_KEY)))
                .thenReturn(Collections.singletonList(null));
        when(operations.setIfAbsent(GRID_1_KEY, "26", Duration.ofHours(24)))
                .thenReturn(false);
        when(operations.get(GRID_1_KEY)).thenReturn("87");

        Map<String, Integer> scores = cache.resolveScores(List.of("GRID-001"), SLOT);

        assertThat(scores).containsExactly(Map.entry("GRID-001", 87));
        verify(operations).get(GRID_1_KEY);
    }

    @Test
    void resolveScoresFallsBackForMalformedOrOutOfRangeValues() {
        when(operations.multiGet(List.of(GRID_1_KEY, GRID_2_KEY)))
                .thenReturn(List.of("not-a-score", "101"));

        Map<String, Integer> scores = cache.resolveScores(List.of("GRID-001", "GRID-002"), SLOT);

        assertThat(scores).containsExactly(
                Map.entry("GRID-001", 26),
                Map.entry("GRID-002", 22));
    }

    @Test
    void resolveScoresFallsBackWhenRedisReadFails() {
        when(operations.multiGet(List.of(GRID_1_KEY, GRID_2_KEY)))
                .thenThrow(new RedisConnectionFailureException("unavailable"));

        Map<String, Integer> scores = cache.resolveScores(List.of("GRID-001", "GRID-002"), SLOT);

        assertThat(scores).containsExactly(
                Map.entry("GRID-001", 26),
                Map.entry("GRID-002", 22));
    }

    @Test
    void resolveScoresFallsBackWhenRedisWriteFails() {
        when(operations.multiGet(List.of(GRID_1_KEY)))
                .thenReturn(Collections.singletonList(null));
        when(operations.setIfAbsent(GRID_1_KEY, "26", Duration.ofHours(24)))
                .thenThrow(new RedisConnectionFailureException("unavailable"));

        Map<String, Integer> scores = cache.resolveScores(List.of("GRID-001"), SLOT);

        assertThat(scores).containsExactly(Map.entry("GRID-001", 26));
    }

    @Test
    void resolveScoresStopsRedisAccessAfterTheFirstWriteFailure(CapturedOutput output) {
        when(operations.multiGet(List.of(GRID_1_KEY, GRID_2_KEY)))
                .thenReturn(java.util.Arrays.asList((String) null, null));
        when(operations.setIfAbsent(anyString(), anyString(), eq(Duration.ofHours(24))))
                .thenThrow(new RedisConnectionFailureException("unavailable"));

        Map<String, Integer> scores = cache.resolveScores(List.of("GRID-001", "GRID-002"), SLOT);

        assertThat(scores).containsExactly(
                Map.entry("GRID-001", 26),
                Map.entry("GRID-002", 22));
        verify(operations, times(1))
                .setIfAbsent(anyString(), anyString(), eq(Duration.ofHours(24)));
        verify(operations, never()).get(anyString());
        assertThat(output.getAll())
                .containsOnlyOnce("Redis crowding cache operation failed; using deterministic fallback");
    }

    @Test
    void resolveScoresSkipsRedisForAnEmptyBatch() {
        assertThat(cache.resolveScores(List.of(), SLOT)).isEmpty();

        verify(operations, never()).multiGet(any());
    }
}
