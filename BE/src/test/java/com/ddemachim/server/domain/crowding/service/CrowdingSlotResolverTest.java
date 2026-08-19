package com.ddemachim.server.domain.crowding.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ddemachim.server.domain.crowding.enums.CrowdingLevel;
import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class CrowdingSlotResolverTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    @Test
    void resolveFloorsSeoulTimesToThirtyMinuteBoundaries() {
        CrowdingSlotResolver resolver = resolverAt("2026-08-18T05:47:00Z");

        assertThat(resolver.resolve(OffsetDateTime.parse("2026-08-18T14:00:00+09:00")))
                .isEqualTo(OffsetDateTime.parse("2026-08-18T14:00:00+09:00"));
        assertThat(resolver.resolve(OffsetDateTime.parse("2026-08-18T14:17:00+09:00")))
                .isEqualTo(OffsetDateTime.parse("2026-08-18T14:00:00+09:00"));
        assertThat(resolver.resolve(OffsetDateTime.parse("2026-08-18T14:29:59+09:00")))
                .isEqualTo(OffsetDateTime.parse("2026-08-18T14:00:00+09:00"));
        assertThat(resolver.resolve(OffsetDateTime.parse("2026-08-18T14:30:00+09:00")))
                .isEqualTo(OffsetDateTime.parse("2026-08-18T14:30:00+09:00"));
    }

    @Test
    void resolveConvertsTheInputInstantToTheConfiguredBusinessZone() {
        CrowdingSlotResolver resolver = resolverAt("2026-08-18T05:47:00Z");

        assertThat(resolver.resolve(OffsetDateTime.parse("2026-08-18T05:47:00Z")))
                .isEqualTo(OffsetDateTime.parse("2026-08-18T14:30:00+09:00"));
        assertThat(resolver.resolveCurrent())
                .isEqualTo(OffsetDateTime.parse("2026-08-18T14:30:00+09:00"));
    }

    @Test
    void fromScoreMapsEveryFrozenBoundaryToItsLevelAndKoreanLabel() {
        assertLevel(1, CrowdingLevel.RELAXED, "여유");
        assertLevel(25, CrowdingLevel.RELAXED, "여유");
        assertLevel(26, CrowdingLevel.NORMAL, "보통");
        assertLevel(50, CrowdingLevel.NORMAL, "보통");
        assertLevel(51, CrowdingLevel.CROWDED, "약간 붐빔");
        assertLevel(75, CrowdingLevel.CROWDED, "약간 붐빔");
        assertLevel(76, CrowdingLevel.VERY_CROWDED, "붐빔");
        assertLevel(100, CrowdingLevel.VERY_CROWDED, "붐빔");
    }

    @Test
    void fromScoreRejectsValuesOutsideTheScoreContract() {
        assertThatThrownBy(() -> CrowdingLevel.fromScore(0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CrowdingLevel.fromScore(101))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static CrowdingSlotResolver resolverAt(String instant) {
        CrowdingMockProperties properties = new CrowdingMockProperties();
        Clock clock = Clock.fixed(Instant.parse(instant), SEOUL);
        return new CrowdingSlotResolver(properties, clock);
    }

    private static void assertLevel(int score, CrowdingLevel expectedLevel, String expectedLabel) {
        CrowdingLevel level = CrowdingLevel.fromScore(score);
        assertThat(level).isEqualTo(expectedLevel);
        assertThat(level.getLabel()).isEqualTo(expectedLabel);
    }
}
