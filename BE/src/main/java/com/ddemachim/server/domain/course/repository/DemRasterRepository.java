package com.ddemachim.server.domain.course.repository;

import java.util.ArrayList;
import java.util.List;
import java.util.OptionalDouble;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DemRasterRepository {

    private static final String QUERY_PREFIX = """
            WITH input(ord, longitude, latitude) AS (VALUES
            """;

    private static final String QUERY_SUFFIX = """
            ),
            transformed AS (
                SELECT
                    input.ord,
                    input.longitude,
                    input.latitude,
                    ST_Transform(
                        ST_SetSRID(ST_MakePoint(input.longitude, input.latitude), 4326),
                        5186
                    ) AS point
                FROM input
            )
            SELECT input.ord, candidate.elevation
            FROM transformed input
            LEFT JOIN LATERAL (
                SELECT sampled.elevation
                FROM (
                    SELECT
                        ST_Value(dem.rast, 1, input.point, true) AS elevation,
                        dem.rid
                    FROM public.dem_jongno dem
                    WHERE ST_Intersects(dem.rast, input.point)
                ) sampled
                ORDER BY (sampled.elevation IS NULL), sampled.rid
                LIMIT 1
            ) candidate ON TRUE
            ORDER BY input.ord
            """;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public DemRasterRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ElevationSample> findElevations(List<Coordinate> points) {
        List<Coordinate> validatedPoints = validateAndCopy(points);
        if (validatedPoints.isEmpty()) {
            return List.of();
        }

        MapSqlParameterSource parameters = new MapSqlParameterSource();
        String sql = buildQuery(validatedPoints, parameters);
        List<DatabaseElevation> rows = jdbcTemplate.query(
                sql,
                parameters,
                (resultSet, rowNumber) -> new DatabaseElevation(
                        resultSet.getInt("ord"),
                        resultSet.getObject("elevation", Double.class)));

        verifyRows(rows, validatedPoints.size());

        List<ElevationSample> samples = new ArrayList<>(validatedPoints.size());
        for (int ordinal = 0; ordinal < validatedPoints.size(); ordinal++) {
            Double elevation = rows.get(ordinal).elevation();
            samples.add(new ElevationSample(
                    ordinal,
                    validatedPoints.get(ordinal),
                    elevation == null ? OptionalDouble.empty() : OptionalDouble.of(elevation)));
        }
        return List.copyOf(samples);
    }

    private List<Coordinate> validateAndCopy(List<Coordinate> points) {
        if (points == null) {
            throw new IllegalArgumentException("points must not be null");
        }

        for (int index = 0; index < points.size(); index++) {
            Coordinate point = points.get(index);
            if (point == null) {
                throw new IllegalArgumentException("points[" + index + "] must not be null");
            }
            if (!Double.isFinite(point.longitude())
                    || point.longitude() < -180.0
                    || point.longitude() > 180.0) {
                throw new IllegalArgumentException(
                        "points[" + index + "].longitude must be finite and between -180 and 180");
            }
            if (!Double.isFinite(point.latitude())
                    || point.latitude() < -90.0
                    || point.latitude() > 90.0) {
                throw new IllegalArgumentException(
                        "points[" + index + "].latitude must be finite and between -90 and 90");
            }
        }
        return List.copyOf(points);
    }

    private String buildQuery(
            List<Coordinate> points,
            MapSqlParameterSource parameters) {
        StringBuilder values = new StringBuilder();
        for (int ordinal = 0; ordinal < points.size(); ordinal++) {
            if (ordinal > 0) {
                values.append(",\n");
            }
            values.append('(')
                    .append(ordinal)
                    .append(", :longitude")
                    .append(ordinal)
                    .append(", :latitude")
                    .append(ordinal)
                    .append(')');

            Coordinate point = points.get(ordinal);
            parameters.addValue("longitude" + ordinal, point.longitude());
            parameters.addValue("latitude" + ordinal, point.latitude());
        }
        return QUERY_PREFIX + values + QUERY_SUFFIX;
    }

    private void verifyRows(List<DatabaseElevation> rows, int expectedSize) {
        if (rows.size() != expectedSize) {
            throw new IllegalStateException(
                    "DEM query cardinality mismatch: expected " + expectedSize + " rows but received "
                            + rows.size());
        }
        for (int expectedOrdinal = 0; expectedOrdinal < rows.size(); expectedOrdinal++) {
            int actualOrdinal = rows.get(expectedOrdinal).ordinal();
            if (actualOrdinal != expectedOrdinal) {
                throw new IllegalStateException(
                        "DEM query ordinal mismatch: expected " + expectedOrdinal + " but received "
                                + actualOrdinal);
            }
        }
    }

    public record Coordinate(double longitude, double latitude) {
    }

    public record ElevationSample(
            int ordinal,
            Coordinate coordinate,
            OptionalDouble elevationMeters) {
    }

    private record DatabaseElevation(int ordinal, Double elevation) {
    }
}
