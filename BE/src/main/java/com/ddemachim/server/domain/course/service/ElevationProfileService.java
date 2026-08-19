package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.repository.DemRasterRepository;
import com.ddemachim.server.domain.course.repository.DemRasterRepository.Coordinate;
import com.ddemachim.server.domain.course.repository.DemRasterRepository.ElevationSample;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.LineStringGeometry;
import java.util.ArrayList;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

@Service
public class ElevationProfileService {

    private static final double EARTH_RADIUS_METERS = 6_371_000.0;
    private static final double SAMPLE_INTERVAL_METERS = 5.0;
    private static final double DISTANCE_EPSILON_METERS = 1.0e-7;

    private final DemRasterRepository demRasterRepository;

    public ElevationProfileService(DemRasterRepository demRasterRepository) {
        this.demRasterRepository = demRasterRepository;
    }

    public ProfileResult profile(LineStringGeometry geometry) {
        List<SamplePoint> points = resample(geometry);
        if (points.isEmpty()) {
            return ProfileResult.unavailable();
        }

        List<ElevationSample> elevations;
        try {
            elevations = demRasterRepository.findElevations(
                    points.stream().map(SamplePoint::coordinate).toList());
        } catch (DataAccessException exception) {
            return ProfileResult.unavailable();
        }
        if (elevations.stream().anyMatch(sample -> sample.elevationMeters().isEmpty())) {
            return ProfileResult.unavailable();
        }
        List<Double> rawElevations = elevations.stream()
                .map(sample -> sample.elevationMeters().orElseThrow())
                .toList();
        List<Double> smoothedElevations = medianSmooth(rawElevations);
        List<ProfilePoint> profile = new ArrayList<>(points.size());
        for (int index = 0; index < points.size(); index++) {
            SamplePoint point = points.get(index);
            profile.add(new ProfilePoint(
                    point.distanceMeters(),
                    point.coordinate().longitude(),
                    point.coordinate().latitude(),
                    smoothedElevations.get(index)));
        }
        return new ProfileResult(
                List.copyOf(profile),
                cumulativeAscent(profile),
                steepUphillDistance(profile));
    }

    private static List<Double> medianSmooth(List<Double> elevations) {
        if (elevations.size() < 3) {
            return List.copyOf(elevations);
        }
        List<Double> smoothed = new ArrayList<>(elevations);
        for (int index = 1; index < elevations.size() - 1; index++) {
            double first = elevations.get(index - 1);
            double second = elevations.get(index);
            double third = elevations.get(index + 1);
            smoothed.set(index, first + second + third
                    - Math.min(first, Math.min(second, third))
                    - Math.max(first, Math.max(second, third)));
        }
        return List.copyOf(smoothed);
    }

    private static double cumulativeAscent(List<ProfilePoint> profile) {
        double ascent = 0.0;
        double uphillRun = 0.0;
        for (int index = 1; index < profile.size(); index++) {
            double elevationDelta = profile.get(index).elevationMeters()
                    - profile.get(index - 1).elevationMeters();
            if (elevationDelta > 0.0) {
                uphillRun += elevationDelta;
            } else {
                if (uphillRun >= 1.0) {
                    ascent += uphillRun;
                }
                uphillRun = 0.0;
            }
        }
        if (uphillRun >= 1.0) {
            ascent += uphillRun;
        }
        return ascent;
    }

    private static double steepUphillDistance(List<ProfilePoint> profile) {
        double steepDistance = 0.0;
        for (int index = 1; index < profile.size(); index++) {
            ProfilePoint previous = profile.get(index - 1);
            ProfilePoint current = profile.get(index);
            double horizontalDistance = current.distanceMeters() - previous.distanceMeters();
            double elevationDelta = current.elevationMeters() - previous.elevationMeters();
            if (horizontalDistance > DISTANCE_EPSILON_METERS
                    && elevationDelta > 0.0
                    && (elevationDelta / horizontalDistance) + 1.0e-12 >= 0.08) {
                steepDistance += horizontalDistance;
            }
        }
        return steepDistance;
    }

