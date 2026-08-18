package com.ddemachim.server.domain.crowding.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.locationtech.jts.geom.Polygon;

@Entity
@Table(
        name = "crowding_grid",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_crowding_grid_xy",
                columnNames = {"grid_x", "grid_y"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CrowdingGrid {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "grid_code", nullable = false, unique = true, length = 64)
    private String gridCode;

    @Column(name = "grid_x", nullable = false)
    private int gridX;

    @Column(name = "grid_y", nullable = false)
    private int gridY;

    @Column(nullable = false, columnDefinition = "geometry(Polygon,4326)")
    private Polygon geometry;

    @Column(name = "center_latitude", nullable = false)
    private double centerLatitude;

    @Column(name = "center_longitude", nullable = false)
    private double centerLongitude;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    private CrowdingGrid(
            String gridCode,
            int gridX,
            int gridY,
            Polygon geometry,
            double centerLatitude,
            double centerLongitude) {
        this.gridCode = gridCode;
        this.gridX = gridX;
        this.gridY = gridY;
        this.geometry = geometry;
        this.centerLatitude = centerLatitude;
        this.centerLongitude = centerLongitude;
    }

    public static CrowdingGrid create(
            String gridCode,
            int gridX,
            int gridY,
            Polygon geometry,
            double centerLatitude,
            double centerLongitude) {
        return new CrowdingGrid(
                gridCode,
                gridX,
                gridY,
                geometry,
                centerLatitude,
                centerLongitude);
    }
}
