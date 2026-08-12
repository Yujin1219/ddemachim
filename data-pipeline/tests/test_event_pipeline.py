from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path


PIPELINE_DIR = Path(__file__).resolve().parents[1]
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

from src.loaders.event_loader import EventLoadStats, load_event  # noqa: E402
from src.normalizers.event import normalize_record  # noqa: E402


class RecordingCursor:
    def __init__(self, connection: "RecordingConnection") -> None:
        self.connection = connection

    def __enter__(self) -> "RecordingCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[object, ...] | None = None) -> None:
        self.connection.executed.append((sql, params))

    def fetchall(self) -> list[tuple[object, ...]]:
        return []

    def fetchone(self) -> tuple[int] | None:
        return (self.connection.existing_id,) if self.connection.existing_id is not None else None


class RecordingConnection:
    def __init__(self, existing_id: int | None = None) -> None:
        self.existing_id = existing_id
        self.executed: list[tuple[str, tuple[object, ...] | None]] = []

    def cursor(self) -> RecordingCursor:
        return RecordingCursor(self)


class EventPipelineTest(unittest.TestCase):
    def test_normalize_record_maps_playtime_and_alias(self) -> None:
        dto = normalize_record(
            {
                "title": "행사",
                "contentid": "123",
                "addr1": "서울 종로구 세종대로",
                "eventstartdate": "20260812",
                "eventenddate": "20260813",
                "playtime": "10:00~18:00",
            }
        )
        self.assertIsNotNone(dto)
        assert dto is not None
        self.assertEqual(dto.event_time, "10:00~18:00")
        self.assertEqual(dto.start_date, date(2026, 8, 12))

        alias_dto = normalize_record(
            {
                "title": "별칭 행사",
                "contentid": "456",
                "eventplaytime": "19:30",
            }
        )
        self.assertIsNotNone(alias_dto)
        assert alias_dto is not None
        self.assertEqual(alias_dto.event_time, "19:30")

    def test_load_event_insert_includes_event_time_parameter(self) -> None:
        dto = normalize_record(
            {
                "title": "행사",
                "contentid": "123",
                "eventstartdate": "20260812",
                "eventenddate": "20260813",
                "playtime": "10:00~18:00",
            }
        )
        assert dto is not None
        conn = RecordingConnection()
        stats = EventLoadStats()

        load_event(conn, dto, stats)

        insert_sql, params = next((sql, params) for sql, params in conn.executed if "INSERT INTO event" in sql)
        assert params is not None
        self.assertIn("event_time", insert_sql)
        self.assertEqual(
            params,
            (
                None, "행사", "FESTIVAL", date(2026, 8, 12), date(2026, 8, 13),
                "10:00~18:00", "TOURAPI", "123",
            ),
        )
        self.assertEqual(stats.inserted, 1)

    def test_load_event_update_includes_event_time_parameter(self) -> None:
        dto = normalize_record(
            {
                "title": "갱신 행사",
                "contentid": "123",
                "eventplaytime": "19:30",
            }
        )
        assert dto is not None
        conn = RecordingConnection(existing_id=7)
        stats = EventLoadStats()

        load_event(conn, dto, stats)

        update_sql, params = next((sql, params) for sql, params in conn.executed if "UPDATE event SET" in sql)
        assert params is not None
        self.assertIn("event_time = %s", update_sql)
        self.assertEqual(
            params,
            (None, "갱신 행사", "FESTIVAL", None, None, "19:30", 7),
        )
        self.assertEqual(stats.updated, 1)


if __name__ == "__main__":
    unittest.main()
