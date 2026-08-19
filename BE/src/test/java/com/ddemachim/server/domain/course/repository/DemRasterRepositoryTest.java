package com.ddemachim.server.domain.course.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.repository.DemRasterRepository.Coordinate;
import com.ddemachim.server.domain.course.repository.DemRasterRepository.ElevationSample;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalDouble;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

@SuppressWarnings({"rawtypes", "unchecked"})
class DemRasterRepositoryTest {

    private NamedParameterJdbcTemplate jdbcTemplate;
    private DemRasterRepository repository;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(NamedParameterJdbcTemplate.class);
        repository = new DemRasterRepository(jdbcTemplate);
    }

    @Test
    void emptyBatchReturnsImmutableEmptyListWithoutQueryingTheDatabase() {
        // Mutation caught: querying for an empty batch or returning a mutable result.
        List<ElevationSample> result = repository.findElevations(List.of());

        assertThat(result).isEmpty();
        assertThatThrownBy(() -> result.add(new ElevationSample(
                0, new Coordinate(0.0, 0.0), OptionalDouble.empty())))
                .isInstanceOf(UnsupportedOperationException.class);
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void nullBatchIsRejectedBeforeQueryingTheDatabase() {
        // Mutation caught: allowing a null collection to reach SQL construction.
        assertThatThrownBy(() -> repository.findElevations(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("points");
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void nullCoordinateIsRejectedBeforeQueryingTheDatabase() {
        // Mutation caught: validating numeric fields but not null list elements.
        List<Coordinate> points = new ArrayList<>();
        points.add(new Coordinate(126.9780, 37.5665));
        points.add(null);

        assertThatThrownBy(() -> repository.findElevations(points))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("points[1]");
        verifyNoInteractions(jdbcTemplate);
    }

    @ParameterizedTest(name = "rejects invalid WGS84 coordinate {0}")
    @MethodSource("invalidCoordinates")
    void invalidCoordinateIsRejectedBeforeQueryingTheDatabase(
            Coordinate coordinate, String ignoredDescription) {
        // Mutation caught: removing finiteness or WGS84 longitude/latitude range validation.
        assertThatThrownBy(() -> repository.findElevations(List.of(coordinate)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("points[0]");
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void inclusiveWgs84BoundariesAreAccepted() throws SQLException {
        // Mutation caught: using exclusive bounds and rejecting valid WGS84 edge coordinates.
        stubRows(List.of(
                new DatabaseRow(0, null),
                new DatabaseRow(1, null),
                new DatabaseRow(2, null),
                new DatabaseRow(3, null)));

        List<ElevationSample> result = repository.findElevations(List.of(
                new Coordinate(-180.0, -90.0),
                new Coordinate(-180.0, 90.0),
                new Coordinate(180.0, -90.0),
                new Coordinate(180.0, 90.0)));

        assertThat(result).hasSize(4);
        verify(jdbcTemplate, times(1)).query(
                anyString(), any(SqlParameterSource.class), any(RowMapper.class));
    }

    @Test
    void batchUsesOneParameterizedSpatialQueryWithCoordinatesBoundInInputOrder() throws SQLException {
        // Mutation caught: issuing N queries, swapping longitude/latitude, embedding coordinate literals,
        // or omitting the required raster sampling operations.
        stubRows(List.of(
                new DatabaseRow(0, 33.719),
                new DatabaseRow(1, null),
                new DatabaseRow(2, 33.719)));
        Coordinate first = new Coordinate(126.97812345, 37.56654321);
        Coordinate second = new Coordinate(127.12345678, 38.12345678);

        repository.findElevations(List.of(first, second, first));

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<SqlParameterSource> parametersCaptor =
                ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, times(1)).query(
                sqlCaptor.capture(), parametersCaptor.capture(), any(RowMapper.class));

        String sql = sqlCaptor.getValue();
        String normalizedSql = sql.replaceAll("\\s+", " ").toLowerCase();
        assertThat(normalizedSql)
                .contains("with input(ord, longitude, latitude) as (values")
                .contains("st_transform")
                .contains("st_setsrid")
                .contains("st_makepoint")
                .contains("4326")
                .contains("5186")
                .contains("st_intersects")
                .contains("st_value")
                .contains("left join lateral")
                .contains("order by input.ord")
                .doesNotContain("126.97812345")
                .doesNotContain("37.56654321")
                .doesNotContain("127.12345678")
                .doesNotContain("38.12345678");
        assertThat(sql).contains(":longitude0", ":latitude0", ":longitude1", ":latitude1",
                ":longitude2", ":latitude2");

        SqlParameterSource parameters = parametersCaptor.getValue();
        assertThat(parameters.getValue("longitude0")).isEqualTo(126.97812345);
        assertThat(parameters.getValue("latitude0")).isEqualTo(37.56654321);
        assertThat(parameters.getValue("longitude1")).isEqualTo(127.12345678);
        assertThat(parameters.getValue("latitude1")).isEqualTo(38.12345678);
        assertThat(parameters.getValue("longitude2")).isEqualTo(126.97812345);
        assertThat(parameters.getValue("latitude2")).isEqualTo(37.56654321);
    }

    @Test
    void mappedResultsPreserveInputOrderDuplicatesAndExplicitAbsence() throws SQLException {
        // Mutation caught: deduplicating/reordering input or mapping SQL NULL to an ambiguous raw null.
        Coordinate repeated = new Coordinate(126.9780, 37.5665);
        Coordinate outsideRaster = new Coordinate(0.0, 0.0);
        stubRows(List.of(
                new DatabaseRow(0, 33.719),
                new DatabaseRow(1, null),
                new DatabaseRow(2, 33.719)));

        List<ElevationSample> result =
                repository.findElevations(List.of(repeated, outsideRaster, repeated));

        assertThat(result).containsExactly(
                new ElevationSample(0, repeated, OptionalDouble.of(33.719)),
                new ElevationSample(1, outsideRaster, OptionalDouble.empty()),
                new ElevationSample(2, repeated, OptionalDouble.of(33.719)));
        assertThatThrownBy(() -> result.add(result.getFirst()))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void databaseFailurePropagatesToTheCaller() {
        // Mutation caught: swallowing database failures and fabricating absent elevations.
        DataAccessResourceFailureException failure =
                new DataAccessResourceFailureException("database unavailable");
        when(jdbcTemplate.query(
                anyString(), any(SqlParameterSource.class), any(RowMapper.class)))
                .thenThrow(failure);

        assertThatThrownBy(() -> repository.findElevations(
                List.of(new Coordinate(126.9780, 37.5665))))
                .isSameAs(failure);
    }

    @Test
    void missingDatabaseRowIsRejectedInsteadOfShorteningTheResult() throws SQLException {
        // Mutation caught: silently returning fewer samples than requested.
        stubRows(List.of(new DatabaseRow(0, 33.719)));

        assertThatThrownBy(() -> repository.findElevations(List.of(
                new Coordinate(126.9780, 37.5665),
                new Coordinate(127.0, 37.5))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cardinality");
    }

    @Test
    void outOfOrderDatabaseRowsAreRejectedInsteadOfMisassigningElevations() throws SQLException {
        // Mutation caught: assigning elevations by returned list position without checking ordinals.
        stubRows(List.of(
                new DatabaseRow(1, 12.0),
                new DatabaseRow(0, 34.0)));

        assertThatThrownBy(() -> repository.findElevations(List.of(
                new Coordinate(126.9780, 37.5665),
                new Coordinate(127.0, 37.5))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ordinal");
    }

    private static List<Arguments> invalidCoordinates() {
        return List.of(
                Arguments.of(new Coordinate(Double.NaN, 0.0), "NaN longitude"),
                Arguments.of(new Coordinate(Double.POSITIVE_INFINITY, 0.0), "+infinite longitude"),
                Arguments.of(new Coordinate(Double.NEGATIVE_INFINITY, 0.0), "-infinite longitude"),
                Arguments.of(new Coordinate(0.0, Double.NaN), "NaN latitude"),
                Arguments.of(new Coordinate(0.0, Double.POSITIVE_INFINITY), "+infinite latitude"),
                Arguments.of(new Coordinate(0.0, Double.NEGATIVE_INFINITY), "-infinite latitude"),
                Arguments.of(new Coordinate(-180.000001, 0.0), "longitude below minimum"),
                Arguments.of(new Coordinate(180.000001, 0.0), "longitude above maximum"),
                Arguments.of(new Coordinate(0.0, -90.000001), "latitude below minimum"),
                Arguments.of(new Coordinate(0.0, 90.000001), "latitude above maximum"));
    }

    private void stubRows(List<DatabaseRow> rows) throws SQLException {
        when(jdbcTemplate.query(
                anyString(), any(SqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> {
                    RowMapper mapper = invocation.getArgument(2);
                    List<Object> mappedRows = new ArrayList<>();
                    for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
                        DatabaseRow row = rows.get(rowIndex);
                        ResultSet resultSet = mock(ResultSet.class);
                        when(resultSet.getInt("ord")).thenReturn(row.ordinal());
                        when(resultSet.wasNull()).thenReturn(false);
                        when(resultSet.getObject("elevation", Double.class))
                                .thenReturn(row.elevation());
                        mappedRows.add(mapper.mapRow(resultSet, rowIndex));
                    }
                    return mappedRows;
                });
    }

    private record DatabaseRow(int ordinal, Double elevation) {
    }
}
