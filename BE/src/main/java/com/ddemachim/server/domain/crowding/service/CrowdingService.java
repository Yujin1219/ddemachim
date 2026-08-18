package com.ddemachim.server.domain.crowding.service;

import com.ddemachim.server.domain.crowding.dto.CrowdingRequest;
import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.entity.CrowdingGrid;
import com.ddemachim.server.domain.crowding.enums.CrowdingLevel;
import com.ddemachim.server.domain.crowding.exception.CrowdingErrorStatus;
import com.ddemachim.server.domain.crowding.exception.CrowdingException;
import com.ddemachim.server.domain.crowding.repository.CrowdingGridRepository;
import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CrowdingService {

    private static final int SLOT_MINUTES = 30;
    private static final int MAXIMUM_BATCH_CANDIDATE_GRIDS = 12_000;
    private static final GeometryFactory GEOMETRY_FACTORY =
            new GeometryFactory(new PrecisionModel(), 4326);

    private final CrowdingGridRepository crowdingGridRepository;
    private final CrowdingGridLocator crowdingGridLocator;
    private final CrowdingRedisCache crowdingRedisCache;
    private final CrowdingSlotResolver crowdingSlotResolver;
    private final CrowdingMockProperties properties;

    public CrowdingService(
            CrowdingGridRepository crowdingGridRepository,
            CrowdingGridLocator crowdingGridLocator,
            CrowdingRedisCache crowdingRedisCache,
            CrowdingSlotResolver crowdingSlotResolver,
            CrowdingMockProperties properties) {
        this.crowdingGridRepository = crowdingGridRepository;
        this.crowdingGridLocator = crowdingGridLocator;
        this.crowdingRedisCache = crowdingRedisCache;
        this.crowdingSlotResolver = crowdingSlotResolver;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public List<CrowdingResponse.Grid> getViewportGrids(
            double minLat,
            double maxLat,
            double minLng,
            double maxLng,
            OffsetDateTime at) {
        validateBounds(minLat, maxLat, minLng, maxLng);

        int maximumGrids = properties.getMaximumViewportGrids();
        List<CrowdingGrid> grids = queryIntersectingBounds(
                minLat,
                maxLat,
                minLng,
                maxLng,
                maximumGrids + 1);
        if (grids.size() > maximumGrids) {
            throw new CrowdingException(CrowdingErrorStatus.VIEWPORT_LIMIT_EXCEEDED);
        }

        OffsetDateTime slotStart = resolveSlot(at);
        Map<String, Integer> scores = resolveScores(
                grids.stream().map(CrowdingGrid::getGridCode).toList(),
                slotStart);
        return grids.stream()
                .map(grid -> toGridResponse(grid, scoreFor(scores, grid.getGridCode()), slotStart))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CrowdingResponse.Point> getPointCrowding(CrowdingRequest.Points request) {
        List<CrowdingRequest.Point> requestedPoints = validatePoints(request);

        double minLat = requestedPoints.stream()
                .mapToDouble(CrowdingRequest.Point::latitude)
                .min()
                .orElseThrow();
        double maxLat = requestedPoints.stream()
                .mapToDouble(CrowdingRequest.Point::latitude)
                .max()
                .orElseThrow();
        double minLng = requestedPoints.stream()
                .mapToDouble(CrowdingRequest.Point::longitude)
                .min()
                .orElseThrow();
        double maxLng = requestedPoints.stream()
                .mapToDouble(CrowdingRequest.Point::longitude)
                .max()
                .orElseThrow();

        List<CrowdingGrid> candidates = queryIntersectingBounds(
                Math.nextDown(minLat),
                Math.nextUp(maxLat),
                Math.nextDown(minLng),
                Math.nextUp(maxLng),
                MAXIMUM_BATCH_CANDIDATE_GRIDS + 1);
        if (candidates.size() > MAXIMUM_BATCH_CANDIDATE_GRIDS) {
            throw new CrowdingException(CrowdingErrorStatus.BATCH_AREA_LIMIT_EXCEEDED);
        }

        OffsetDateTime slotStart = resolveSlot(request.at());
        List<Point> points = requestedPoints.stream()
                .map(CrowdingService::toJtsPoint)
                .toList();
        List<Optional<CrowdingGrid>> locatedGrids = crowdingGridLocator.locateAll(candidates, points);

        Collection<String> uniqueGridCodes = locatedGrids.stream()
                .flatMap(Optional::stream)
                .map(CrowdingGrid::getGridCode)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        Map<String, Integer> scores = resolveScores(uniqueGridCodes, slotStart);

        List<CrowdingResponse.Point> result = new ArrayList<>(requestedPoints.size());
        for (int index = 0; index < requestedPoints.size(); index++) {
            CrowdingRequest.Point requestedPoint = requestedPoints.get(index);
            Optional<CrowdingGrid> locatedGrid = locatedGrids.get(index);
            result.add(locatedGrid
                    .map(grid -> toPointResponse(
                            requestedPoint.referenceId(),
                            grid,
                            scoreFor(scores, grid.getGridCode()),
                            slotStart))
                    .orElseGet(() -> uncoveredPoint(requestedPoint.referenceId(), slotStart)));
        }
        return List.copyOf(result);
    }

    private List<CrowdingGrid> queryIntersectingBounds(
            double minLat,
            double maxLat,
            double minLng,
            double maxLng,
            int limit) {
        try {
            return crowdingGridRepository.findIntersectingBounds(
                    minLat,
                    maxLat,
                    minLng,
                    maxLng,
                    limit);
        } catch (RuntimeException exception) {
            throw new CrowdingException(CrowdingErrorStatus.GRID_QUERY_FAILED);
        }
    }

    private Map<String, Integer> resolveScores(
            Collection<String> gridCodes,
            OffsetDateTime slotStart) {
        try {
            return crowdingRedisCache.resolveScores(gridCodes, slotStart);
        } catch (RuntimeException exception) {
            throw new CrowdingException(CrowdingErrorStatus.SCORE_RESOLUTION_FAILED);
        }
    }

    private OffsetDateTime resolveSlot(OffsetDateTime at) {
        return at == null
                ? crowdingSlotResolver.resolveCurrent()
                : crowdingSlotResolver.resolve(at);
    }

    private List<CrowdingRequest.Point> validatePoints(CrowdingRequest.Points request) {
        if (request == null || request.points() == null || request.points().isEmpty()) {
            throw new CrowdingException(CrowdingErrorStatus.INVALID_POINTS);
        }
        if (request.points().size() > properties.getMaximumBatchPoints()) {
            throw new CrowdingException(CrowdingErrorStatus.BATCH_LIMIT_EXCEEDED);
        }
        for (CrowdingRequest.Point point : request.points()) {
            if (point == null
                    || point.referenceId() == null
                    || point.referenceId().isBlank()
                    || point.latitude() == null
                    || point.longitude() == null
                    || !isValidLatitude(point.latitude())
                    || !isValidLongitude(point.longitude())) {
                throw new CrowdingException(CrowdingErrorStatus.INVALID_POINTS);
            }
        }
        return request.points();
    }

    private static void validateBounds(
            double minLat,
            double maxLat,
            double minLng,
            double maxLng) {
        if (!isValidLatitude(minLat)
                || !isValidLatitude(maxLat)
                || !isValidLongitude(minLng)
                || !isValidLongitude(maxLng)
                || minLat >= maxLat
                || minLng >= maxLng) {
            throw new CrowdingException(CrowdingErrorStatus.INVALID_BOUNDS);
        }
    }

    private static boolean isValidLatitude(double latitude) {
        return Double.isFinite(latitude) && latitude >= -90 && latitude <= 90;
    }

    private static boolean isValidLongitude(double longitude) {
        return Double.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    }

    private static Point toJtsPoint(CrowdingRequest.Point point) {
        return GEOMETRY_FACTORY.createPoint(new Coordinate(point.longitude(), point.latitude()));
    }

    private static CrowdingResponse.Grid toGridResponse(
            CrowdingGrid grid,
            int score,
            OffsetDateTime slotStart) {
        CrowdingLevel level = CrowdingLevel.fromScore(score);
        return new CrowdingResponse.Grid(
                grid.getGridCode(),
                polygonCoordinates(grid.getGeometry()),
                grid.getCenterLatitude(),
                grid.getCenterLongitude(),
                score,
                level,
                level.getLabel(),
                true,
                slotStart,
                slotStart.plusMinutes(SLOT_MINUTES));
    }

    private static CrowdingResponse.Point toPointResponse(
            String referenceId,
            CrowdingGrid grid,
            int score,
            OffsetDateTime slotStart) {
        CrowdingLevel level = CrowdingLevel.fromScore(score);
        return new CrowdingResponse.Point(
                referenceId,
                true,
                grid.getGridCode(),
                score,
                level,
                level.getLabel(),
                true,
                slotStart,
                slotStart.plusMinutes(SLOT_MINUTES));
    }

    private static CrowdingResponse.Point uncoveredPoint(
            String referenceId,
            OffsetDateTime slotStart) {
        return new CrowdingResponse.Point(
                referenceId,
                false,
                null,
                null,
                null,
                null,
                true,
                slotStart,
                slotStart.plusMinutes(SLOT_MINUTES));
    }

    private static int scoreFor(Map<String, Integer> scores, String gridCode) {
        Integer score = scores.get(gridCode);
        if (score == null) {
            throw new CrowdingException(CrowdingErrorStatus.SCORE_RESOLUTION_FAILED);
        }
        return score;
    }

    private static List<List<List<Double>>> polygonCoordinates(Polygon polygon) {
        List<List<List<Double>>> rings = new ArrayList<>(polygon.getNumInteriorRing() + 1);
        rings.add(ringCoordinates(polygon.getExteriorRing()));
        for (int index = 0; index < polygon.getNumInteriorRing(); index++) {
            rings.add(ringCoordinates(polygon.getInteriorRingN(index)));
        }
        return List.copyOf(rings);
    }

    private static List<List<Double>> ringCoordinates(LineString ring) {
        return java.util.Arrays.stream(ring.getCoordinates())
                .map(coordinate -> List.of(coordinate.getX(), coordinate.getY()))
                .toList();
    }
}
