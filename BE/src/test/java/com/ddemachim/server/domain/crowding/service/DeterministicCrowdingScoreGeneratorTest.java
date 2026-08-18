package com.ddemachim.server.domain.crowding.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.time.OffsetDateTime;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class DeterministicCrowdingScoreGeneratorTest {

    private static final OffsetDateTime SLOT = OffsetDateTime.parse("2026-08-18T14:00:00+09:00");

    @Test
    void generateReturnsTheSameLiteralScoreForTheSameGridAndSeoulSlot() {
        DeterministicCrowdingScoreGenerator generator = generatorWithSeed("test-seed");

        int first = generator.generate("GRID-001", SLOT);

        assertThat(first).isEqualTo(26);
        assertThat(generator.generate("GRID-001", SLOT)).isEqualTo(first);
        assertThat(generator.generate("GRID-001", OffsetDateTime.parse("2026-08-18T05:00:00Z")))
                .isEqualTo(first);
    }

    @Test
    void generateIncludesGridCodeAndSlotInTheSha256Input() {
        DeterministicCrowdingScoreGenerator generator = generatorWithSeed("test-seed");

        assertThat(generator.generate("GRID-002", SLOT)).isEqualTo(22);
        assertThat(generator.generate("GRID-001", SLOT.plusMinutes(30))).isEqualTo(56);
    }

    @Test
    void generateAlwaysReturnsScoresWithinOneAndOneHundred() {
        DeterministicCrowdingScoreGenerator generator = generatorWithSeed("test-seed");

        IntStream.range(0, 1_000)
                .map(index -> generator.generate("GRID-" + index, SLOT.plusMinutes(30L * index)))
                .forEach(score -> assertThat(score).isBetween(1, 100));
    }

    private static DeterministicCrowdingScoreGenerator generatorWithSeed(String seed) {
        CrowdingMockProperties properties = new CrowdingMockProperties();
        properties.setSeed(seed);
        return new DeterministicCrowdingScoreGenerator(properties);
    }
}
