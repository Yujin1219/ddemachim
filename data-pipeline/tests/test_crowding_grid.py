from __future__ import annotations

import importlib.util
import re
import sys
import unittest
from contextlib import redirect_stdout
from dataclasses import replace
from io import StringIO
from pathlib import Path
from types import ModuleType
from typing import Any
from unittest.mock import patch

from pyproj import Transformer
from shapely import wkt
from shapely.geometry import Point, Polygon, box
from shapely.ops import transform


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "src" / "db" / "schema.sql"
MIGRATION_PATH = ROOT / "src" / "db" / "add_crowding_grid.sql"
LOADER_PATH = ROOT / "scripts" / "load_jongno_crowding_grid.py"

TO_WGS84 = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True)
TO_METERS = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


def _compact_sql(path: Path) -> str:
    return re.sub(r"\s+", " ", path.read_text(encoding="utf-8")).strip().lower()


def _load_loader_module() -> ModuleType | None:
    if not LOADER_PATH.exists():
        return None

    spec = importlib.util.spec_from_file_location("load_jongno_crowding_grid", LOADER_PATH)
    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


loader = _load_loader_module()


def _fixture_boundary_wgs84():
    boundary_meters = box(200010.0, 500010.0, 200090.0, 500090.0)
    return transform(TO_WGS84.transform, boundary_meters)


def _metric_geometry_to_wgs84(geometry):
    return transform(TO_WGS84.transform, geometry)


class CrowdingGridSchemaContractTest(unittest.TestCase):
    def test_schema_and_migration_define_the_frozen_grid_contract(self) -> None:
        self.assertTrue(MIGRATION_PATH.exists(), "crowding grid migration SQL must exist")

        for path in (SCHEMA_PATH, MIGRATION_PATH):
            with self.subTest(path=path.name):
                sql = _compact_sql(path)
                table_match = re.search(
                    r"create table if not exists crowding_grid\s*\((.*?)\);",
                    sql,
                )
                self.assertIsNotNone(table_match, f"{path.name} must define crowding_grid")
                table = table_match.group(1)

                for column in (
                    "id bigserial primary key",
                    "grid_code varchar(64) unique not null",
                    "grid_x integer not null",
                    "grid_y integer not null",
                    "geometry geometry(polygon, 4326) not null",
                    "center_latitude double precision not null",
                    "center_longitude double precision not null",
                    "created_at timestamptz not null default now()",
                ):
                    self.assertIn(column, table)

                self.assertIn("unique (grid_x, grid_y)", table)
                self.assertIn(
                    "create index if not exists idx_crowding_grid_geometry "
                    "on crowding_grid using gist (geometry);",
                    sql,
                )

        migration_sql = _compact_sql(MIGRATION_PATH)
        self.assertTrue(migration_sql.startswith("begin;"))
        self.assertTrue(migration_sql.endswith("commit;"))


class CrowdingGridGenerationTest(unittest.TestCase):
    def _loader(self) -> ModuleType:
        self.assertIsNotNone(loader, "crowding grid loader module must exist")
        return loader

    def test_generation_returns_stable_codes_for_intersecting_cells(self) -> None:
        module = self._loader()
        boundary = _fixture_boundary_wgs84()

        first_run = module.generate_grid_cells(boundary)
        second_run = module.generate_grid_cells(boundary)

        expected_codes = [
            "G-4000-10000",
            "G-4000-10001",
            "G-4001-10000",
            "G-4001-10001",
        ]
        self.assertEqual([cell.grid_code for cell in first_run], expected_codes)
        self.assertEqual([cell.grid_code for cell in second_run], expected_codes)
        self.assertTrue(all(cell.geometry_wgs84.intersects(boundary) for cell in first_run))

    def test_generation_keeps_each_intersecting_square_unclipped_at_50_meters(self) -> None:
        module = self._loader()
        boundary = _fixture_boundary_wgs84()

        cells = module.generate_grid_cells(boundary)

        self.assertEqual(len(cells), 4)
        self.assertTrue(any(not boundary.contains(cell.geometry_wgs84) for cell in cells))
        for cell in cells:
            geometry_meters = transform(TO_METERS.transform, cell.geometry_wgs84)
            min_x, min_y, max_x, max_y = geometry_meters.bounds
            self.assertAlmostEqual(max_x - min_x, 50.0, places=5)
            self.assertAlmostEqual(max_y - min_y, 50.0, places=5)
            self.assertAlmostEqual(geometry_meters.area, 2500.0, places=4)

    def test_generation_uses_the_transformed_metric_square_centres(self) -> None:
        module = self._loader()

        cells = module.generate_grid_cells(_fixture_boundary_wgs84())

        first = cells[0]
        expected_longitude, expected_latitude = TO_WGS84.transform(200025.0, 500025.0)
        self.assertEqual((first.grid_x, first.grid_y), (4000, 10000))
        self.assertAlmostEqual(first.center_longitude, expected_longitude, places=10)
        self.assertAlmostEqual(first.center_latitude, expected_latitude, places=10)

    def test_generation_places_every_center_inside_its_cell(self) -> None:
        module = self._loader()

        cells = module.generate_grid_cells(_fixture_boundary_wgs84())

        for cell in cells:
            center = Point(cell.center_longitude, cell.center_latitude)
            self.assertTrue(cell.geometry_wgs84.covers(center), cell.grid_code)


