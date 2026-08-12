from __future__ import annotations

import sys
import unittest
from datetime import date, time
from pathlib import Path


PIPELINE_DIR = Path(__file__).resolve().parents[1]
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

from src.loaders.event_loader import EventLoadStats, load_culture_event, load_event  # noqa: E402
from src.normalizers.event import normalize_record  # noqa: E402
from src.normalizers.event_schedule import OPEN_WINDOW, SESSION, parse_event_schedules  # noqa: E402
from src.normalizers.event_time import parse_event_time_bounds  # noqa: E402
from src.normalizers.seoul_culture_event import normalize_record as normalize_culture_event  # noqa: E402


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
        last_sql = self.connection.executed[-1][0] if self.connection.executed else ""
        if "SELECT id FROM event" in last_sql and self.connection.existing_id is not None:
            return (self.connection.existing_id,)
        if "RETURNING id" in last_sql and self.connection.inserted_id is not None:
            return (self.connection.inserted_id,)
        return None


class RecordingConnection:
    def __init__(self, existing_id: int | None = None, inserted_id: int | None = 101) -> None:
        self.existing_id = existing_id
        self.inserted_id = inserted_id
        self.executed: list[tuple[str, tuple[object, ...] | None]] = []

    def cursor(self) -> RecordingCursor:
        return RecordingCursor(self)


