package com.ddemachim.server.domain.crowding.service;

import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.stereotype.Service;

@Service
public class CrowdingRedisCache {

    private static final Logger log = LoggerFactory.getLogger(CrowdingRedisCache.class);
    private static final DateTimeFormatter KEY_SLOT_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd:HH:mm", Locale.ROOT);

    private final StringRedisTemplate redisTemplate;
    private final DeterministicCrowdingScoreGenerator scoreGenerator;
    private final Duration ttl;
    private final ZoneId zoneId;

    public CrowdingRedisCache(
            StringRedisTemplate redisTemplate,
            DeterministicCrowdingScoreGenerator scoreGenerator,
            CrowdingMockProperties properties) {
        this.redisTemplate = redisTemplate;
        this.scoreGenerator = scoreGenerator;
        this.ttl = properties.getTtl();
        this.zoneId = properties.zoneId();
    }

    public Map<String, Integer> resolveScores(
            Collection<String> gridCodes,
            OffsetDateTime slotStart) {
        List<String> uniqueGridCodes = new ArrayList<>(
                new LinkedHashSet<>(Objects.requireNonNull(gridCodes)));
        if (uniqueGridCodes.isEmpty()) {
            return Map.of();
        }

        OffsetDateTime businessSlot = Objects.requireNonNull(slotStart)
                .atZoneSameInstant(zoneId)
                .toOffsetDateTime();
        List<String> keys = uniqueGridCodes.stream()
                .map(gridCode -> keyFor(gridCode, businessSlot))
                .toList();

        ValueOperations<String, String> operations;
        List<String> cachedValues;
        try {
            operations = redisTemplate.opsForValue();
            cachedValues = operations.multiGet(keys);
        } catch (RuntimeException exception) {
            warnRedisFailure(exception);
            return generateAll(uniqueGridCodes, businessSlot);
        }

        Map<String, Integer> scores = new LinkedHashMap<>();
        boolean isRedisAvailableForMisses = true;
        for (int index = 0; index < uniqueGridCodes.size(); index++) {
            String gridCode = uniqueGridCodes.get(index);
            String cachedValue = valueAt(cachedValues, index);
            Integer cachedScore = parseCachedScore(cachedValue);
            if (cachedScore != null) {
                scores.put(gridCode, cachedScore);
                continue;
            }

            int generatedScore = scoreGenerator.generate(gridCode, businessSlot);
            if (cachedValue == null && isRedisAvailableForMisses) {
                RedisMissResult missResult = storeMissOrReadWinner(
                        operations,
                        keys.get(index),
                        generatedScore);
                generatedScore = missResult.score();
                isRedisAvailableForMisses = missResult.isRedisAvailable();
            }
            scores.put(gridCode, generatedScore);
        }
        return scores;
    }

    private RedisMissResult storeMissOrReadWinner(
            ValueOperations<String, String> operations,
            String key,
            int generatedScore) {
        try {
            Boolean stored = operations.setIfAbsent(
                    key,
                    Integer.toString(generatedScore),
                    ttl);
            if (Boolean.FALSE.equals(stored)) {
                Integer winningScore = parseCachedScore(operations.get(key));
                if (winningScore != null) {
                    return new RedisMissResult(winningScore, true);
                }
            }
        } catch (RuntimeException exception) {
            warnRedisFailure(exception);
            return new RedisMissResult(generatedScore, false);
        }
        return new RedisMissResult(generatedScore, true);
    }

    private Map<String, Integer> generateAll(
            List<String> gridCodes,
            OffsetDateTime businessSlot) {
        Map<String, Integer> scores = new LinkedHashMap<>();
        gridCodes.forEach(gridCode -> scores.put(
                gridCode,
                scoreGenerator.generate(gridCode, businessSlot)));
        return scores;
    }

    private Integer parseCachedScore(String cachedValue) {
        if (cachedValue == null) {
            return null;
        }
        try {
            int score = Integer.parseInt(cachedValue);
            if (score >= 1 && score <= 100) {
                return score;
            }
        } catch (NumberFormatException ignored) {
            // The warning below deliberately excludes the cached value.
        }
        log.warn("Ignoring a malformed crowding cache value; using deterministic fallback.");
        return null;
    }

    private String keyFor(String gridCode, OffsetDateTime businessSlot) {
        return "crowding:v1:"
                + Objects.requireNonNull(gridCode)
                + ":"
                + KEY_SLOT_FORMATTER.format(businessSlot);
    }

    private static String valueAt(List<String> values, int index) {
        if (values == null || index >= values.size()) {
            return null;
        }
        return values.get(index);
    }

    private static void warnRedisFailure(RuntimeException exception) {
        log.warn(
                "Redis crowding cache operation failed; using deterministic fallback ({}).",
                exception.getClass().getSimpleName());
    }

    private record RedisMissResult(int score, boolean isRedisAvailable) {
    }
}