class CrowdingGridValidationTest(unittest.TestCase):
    def _loader(self) -> ModuleType:
        self.assertIsNotNone(loader, "crowding grid loader module must exist")
        self.assertTrue(
            hasattr(loader, "validate_grid_cells"),
            "crowding grid loader must expose validate_grid_cells",
        )
        return loader

    def _cells(self) -> list[Any]:
        return self._loader().generate_grid_cells(_fixture_boundary_wgs84())

    def test_validation_accepts_generated_cells(self) -> None:
        module = self._loader()

        module.validate_grid_cells(_fixture_boundary_wgs84(), self._cells())

    def test_validation_rejects_empty_cells(self) -> None:
        module = self._loader()

        with self.assertRaisesRegex(ValueError, "at least one cell"):
            module.validate_grid_cells(_fixture_boundary_wgs84(), [])

    def test_validation_rejects_duplicate_grid_codes(self) -> None:
        module = self._loader()
        cells = self._cells()
        duplicate = replace(cells[1], grid_code=cells[0].grid_code)

        with self.assertRaisesRegex(ValueError, "duplicate grid code"):
            module.validate_grid_cells(_fixture_boundary_wgs84(), [cells[0], duplicate])

    def test_validation_rejects_duplicate_grid_coordinates(self) -> None:
        module = self._loader()
        cells = self._cells()
        duplicate = replace(cells[1], grid_x=cells[0].grid_x, grid_y=cells[0].grid_y)

        with self.assertRaisesRegex(ValueError, "duplicate grid coordinates"):
            module.validate_grid_cells(_fixture_boundary_wgs84(), [cells[0], duplicate])

    def test_validation_rejects_invalid_polygons(self) -> None:
        module = self._loader()
        cell = self._cells()[0]
        invalid_polygon_meters = Polygon(
            [
                (200000.0, 500000.0),
                (200050.0, 500050.0),
                (200050.0, 500000.0),
                (200000.0, 500050.0),
                (200000.0, 500000.0),
            ]
        )
        invalid_cell = replace(
            cell,
            geometry_wgs84=_metric_geometry_to_wgs84(invalid_polygon_meters),
        )

        with self.assertRaisesRegex(ValueError, "valid polygon"):
            module.validate_grid_cells(_fixture_boundary_wgs84(), [invalid_cell])

    def test_validation_rejects_wrong_metric_dimensions(self) -> None:
        module = self._loader()
        cell = self._cells()[0]
        narrow_cell = replace(
            cell,
            geometry_wgs84=_metric_geometry_to_wgs84(
                box(200000.0, 500000.0, 200040.0, 500050.0)
            ),
        )

        with self.assertRaisesRegex(ValueError, "50 m square"):
            module.validate_grid_cells(_fixture_boundary_wgs84(), [narrow_cell])

    def test_validation_rejects_cells_outside_the_boundary(self) -> None:
        module = self._loader()
        cell = self._cells()[0]
        outside_geometry = _metric_geometry_to_wgs84(
            box(300000.0, 600000.0, 300050.0, 600050.0)
        )
        outside_longitude, outside_latitude = TO_WGS84.transform(300025.0, 600025.0)
        outside_cell = replace(
            cell,
            geometry_wgs84=outside_geometry,
            center_latitude=outside_latitude,
            center_longitude=outside_longitude,
        )

        with self.assertRaisesRegex(ValueError, "does not intersect boundary"):
            module.validate_grid_cells(_fixture_boundary_wgs84(), [outside_cell])

    def test_validation_rejects_centers_outside_their_cells(self) -> None:
        module = self._loader()
        cell = replace(self._cells()[0], center_latitude=0.0, center_longitude=0.0)

        with self.assertRaisesRegex(ValueError, "center is not covered"):
            module.validate_grid_cells(_fixture_boundary_wgs84(), [cell])

    def test_main_validates_before_output_or_database_connection(self) -> None:
        module = self._loader()
        boundary = _fixture_boundary_wgs84()

        for arguments in (["--dry-run"], ["--database-url", "unused"]):
            with self.subTest(arguments=arguments):
                output = StringIO()
                with (
                    patch.object(module, "_load_boundary", return_value=boundary),
                    patch.object(module, "generate_grid_cells", return_value=[]),
                    patch.object(
                        module.psycopg,
                        "connect",
                        side_effect=AssertionError("database connection must not open"),
                    ),
                    redirect_stdout(output),
                ):
                    with self.assertRaisesRegex(ValueError, "at least one cell"):
                        module.main(arguments)
                self.assertEqual(output.getvalue(), "")