class EventPipelineTest(unittest.TestCase):
    def test_parse_single_time_only_sets_start(self) -> None:
        bounds = parse_event_time_bounds("매주 월요일 09:30")

        self.assertEqual(bounds.event_start_time, time(9, 30))
        self.assertIsNone(bounds.event_end_time)

    def test_parse_simple_range_sets_both_bounds(self) -> None:
        bounds = parse_event_time_bounds("10:00 ~ 18:00")

        self.assertEqual(bounds.event_start_time, time(10, 0))
        self.assertEqual(bounds.event_end_time, time(18, 0))

    def test_parse_multiple_weekday_ranges_leaves_ambiguous_end_null(self) -> None:
        bounds = parse_event_time_bounds("월~금 10:00~18:00, 토 11:00-19:00")

        self.assertEqual(bounds.event_start_time, time(10, 0))
        self.assertIsNone(bounds.event_end_time)

    def test_parse_ambiguous_time_list_does_not_infer_end(self) -> None:
        bounds = parse_event_time_bounds("10:00 / 14:00")

        self.assertEqual(bounds.event_start_time, time(10, 0))
        self.assertIsNone(bounds.event_end_time)

    def test_parse_invalid_or_unsupported_time_returns_null_bound(self) -> None:
        self.assertEqual(parse_event_time_bounds("25:00~26:00").event_start_time, None)
        self.assertEqual(parse_event_time_bounds("25:00~26:00").event_end_time, None)
        self.assertEqual(parse_event_time_bounds("24:00").event_start_time, None)
        self.assertEqual(parse_event_time_bounds("24:00").event_end_time, None)

    def test_parse_plain_range_as_open_window(self) -> None:
        schedules = parse_event_schedules("10:00 ~ 18:00")

        self.assertEqual(len(schedules), 1)
        self.assertEqual(schedules[0].day_of_week, None)
        self.assertEqual(schedules[0].start_time, time(10, 0))
        self.assertEqual(schedules[0].end_time, time(18, 0))
        self.assertEqual(schedules[0].schedule_kind, OPEN_WINDOW)
        self.assertIsNone(schedules[0].duration_minutes)

    def test_parse_weekday_range_as_matching_day_row(self) -> None:
        schedules = parse_event_schedules("매주 수요일 10:00 ~ 12:00")

        self.assertEqual(len(schedules), 1)
        self.assertEqual(schedules[0].day_of_week, 3)
        self.assertEqual(schedules[0].schedule_kind, OPEN_WINDOW)

    def test_parse_weekday_range_expands_iso_days(self) -> None:
        schedules = parse_event_schedules("월~일 10:00~18:00")

        self.assertEqual([row.day_of_week for row in schedules], list(range(1, 8)))

    def test_parse_weekday_list_and_multiple_ranges(self) -> None:
        schedules = parse_event_schedules("수요일·목요일 10:00~12:00 / 14:00~16:00")

        self.assertEqual(len(schedules), 4)
        self.assertEqual(
            {(row.day_of_week, row.start_time, row.end_time) for row in schedules},
            {
                (3, time(10, 0), time(12, 0)),
                (3, time(14, 0), time(16, 0)),
                (4, time(10, 0), time(12, 0)),
                (4, time(14, 0), time(16, 0)),
            },
        )

    def test_parse_lone_and_listed_start_times_as_sessions(self) -> None:
        schedules = parse_event_schedules("10:00 / 11:00 / 14:30")

        self.assertEqual([row.start_time for row in schedules], [time(10, 0), time(11, 0), time(14, 30)])
        self.assertTrue(all(row.schedule_kind == SESSION for row in schedules))
        self.assertTrue(all(row.end_time is None for row in schedules))

    def test_parse_session_duration_and_derive_unambiguous_end(self) -> None:
        schedules = parse_event_schedules("1일 2회(10:00, 14:00), 회당 약 70분")

        self.assertEqual(len(schedules), 2)
        self.assertEqual(
            [(row.start_time, row.end_time, row.duration_minutes) for row in schedules],
            [(time(10, 0), time(11, 10), 70), (time(14, 0), time(15, 10), 70)],
        )
        self.assertTrue(all(row.schedule_kind == SESSION for row in schedules))

    def test_parse_hour_and_minute_duration_forms(self) -> None:
        for raw, duration, expected_end in (
            ("10:00, 2시간", 120, time(12, 0)),
            ("10:00, 80분", 80, time(11, 20)),
        ):
            with self.subTest(raw=raw):
                schedules = parse_event_schedules(raw)
                self.assertEqual(len(schedules), 1)
                self.assertEqual(schedules[0].duration_minutes, duration)
                self.assertEqual(schedules[0].end_time, expected_end)

    def test_parse_weekday_session_clauses_split_by_explicit_ellipsis(self) -> None:
        schedules = parse_event_schedules(
            "화-금, 일 11:00, 14:00 ... 토 11:00, 14:00, 16:30"
        )

        self.assertEqual(len(schedules), 13)
        self.assertEqual(
            {(row.day_of_week, row.start_time) for row in schedules},
            {
                (day, start)
                for day in (2, 3, 4, 5, 7)
                for start in (time(11, 0), time(14, 0))
            }
            | {(6, time(11, 0)), (6, time(14, 0)), (6, time(16, 30))},
        )

    def test_parse_duration_near_midnight_keeps_end_null(self) -> None:
        schedules = parse_event_schedules("23:30, 회당 약 70분")

        self.assertEqual(len(schedules), 1)
        self.assertEqual(schedules[0].duration_minutes, 70)
        self.assertIsNone(schedules[0].end_time)

    def test_parse_ambiguous_or_malformed_text_as_no_rows(self) -> None:
        for raw in (
            "프로그램별 상이",
            "홈페이지 참고",
            "시간 협의",
            "10:00 / 25:00",
            "24:00",
            "수요일 10:00~12:00, 목요일 14:00~16:00",
        ):
            with self.subTest(raw=raw):
                self.assertEqual(parse_event_schedules(raw), ())

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
        self.assertEqual(dto.event_start_time, time(10, 0))
        self.assertEqual(dto.event_end_time, time(18, 0))
        self.assertEqual(len(dto.schedules), 1)
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
        self.assertEqual(alias_dto.event_start_time, time(19, 30))
        self.assertIsNone(alias_dto.event_end_time)
        self.assertEqual(alias_dto.event_schedules, alias_dto.schedules)

    def test_culture_normalizer_maps_event_time_bounds(self) -> None:
        dto = normalize_culture_event(
            {
                "TITLE": "문화 행사",
                "STRTDATE": "2026-08-12 00:00:00.0",
                "END_DATE": "2026-08-13 00:00:00.0",
                "PRO_TIME": "10:00-18:00",
            }
        )

        self.assertIsNotNone(dto)
        assert dto is not None
        self.assertEqual(dto.event_time, "10:00-18:00")
        self.assertEqual(dto.event_start_time, time(10, 0))
        self.assertEqual(dto.event_end_time, time(18, 0))

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

        insert_sql, params = next((sql, params) for sql, params in conn.executed if "INSERT INTO event (" in sql)
        assert params is not None
        self.assertIn("event_time", insert_sql)
        self.assertEqual(
            params,
            (
                None, "행사", "FESTIVAL", date(2026, 8, 12), date(2026, 8, 13),
                "10:00~18:00", time(10, 0), time(18, 0), "TOURAPI", "123",
            ),
        )
        schedule_sql, schedule_params = next(
            (sql, params) for sql, params in conn.executed if "INSERT INTO event_schedule" in sql
        )
        assert schedule_params is not None
        self.assertIn("ON CONFLICT ON CONSTRAINT uq_event_schedule_identity", schedule_sql)
        self.assertEqual(
            schedule_params,
            (101, None, time(10, 0), time(18, 0), OPEN_WINDOW, None, "10:00~18:00"),
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
            (None, "갱신 행사", "FESTIVAL", None, None, "19:30", time(19, 30), None, 7),
        )
        self.assertTrue(any("DELETE FROM event_schedule" in sql for sql, _ in conn.executed))
        schedule_sql, schedule_params = next(
            (sql, params) for sql, params in conn.executed if "INSERT INTO event_schedule" in sql
        )
        assert schedule_params is not None
        self.assertEqual(
            schedule_params,
            (7, None, time(19, 30), None, SESSION, None, "19:30"),
        )
        self.assertEqual(stats.updated, 1)

    def test_load_culture_event_insert_includes_time_bounds(self) -> None:
        dto = normalize_culture_event(
            {
                "TITLE": "문화 행사",
                "STRTDATE": "2026-08-12 00:00:00.0",
                "END_DATE": "2026-08-13 00:00:00.0",
                "PRO_TIME": "10:00~18:00",
            }
        )
        assert dto is not None
        conn = RecordingConnection()
        stats = EventLoadStats()

        load_culture_event(conn, dto, stats)

        insert_sql, params = next((sql, params) for sql, params in conn.executed if "INSERT INTO event (" in sql)
        assert params is not None
        self.assertIn("event_start_time", insert_sql)
        self.assertIn("event_end_time", insert_sql)
        self.assertEqual(params[15:19], ("10:00~18:00", time(10, 0), time(18, 0), None))
        schedule_sql, schedule_params = next(
            (sql, params) for sql, params in conn.executed if "INSERT INTO event_schedule" in sql
        )
        assert schedule_params is not None
        self.assertEqual(
            schedule_params,
            (101, None, time(10, 0), time(18, 0), OPEN_WINDOW, None, "10:00~18:00"),
        )
        self.assertEqual(stats.inserted, 1)

    def test_load_culture_event_update_includes_time_bounds(self) -> None:
        dto = normalize_culture_event(
            {
                "TITLE": "갱신 문화 행사",
                "STRTDATE": "2026-08-12 00:00:00.0",
                "PRO_TIME": "18:30까지",
            }
        )
        assert dto is not None
        conn = RecordingConnection(existing_id=8)
        stats = EventLoadStats()

        load_culture_event(conn, dto, stats)

        update_sql, params = next((sql, params) for sql, params in conn.executed if "UPDATE event SET" in sql)
        assert params is not None
        self.assertIn("event_start_time = %s", update_sql)
        self.assertIn("event_end_time = %s", update_sql)
        self.assertEqual(params[13:18], ("18:30까지", None, time(18, 30), None, None))
        self.assertFalse(any("event_schedule" in sql for sql, _ in conn.executed))
        self.assertEqual(stats.updated, 1)

    def test_schema_and_migration_declare_nullable_time_columns(self) -> None:
        schema = (PIPELINE_DIR / "src" / "db" / "schema.sql").read_text(encoding="utf-8")
        migration = (PIPELINE_DIR / "src" / "db" / "add_event_time_bounds.sql").read_text(encoding="utf-8")
        schedule_migration = (PIPELINE_DIR / "src" / "db" / "add_event_schedule.sql").read_text(encoding="utf-8")

        self.assertIn("event_start_time time", schema)
        self.assertIn("event_end_time   time", schema)
        self.assertIn("ADD COLUMN IF NOT EXISTS event_start_time time", migration)
        self.assertIn("ADD COLUMN IF NOT EXISTS event_end_time time", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS event_schedule", schema)
        self.assertIn("ON DELETE CASCADE", schema)
        self.assertIn("UNIQUE NULLS NOT DISTINCT", schema)
        self.assertIn("CREATE TABLE IF NOT EXISTS event_schedule", schedule_migration)
        self.assertIn("uq_event_schedule_identity", schedule_migration)


if __name__ == "__main__":
    unittest.main()
