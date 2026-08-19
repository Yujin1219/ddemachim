from __future__ import annotations

import re
import unittest
from typing import Any
from unittest.mock import patch

from scripts import backfill_redtable_images, backfill_tourapi_images, quality_report


class FakeImageCursor:
    def __init__(self, connection: "FakeImageConnection") -> None:
        self.connection = connection
        self.last_sql = ""
        self.last_params: tuple[Any, ...] | None = None
        self.rowcount = 0

    def __enter__(self) -> "FakeImageCursor":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> None:
        self.last_sql = re.sub(r"\s+", " ", sql).strip().lower()
        self.last_params = params
        self.rowcount = 0
        self.connection.executed.append((self.last_sql, params))

        if "insert into place_image" in self.last_sql:
            raise AssertionError("representative image backfill must not insert into place_image")

        if self.last_sql.startswith("update place set image_url"):
            assert "image_url is null" in self.last_sql
            image_url, image_source, image_attribution, place_id = params or ()
            assert place_id == self.connection.place_id
            if self.connection.image_url is None:
                self.connection.image_url = image_url
                self.connection.image_source = image_source
                self.connection.image_attribution = image_attribution
                self.rowcount = 1

    def fetchone(self) -> tuple[int] | None:
        if self.last_sql.startswith("select place_id from place_source"):
            return (self.connection.place_id,)
        return None

    def fetchall(self) -> list[tuple[Any, ...]]:
        return []


class FakeImageConnection:
    def __init__(
        self,
        *,
        image_url: str | None = None,
        image_source: str | None = None,
        image_attribution: str | None = None,
    ) -> None:
        self.place_id = 101
        self.image_url = image_url
        self.image_source = image_source
        self.image_attribution = image_attribution
        self.executed: list[tuple[str, tuple[Any, ...] | None]] = []
        self.commit_count = 0

    def __enter__(self) -> "FakeImageConnection":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def cursor(self) -> FakeImageCursor:
        return FakeImageCursor(self)

    def commit(self) -> None:
        self.commit_count += 1


class BackfillImagesTest(unittest.TestCase):
    def test_tourapi_backfill_stores_one_representative_image_without_place_image_insert(self) -> None:
        connection = FakeImageConnection()

        with (
            patch.object(
                backfill_tourapi_images,
                "collect_images",
                return_value={"tour-1": ["https://tour.example/first.jpg", "https://tour.example/second.jpg"]},
            ),
            patch.object(backfill_tourapi_images, "get_connection", return_value=connection),
        ):
            self.assertEqual(backfill_tourapi_images.main(), 0)

        self.assertEqual(connection.image_url, "https://tour.example/first.jpg")
        self.assertEqual(connection.image_source, "TOURAPI")
        self.assertEqual(connection.image_attribution, "한국관광공사 TourAPI")
        self.assertEqual(connection.commit_count, 1)


    def test_redtable_backfill_does_not_overwrite_existing_representative_image(self) -> None:
        connection = FakeImageConnection(
            image_url="https://existing.example/place.jpg",
            image_source="EXISTING",
            image_attribution="Existing attribution",
        )

        with (
            patch.object(backfill_redtable_images, "load_dotenv"),
            patch.object(backfill_redtable_images.os, "getenv", return_value="redtable-key"),
            patch.object(
                backfill_redtable_images,
                "collect_all",
                return_value=[
                    {
                        "AREA_NM": "서울특별시 종로구",
                        "RSTR_ID": "red-1",
                        "RSTR_IMG_URL": "https://redtable.example/new.jpg",
                    }
                ],
            ),
            patch.object(backfill_redtable_images, "get_connection", return_value=connection),
        ):
            self.assertEqual(backfill_redtable_images.main(), 0)

        self.assertEqual(connection.image_url, "https://existing.example/place.jpg")
        self.assertEqual(connection.image_source, "EXISTING")
        self.assertEqual(connection.image_attribution, "Existing attribution")
        self.assertEqual(connection.commit_count, 1)


    def test_quality_report_counts_places_without_representative_image_url(self) -> None:
        class ReportCursor:
            def __init__(self) -> None:
                self.sql = ""
                self.image_sql = ""

            def __enter__(self) -> "ReportCursor":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def execute(self, sql: str, _params: tuple[Any, ...] = ()) -> None:
                self.sql = re.sub(r"\s+", " ", sql).strip().lower()
                if "place_image" in self.sql:
                    raise AssertionError("quality report must use place.image_url")
                if "image_url" in self.sql:
                    self.image_sql = self.sql

            def fetchone(self) -> tuple[int]:
                return (0,)

            def fetchall(self) -> list[tuple[Any, ...]]:
                return []

        class ReportConnection:
            def __init__(self) -> None:
                self.cursor_instance = ReportCursor()

            def cursor(self) -> ReportCursor:
                return self.cursor_instance

        connection = ReportConnection()

        quality_report.build_report(connection)

        self.assertIn("image_url is null", connection.cursor_instance.image_sql)
