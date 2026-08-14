package com.ddemachim.server.domain.place.entity;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import jakarta.persistence.FetchType;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class PlaceTrendEntityMappingTest {

    private static final String ENTITY_PACKAGE = "com.ddemachim.server.domain.place.entity.";

    @Test
    void trendEntitiesMapToNormalizedTablesWithExpectedIdentities() throws Exception {
        Class<?> observation = loadClass(ENTITY_PACKAGE + "BlogTrendObservation");
        Class<?> snapshot = loadClass(ENTITY_PACKAGE + "PlaceTrendSnapshot");

        assertThat(observation).isNotNull();
        assertThat(snapshot).isNotNull();
        assertTableIdentity(
                observation,
                "blog_trend_observation",
                Set.of("collection_date", "query", "post_url"));
        assertTableIdentity(
                snapshot,
                "place_trend_snapshot",
                Set.of("place_id", "snapshot_date"));
    }

    @Test
    void snapshotKeepsTrendAndSearchTrendStateWithoutBlogExplanationFields() {
        Class<?> observation = loadClass(ENTITY_PACKAGE + "BlogTrendObservation");
        Class<?> snapshot = loadClass(ENTITY_PACKAGE + "PlaceTrendSnapshot");

        assertThat(observation).isNotNull();
        assertThat(snapshot).isNotNull();
        Set<String> observationFieldNames = Arrays.stream(observation.getDeclaredFields())
                .map(Field::getName)
                .collect(Collectors.toSet());
        Set<String> fieldNames = Arrays.stream(snapshot.getDeclaredFields())
                .map(Field::getName)
                .collect(Collectors.toSet());

        assertThat(fieldNames).contains(
                "status",
                "snapshotDate",
                "trendAvailable",
                "trendRising",
                "trendRatio",
                "recentTrendValue",
                "previousTrendValue",
                "recentNonzeroObservations",
                "baselineNonzeroObservations",
                "trendReason",
                "trendCheckedAt");
        assertThat(fieldNames).doesNotContain(
                "explanationAvailable",
                "explanationSummary",
                "explanationSource",
                "explanationMinimumAuthors",
                "explanationReason");
        assertThat(observationFieldNames).doesNotContain("bodyTopicCandidates");
    }

    @Test
    void snapshotStatusUsesStringEnumAndPlaceAssociationsAreLazy() throws Exception {
        Class<?> observation = loadClass(ENTITY_PACKAGE + "BlogTrendObservation");
        Class<?> snapshot = loadClass(ENTITY_PACKAGE + "PlaceTrendSnapshot");

        assertThat(observation).isNotNull();
        assertThat(snapshot).isNotNull();

        Enumerated enumerated = snapshot.getDeclaredField("status").getAnnotation(Enumerated.class);
        assertThat(enumerated).isNotNull();
        assertThat(enumerated.value()).isEqualTo(EnumType.STRING);
        assertLazyManyToOne(observation.getDeclaredField("place"));
        assertLazyManyToOne(snapshot.getDeclaredField("place"));
    }

    private static Class<?> loadClass(String name) {
        try {
            return Class.forName(name);
        } catch (ClassNotFoundException exception) {
            return null;
        }
    }

    private static void assertTableIdentity(
            Class<?> entityType, String tableName, Set<String> expectedColumns) {
        Table table = entityType.getAnnotation(Table.class);
        assertThat(table).isNotNull();
        assertThat(table.name()).isEqualTo(tableName);
        assertThat(Arrays.stream(table.uniqueConstraints())
                        .map(UniqueConstraint::columnNames)
                        .map(Set::of)
                        .collect(Collectors.toSet()))
                .contains(expectedColumns);
    }

    private static void assertLazyManyToOne(Field field) {
        ManyToOne association = field.getAnnotation(ManyToOne.class);
        assertThat(association).isNotNull();
        assertThat(association.fetch()).isEqualTo(FetchType.LAZY);
    }
}