class RecordingCursor:
    def __init__(self) -> None:
        self.sql = ""
        self.rows: list[tuple[Any, ...]] = []
        self.batches: list[tuple[str, list[tuple[Any, ...]]]] = []

    def __enter__(self) -> "RecordingCursor":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def executemany(self, sql: str, rows: Any) -> None:
        self.sql = re.sub(r"\s+", " ", sql).strip().lower()
        self.rows = list(rows)
        self.batches.append((self.sql, self.rows))


class RecordingConnection:
    def __init__(self) -> None:
        self.recording_cursor = RecordingCursor()
        self.cursor_calls = 0

    def cursor(self) -> RecordingCursor:
        self.cursor_calls += 1
        return self.recording_cursor


class CrowdingGridUpsertTest(unittest.TestCase):
    def test_upsert_is_a_no_op_for_empty_cells(self) -> None:
        self.assertIsNotNone(loader, "crowding grid loader module must exist")
        connection = RecordingConnection()

        written = loader.upsert_grid_cells(connection, [])

        self.assertEqual(written, 0)
        self.assertEqual(connection.cursor_calls, 0)

    def test_upsert_bulk_writes_wgs84_cells_and_updates_on_grid_code_conflict(self) -> None:
        self.assertIsNotNone(loader, "crowding grid loader module must exist")
        cells = loader.generate_grid_cells(_fixture_boundary_wgs84())
        connection = RecordingConnection()

        written = loader.upsert_grid_cells(connection, cells)

        self.assertEqual(written, 4)
        self.assertIn("insert into crowding_grid", connection.recording_cursor.sql)
        self.assertIn("st_geomfromtext(%s, 4326)", connection.recording_cursor.sql)
        self.assertIn("on conflict (grid_code) do update", connection.recording_cursor.sql)
        for updated_column in (
            "grid_x = excluded.grid_x",
            "grid_y = excluded.grid_y",
            "geometry = excluded.geometry",
            "center_latitude = excluded.center_latitude",
            "center_longitude = excluded.center_longitude",
        ):
            self.assertIn(updated_column, connection.recording_cursor.sql)

        first_row = connection.recording_cursor.rows[0]
        self.assertEqual(first_row[:3], ("G-4000-10000", 4000, 10000))
        self.assertEqual(wkt.loads(first_row[3]).geom_type, "Polygon")
        self.assertAlmostEqual(first_row[4], cells[0].center_latitude, places=12)
        self.assertAlmostEqual(first_row[5], cells[0].center_longitude, places=12)

    def test_repeated_identical_upserts_emit_identical_conflict_safe_batches(self) -> None:
        self.assertIsNotNone(loader, "crowding grid loader module must exist")
        cells = loader.generate_grid_cells(_fixture_boundary_wgs84())
        connection = RecordingConnection()

        first_written = loader.upsert_grid_cells(connection, cells)
        second_written = loader.upsert_grid_cells(connection, cells)

        self.assertEqual((first_written, second_written), (4, 4))
        self.assertEqual(connection.cursor_calls, 2)
        self.assertEqual(len(connection.recording_cursor.batches), 2)
        self.assertEqual(
            connection.recording_cursor.batches[0],
            connection.recording_cursor.batches[1],
        )
        self.assertIn(
            "on conflict (grid_code) do update",
            connection.recording_cursor.batches[0][0],
        )


if __name__ == "__main__":
    unittest.main()
