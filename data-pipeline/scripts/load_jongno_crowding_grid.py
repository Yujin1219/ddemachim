#!/usr/bin/env python3
"""Generate and load the deterministic 50 m Jongno crowding grid."""

from __future__ import annotations

import json
import math
from argparse import ArgumentParser, Namespace
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import psycopg
from pyproj import Transformer
from shapely.geometry import Point, box, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform, unary_union


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BOUNDARY = REPO_ROOT / "FE" / "public" / "data" / "jongno-boundary.geojson"

WGS84_CRS = "EPSG:4326"
METRIC_CRS = "EPSG:5186"


@dataclass(frozen=True)
class GridCell:
    grid_code: str
    grid_x: int
    grid_y: int
    geometry_wgs84: BaseGeometry
    center_latitude: float
    center_longitude: float


def generate_grid_cells(
    boundary_wgs84: BaseGeometry,
    grid_size_meters: int = 50,
) -> list[GridCell]:
    if grid_size_meters <= 0:
        raise ValueError("grid_size_meters must be positive")
    if boundary_wgs84.is_empty:
        return []

    to_meters = Transformer.from_crs(WGS84_CRS, METRIC_CRS, always_xy=True)
    to_wgs84 = Transformer.from_crs(METRIC_CRS, WGS84_CRS, always_xy=True)
    boundary_meters = transform(to_meters.transform, boundary_wgs84)
    min_x, min_y, max_x, max_y = boundary_meters.bounds

    min_grid_x = math.floor(min_x / grid_size_meters)
    max_grid_x = math.floor(max_x / grid_size_meters)
    min_grid_y = math.floor(min_y / grid_size_meters)
    max_grid_y = math.floor(max_y / grid_size_meters)

    cells: list[GridCell] = []
    for grid_x in range(min_grid_x, max_grid_x + 1):
        cell_min_x = grid_x * grid_size_meters
        for grid_y in range(min_grid_y, max_grid_y + 1):
            cell_min_y = grid_y * grid_size_meters
            geometry_meters = box(
                cell_min_x,
                cell_min_y,
                cell_min_x + grid_size_meters,
                cell_min_y + grid_size_meters,
            )
            if not geometry_meters.intersects(boundary_meters):
                continue

            center_longitude, center_latitude = to_wgs84.transform(
                cell_min_x + grid_size_meters / 2,
                cell_min_y + grid_size_meters / 2,
            )
            cells.append(
                GridCell(
                    grid_code=f"G-{grid_x}-{grid_y}",
                    grid_x=grid_x,
                    grid_y=grid_y,
                    geometry_wgs84=transform(to_wgs84.transform, geometry_meters),
                    center_latitude=center_latitude,
                    center_longitude=center_longitude,
                )
            )

    return cells


def validate_grid_cells(
    boundary_wgs84: BaseGeometry,
    cells: Sequence[GridCell],
    grid_size_meters: int = 50,
) -> None:
    if not cells:
        raise ValueError("crowding grid must contain at least one cell")
    if grid_size_meters <= 0:
        raise ValueError("grid_size_meters must be positive")

    to_meters = Transformer.from_crs(WGS84_CRS, METRIC_CRS, always_xy=True)
    seen_codes: set[str] = set()
    seen_coordinates: set[tuple[int, int]] = set()

    for cell in cells:
        if cell.grid_code in seen_codes:
            raise ValueError(f"duplicate grid code: {cell.grid_code}")
        seen_codes.add(cell.grid_code)

        coordinates = (cell.grid_x, cell.grid_y)
        if coordinates in seen_coordinates:
            raise ValueError(f"duplicate grid coordinates: {coordinates}")
        seen_coordinates.add(coordinates)

        geometry = cell.geometry_wgs84
        if geometry.is_empty or geometry.geom_type != "Polygon" or not geometry.is_valid:
            raise ValueError(f"{cell.grid_code} must have a valid polygon")

        geometry_meters = transform(to_meters.transform, geometry)
        min_x, min_y, max_x, max_y = geometry_meters.bounds
        width = max_x - min_x
        height = max_y - min_y
        if not (
            math.isclose(width, grid_size_meters, rel_tol=0.0, abs_tol=1e-5)
            and math.isclose(height, grid_size_meters, rel_tol=0.0, abs_tol=1e-5)
        ):
            raise ValueError(f"{cell.grid_code} must be a {grid_size_meters} m square")

        if not geometry.intersects(boundary_wgs84):
            raise ValueError(f"{cell.grid_code} does not intersect boundary")

        center = Point(cell.center_longitude, cell.center_latitude)
        if not geometry.covers(center):
            raise ValueError(f"{cell.grid_code} center is not covered by its cell")


def upsert_grid_cells(conn: psycopg.Connection, cells: Sequence[GridCell]) -> int:
    if not cells:
        return 0

    sql = """
        INSERT INTO crowding_grid (
            grid_code,
            grid_x,
            grid_y,
            geometry,
            center_latitude,
            center_longitude
        )
        VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326), %s, %s)
        ON CONFLICT (grid_code) DO UPDATE SET
            grid_x = EXCLUDED.grid_x,
            grid_y = EXCLUDED.grid_y,
            geometry = EXCLUDED.geometry,
            center_latitude = EXCLUDED.center_latitude,
            center_longitude = EXCLUDED.center_longitude
    """
    rows = [
        (
            cell.grid_code,
            cell.grid_x,
            cell.grid_y,
            cell.geometry_wgs84.wkt,
            cell.center_latitude,
            cell.center_longitude,
        )
        for cell in cells
    ]
    with conn.cursor() as cursor:
        cursor.executemany(sql, rows)
    return len(rows)


def _load_boundary(path: Path) -> BaseGeometry:
    with path.open(encoding="utf-8") as file:
        payload = json.load(file)

    payload_type = payload.get("type")
    if payload_type == "FeatureCollection":
        geometries = [
            shape(feature["geometry"])
            for feature in payload.get("features", [])
            if feature.get("geometry") is not None
        ]
        if not geometries:
            raise ValueError(f"Boundary GeoJSON has no geometries: {path}")
        boundary = unary_union(geometries)
    elif payload_type == "Feature":
        if payload.get("geometry") is None:
            raise ValueError(f"Boundary GeoJSON feature has no geometry: {path}")
        boundary = shape(payload["geometry"])
    else:
        boundary = shape(payload)

    if boundary.is_empty:
        raise ValueError(f"Boundary GeoJSON is empty: {path}")
    return boundary


def _build_parser() -> ArgumentParser:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument(
        "--boundary",
        type=Path,
        default=DEFAULT_BOUNDARY,
        help="EPSG:4326 Jongno boundary GeoJSON path",
    )
    parser.add_argument(
        "--database-url",
        help="PostgreSQL connection URL; required unless --dry-run is used",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate and summarize cells without changing the database",
    )
    return parser


def parse_args(argv: Sequence[str] | None = None) -> Namespace:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if not args.dry_run and not args.database_url:
        parser.error("--database-url is required unless --dry-run is used")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    boundary = _load_boundary(args.boundary)
    cells = generate_grid_cells(boundary)
    validate_grid_cells(boundary, cells)

    print(f"Grid cell count: {len(cells)}")
    print(f"First grid code: {cells[0].grid_code if cells else 'NONE'}")
    print(f"Last grid code: {cells[-1].grid_code if cells else 'NONE'}")

    if args.dry_run:
        print("Dry run: no database changes.")
        return 0

    with psycopg.connect(args.database_url) as conn:
        written = upsert_grid_cells(conn, cells)
    print(f"Upserted grid cells: {written}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
