package com.ddemachim.server.domain.crowding.service;

import com.ddemachim.server.domain.crowding.entity.CrowdingGrid;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.index.strtree.STRtree;
import org.springframework.stereotype.Component;

@Component
public class CrowdingGridLocator {

    public List<Optional<CrowdingGrid>> locateAll(
            Collection<CrowdingGrid> grids,
            List<Point> points) {
        STRtree index = new STRtree();
        grids.forEach(grid -> index.insert(grid.getGeometry().getEnvelopeInternal(), grid));
        index.build();

        return points.stream()
                .map(point -> locate(index, point))
                .toList();
    }

    private Optional<CrowdingGrid> locate(STRtree index, Point point) {
        List<?> candidates = index.query(point.getEnvelopeInternal());
        return candidates.stream()
                .map(CrowdingGrid.class::cast)
                .filter(grid -> grid.getGeometry().covers(point))
                .min(Comparator.comparing(CrowdingGrid::getGridCode));
    }
}
