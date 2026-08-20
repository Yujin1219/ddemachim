package com.ddemachim.server.domain.place.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.place.enums.BlogTrendRunStatus;
import com.ddemachim.server.domain.place.enums.PlaceTrendStatus;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
    void trendEntitiesMapToFinalTablesWithExpectedIdentities() throws Exception {
        Class<?> run = loadClass(ENTITY_PACKAGE + "BlogTrendRun");
        Class<?> result = loadClass(ENTITY_PACKAGE + "PlaceTrendResult");

        assertThat(run).isNotNull();
        assertThat(result).isNotNull();
        assertThat(loadClass(ENTITY_PACKAGE + "BlogTrendObservation")).isNull();
        assertThat(loadClass(ENTITY_PACKAGE + "PlaceTrendSnapshot")).isNull();
        assertTableIdentity(run, "blog_trend_run", Set.of("run_week"));
        assertTableIdentity(result, "place_trend_result", Set.of("run_id", "place_id"));
    }

    @Test
    void finalEntitiesContainOnlyContractFields() throws Exception {
        Class<?> run = loadClass(ENTITY_PACKAGE + "BlogTrendRun");
        Class<?> result = loadClass(ENTITY_PACKAGE + "PlaceTrendResult");

        assertThat(Arrays.stream(run.getDeclaredFields()).map(Field::getName).collect(Collectors.toSet()))
                .contains(
                        "id",
                        "runWeek",
                        "status",
                        "startedAt",
                        "finishedAt",
                        "processedPlaceCount",
                        "resultCount",
                        "failureReason",
                        "createdAt",
                        "updatedAt");
        assertThat(Arrays.stream(result.getDeclaredFields()).map(Field::getName).collect(Collectors.toSet()))
                .contains(
                        "id",
                        "run",
                        "place",
                        "status",
                        "recentInterestAverage",
                        "previousInterestAverage",
                        "interestChangePercent",
                        "measuredAt",
                        "expiresAt",
                        "createdAt",
                        "updatedAt");
        assertThat(Arrays.stream(result.getDeclaredFields()).map(Field::getName).collect(Collectors.toSet()))
                .doesNotContain("snapshotDate", "trendAvailable", "trendReason", "semantics");
        assertThat(BlogTrendRunStatus.values()).containsExactly(
                BlogTrendRunStatus.RUNNING, BlogTrendRunStatus.SUCCESS, BlogTrendRunStatus.FAILED);
        assertThat(PlaceTrendStatus.values()).containsExactly(
                PlaceTrendStatus.WATCH, PlaceTrendStatus.TRENDING);
    }

    @Test
    void statusesUseStringEnumsAndBothResultAssociationsAreLazy() throws Exception {
        Class<?> run = loadClass(ENTITY_PACKAGE + "BlogTrendRun");
        Class<?> result = loadClass(ENTITY_PACKAGE + "PlaceTrendResult");

        Enumerated runStatus = run.getDeclaredField("status").getAnnotation(Enumerated.class);
        Enumerated resultStatus = result.getDeclaredField("status").getAnnotation(Enumerated.class);
        assertThat(runStatus).isNotNull();
        assertThat(runStatus.value()).isEqualTo(EnumType.STRING);
        assertThat(resultStatus).isNotNull();
        assertThat(resultStatus.value()).isEqualTo(EnumType.STRING);
        assertLazyManyToOne(result.getDeclaredField("run"));
        assertLazyManyToOne(result.getDeclaredField("place"));
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