    private static List<SamplePoint> resample(LineStringGeometry geometry) {
        if (geometry == null || geometry.coordinates().isEmpty()) {
            return List.of();
        }

        List<Coordinate> vertices = validVertices(geometry.coordinates());
        if (vertices.isEmpty()) {
            return List.of();
        }
        if (vertices.size() == 1) {
            return List.of(new SamplePoint(0.0, vertices.getFirst()));
        }

        double[] cumulative = new double[vertices.size()];
        for (int index = 1; index < vertices.size(); index++) {
            cumulative[index] = cumulative[index - 1]
                    + distance(vertices.get(index - 1), vertices.get(index));
        }
        double totalDistance = cumulative[cumulative.length - 1];
        if (totalDistance <= DISTANCE_EPSILON_METERS) {
            return List.of(new SamplePoint(0.0, vertices.getFirst()));
        }

        List<SamplePoint> samples = new ArrayList<>();
        for (double target = 0.0; target < totalDistance; target += SAMPLE_INTERVAL_METERS) {
            samples.add(pointAt(vertices, cumulative, target));
        }
        samples.add(new SamplePoint(totalDistance, vertices.getLast()));
        return List.copyOf(samples);
    }

    private static List<Coordinate> validVertices(List<List<Double>> rawCoordinates) {
        List<Coordinate> vertices = new ArrayList<>();
        for (List<Double> raw : rawCoordinates) {
            if (raw == null || raw.size() < 2 || raw.get(0) == null || raw.get(1) == null) {
                return List.of();
            }
            Coordinate coordinate = new Coordinate(raw.get(0), raw.get(1));
            if (vertices.isEmpty() || distance(vertices.getLast(), coordinate) > DISTANCE_EPSILON_METERS) {
                vertices.add(coordinate);
            }
        }
        return List.copyOf(vertices);
    }

    private static SamplePoint pointAt(
            List<Coordinate> vertices, double[] cumulative, double targetDistance) {
        int endIndex = 1;
        while (endIndex < cumulative.length - 1 && cumulative[endIndex] < targetDistance) {
            endIndex++;
        }
        int startIndex = endIndex - 1;
        double segmentDistance = cumulative[endIndex] - cumulative[startIndex];
        double fraction = segmentDistance <= DISTANCE_EPSILON_METERS
                ? 0.0
                : (targetDistance - cumulative[startIndex]) / segmentDistance;
        Coordinate start = vertices.get(startIndex);
        Coordinate end = vertices.get(endIndex);
        return new SamplePoint(
                targetDistance,
                new Coordinate(
                        start.longitude() + ((end.longitude() - start.longitude()) * fraction),
                        start.latitude() + ((end.latitude() - start.latitude()) * fraction)));
    }

    private static double distance(Coordinate first, Coordinate second) {
        double latitudeDelta = Math.toRadians(second.latitude() - first.latitude());
        double longitudeDelta = Math.toRadians(second.longitude() - first.longitude());
        double firstLatitude = Math.toRadians(first.latitude());
        double secondLatitude = Math.toRadians(second.latitude());
        double haversine = Math.pow(Math.sin(latitudeDelta / 2.0), 2.0)
                + Math.cos(firstLatitude) * Math.cos(secondLatitude)
                * Math.pow(Math.sin(longitudeDelta / 2.0), 2.0);
        return 2.0 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
    }

    public record ProfileResult(
            List<ProfilePoint> profile,
            Double ascentMeters,
            Double steepUphillDistanceMeters) {

        public ProfileResult {
            profile = profile == null ? null : List.copyOf(profile);
        }

        public static ProfileResult unavailable() {
            return new ProfileResult(null, null, null);
        }

        public boolean isAvailable() {
            return profile != null;
        }
    }

    public record ProfilePoint(
            double distanceMeters,
            double longitude,
            double latitude,
            double elevationMeters) {
    }

    private record SamplePoint(double distanceMeters, Coordinate coordinate) {
    }
}
