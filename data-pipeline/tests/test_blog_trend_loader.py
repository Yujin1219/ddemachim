from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "src" / "db" / "schema.sql"
MIGRATION_PATH = ROOT / "src" / "db" / "add_blog_trend_tables.sql"
REMOVAL_MIGRATION_PATH = ROOT / "src" / "db" / "migrate_remove_blog_trend_topics.sql"
INTEREST_MIGRATION_PATH = ROOT / "src" / "db" / "add_search_trend_interest_columns.sql"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from src.loaders import blog_trend_loader
    from src.loaders.place_loader import LoadStats, load_place
    from src.models.place_dto import PlaceDTO
except ImportError:
    blog_trend_loader = None


def _compact_sql(path: Path) -> str:
    return re.sub(r"\s+", " ", path.read_text(encoding="utf-8")).lower()


class BlogTrendSchemaTest(unittest.TestCase):
    def test_schema_defines_normalized_blog_trend_tables_and_identities(self) -> None:
        self.assertTrue(MIGRATION_PATH.exists(), "blog trend migration SQL must exist")
        self.assertTrue(
            REMOVAL_MIGRATION_PATH.exists(),
            "blog trend topic removal migration SQL must exist",
        )
        self.assertTrue(
            INTEREST_MIGRATION_PATH.exists(),
            "Search Trend interest migration SQL must exist",
        )

        for path in (SCHEMA_PATH, MIGRATION_PATH):
            sql = _compact_sql(path)
            self.assertIn("create table if not exists blog_trend_observation", sql)
            self.assertIn("create table if not exists place_trend_snapshot", sql)
            self.assertNotIn("create table if not exists place_trend_keyword", sql)
            self.assertNotIn("body_topic_candidates", sql)
            self.assertNotIn("explanation_available", sql)
            self.assertNotIn("explanation_summary", sql)
            self.assertNotIn("explanation_source", sql)
            self.assertNotIn("explanation_minimum_authors", sql)
            self.assertNotIn("explanation_reason", sql)
            self.assertIn("unique (collection_date, query, post_url)", sql)
            self.assertIn("unique (place_id, snapshot_date)", sql)

        removal_sql = _compact_sql(REMOVAL_MIGRATION_PATH)
        self.assertIn("begin", removal_sql)
        self.assertIn("drop table if exists place_trend_keyword", removal_sql)
        self.assertIn(
            "alter table blog_trend_observation drop column if exists body_topic_candidates",
            removal_sql,
        )
        for column in (
            "explanation_available",
            "explanation_summary",
            "explanation_source",
            "explanation_minimum_authors",
            "explanation_reason",
        ):
            self.assertIn(
                f"alter table place_trend_snapshot drop column if exists {column}",
                removal_sql,
            )
        self.assertIn("commit", removal_sql)

        for path in (SCHEMA_PATH, MIGRATION_PATH, INTEREST_MIGRATION_PATH):
            sql = _compact_sql(path)
            self.assertIn("trend_time_unit", sql)
            self.assertIn("trend_baseline_months", sql)
            self.assertIn("trend_comparison_label", sql)
            self.assertIn("trend_current_month", sql)
            self.assertIn("trend_current_value", sql)
            self.assertIn("trend_baseline_value", sql)
            self.assertIn("monthly_ratio", sql)
            self.assertIn("trend_partial_month_adjusted", sql)
            self.assertIn("trend_partial_month_days_used", sql)
            self.assertIn("trend_month_values", sql)


class RecordingCursor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Any]] = []

    def __enter__(self) -> "RecordingCursor":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def execute(self, sql: str, params: Any = None) -> None:
        self.calls.append((re.sub(r"\s+", " ", sql).strip().lower(), params))

    def fetchone(self) -> tuple[int]:
        return (101,)


class RecordingConnection:
    def __init__(self) -> None:
        self.recording_cursor = RecordingCursor()

    def cursor(self) -> RecordingCursor:
        return self.recording_cursor


class ScriptedPlaceCursor:
    def __init__(self, connection: "ScriptedPlaceConnection") -> None:
        self.connection = connection
        self.calls: list[tuple[str, Any]] = []
        self.last_sql = ""

    def __enter__(self) -> "ScriptedPlaceCursor":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def execute(self, sql: str, params: Any = None) -> None:
        self.last_sql = re.sub(r"\s+", " ", sql).strip().lower()
        self.calls.append((self.last_sql, params))
        if "insert into place_source" in self.last_sql:
            self.connection.existing_source_id = params[0]

    def fetchone(self) -> tuple[int] | None:
        if "select place_id from place_source" in self.last_sql:
            if self.connection.existing_source_id is None:
                return None
            return (self.connection.existing_source_id,)
        if "insert into place (" in self.last_sql:
            return (self.connection.inserted_place_id,)
        if "select st_distanceSphere" in self.last_sql:
            return (self.connection.distance_m,)
        return (101,)

    def fetchall(self) -> list[tuple[Any, ...]]:
        if "select id, st_x(location)" in self.last_sql:
            return [
                (place_id, longitude, latitude)
                for place_id, longitude, latitude, _road_address in self.connection.match_candidates
            ]
        if "select id, road_address" in self.last_sql:
            return [
                (place_id, road_address)
                for place_id, _longitude, _latitude, road_address in self.connection.match_candidates
            ]
        return []


class ScriptedPlaceConnection:
    def __init__(
        self,
        existing_source_id: int | None = None,
        inserted_place_id: int = 501,
        match_candidates: list[tuple[int, float | None, float | None, str | None]] | None = None,
        distance_m: float = 101.0,
    ) -> None:
        self.existing_source_id = existing_source_id
        self.inserted_place_id = inserted_place_id
        self.match_candidates = match_candidates or []
        self.distance_m = distance_m
        self.recording_cursor = ScriptedPlaceCursor(self)

    def cursor(self) -> ScriptedPlaceCursor:
        return self.recording_cursor


def _run_result() -> dict[str, Any]:
    observation = {
        "collectionDate": "2026-08-13",
        "query": "안국 요즘 뜨는 곳",
        "postUrl": "https://blog.naver.com/a/1",
        "author": "https://blog.naver.com/a",
        "authorName": "작성자",
        "publishedAt": "20260812",
        "collectedAt": "2026-08-13T01:00:00Z",
        "region": "안국",
        "intent": "요즘 뜨는 곳",
        "intentCategory": "DISCOVERY",
        "searchRank": 2,
        "observedPlaceName": "지도 장소명",
        "isAdSuspected": False,
        "adSignals": [],
    }
    return {
        "collectionDate": "2026-08-13",
        "semantics": "sample observations only",
        "validation": [],
        "evidence": [
            {
                "canonicalPlaceId": "NAVER_MAP:map-1",
                "canonicalPlaceName": "네이버 지도명",
                "aliases": ["지도 장소명"],
                "uniquePosts": 3,
                "uniqueAuthors": 3,
                "uniqueQueries": 2,
                "uniqueIntentCategories": 2,
                "collectionDays": 2,
                "recentObservedPosts": 3,
                "averageObservedRank": 2.5,
                "firstObservedAt": "2026-08-12T01:00:00Z",
                "latestObservedAt": "2026-08-13T01:00:00Z",
                "adSuspectedRatio": 0.0,
                "trend": {
                    "available": True,
                    "rising": True,
                    "trendRatio": 2.5,
                    "recentTrendValue": 50.0,
                    "previousTrendValue": 20.0,
                    "recentNonzeroObservations": 7,
                    "baselineNonzeroObservations": 28,
                    "reason": "ratio_checked",
                    "trendCheckedAt": "2026-08-13T01:10:00Z",
                },
                "classification": {
                    "status": "WATCH",
                    "minimumEvidencePassed": True,
                    "watchSignalCount": 3,
                },
                "evidence": [observation],
            }
        ],
    }


class BlogTrendLoaderTest(unittest.TestCase):
    def test_resolve_attaches_single_address_matching_candidate_after_distance_review(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection(
            match_candidates=[
                (
                    7919,
                    126.9850839,
                    37.581354,
                    "서울특별시 종로구 계동길 37 (계동)",
                )
            ],
            distance_m=293.0,
        )
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "북촌 한옥마을",
            "canonicalRoadAddress": "서울특별시 종로구 계동길 37",
            "canonicalLongitude": 126.9850839,
            "canonicalLatitude": 37.581354,
        }

        place_id = blog_trend_loader._resolve_place_id(connection, evidence)

        self.assertEqual(place_id, 7919)
        self.assertFalse(
            any("insert into place (" in sql for sql, _ in connection.recording_cursor.calls)
        )
        self.assertTrue(any("update place set" in sql for sql, _ in connection.recording_cursor.calls))
        source_upsert = next(
            params
            for sql, params in connection.recording_cursor.calls
            if "insert into place_source" in sql
        )
        self.assertEqual(source_upsert, (7919, "NAVER_MAP", "13034552", True))

    def test_address_mismatch_remains_review_required_in_scoped_path(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection(
            match_candidates=[
                (7919, 126.9850839, 37.581354, "서울특별시 종로구 삼청로 1")
            ],
            distance_m=293.0,
        )
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "북촌 한옥마을",
            "canonicalRoadAddress": "서울특별시 종로구 계동길 37",
            "canonicalLongitude": 126.9850839,
            "canonicalLatitude": 37.581354,
        }
        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)
        self.assertIsNotNone(dto)
        stats = LoadStats()

        place_id = load_place(
            connection,
            dto,
            stats,
            allow_blog_trend_naver_map_without_coordinates=True,
            allow_blog_trend_naver_map_address_match=True,
        )

        self.assertIsNone(place_id)
        self.assertEqual(stats.review_required, 1)
        self.assertEqual(stats.review_records[0]["candidate_place_id"], 7919)
        self.assertFalse(
            any("insert into place_source" in sql for sql, _ in connection.recording_cursor.calls)
        )

    def test_multiple_same_name_district_candidates_remain_review_required(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection(
            match_candidates=[
                (7919, 126.9850839, 37.581354, "서울특별시 종로구 계동길 37 (계동)"),
                (7920, 126.9852, 37.5815, "서울특별시 종로구 계동길 37"),
            ],
            distance_m=293.0,
        )
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "북촌 한옥마을",
            "canonicalRoadAddress": "서울특별시 종로구 계동길 37",
            "canonicalLongitude": 126.9850839,
            "canonicalLatitude": 37.581354,
        }
        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)
        self.assertIsNotNone(dto)
        stats = LoadStats()

        place_id = load_place(
            connection,
            dto,
            stats,
            allow_blog_trend_naver_map_without_coordinates=True,
            allow_blog_trend_naver_map_address_match=True,
        )

        self.assertIsNone(place_id)
        self.assertEqual(stats.review_required, 1)
        self.assertIsNone(stats.review_records[0]["candidate_place_id"])
        self.assertFalse(
            any("insert into place_source" in sql for sql, _ in connection.recording_cursor.calls)
        )

    def test_resolve_persists_coordinate_less_confirmed_jongno_naver_map_place(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection()
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "종로 장소",
            "canonicalRoadAddress": "서울 종로구 율곡로 1",
            "canonicalPhone": "02-1234-5678",
        }

        place_id = blog_trend_loader._resolve_place_id(connection, evidence)

        self.assertEqual(place_id, 501)
        place_insert = next(
            params
            for sql, params in connection.recording_cursor.calls
            if "insert into place (" in sql
        )
        self.assertEqual(place_insert[0], "종로 장소")
        self.assertEqual(place_insert[3], "서울 종로구 율곡로 1")
        self.assertIsNone(place_insert[6])
        self.assertIsNone(place_insert[7])
        self.assertEqual(place_insert[10], "02-1234-5678")
        self.assertEqual(place_insert[12], ["BLOG_TREND"])
        source_insert = next(
            params
            for sql, params in connection.recording_cursor.calls
            if "insert into place_source" in sql
        )
        self.assertEqual(source_insert, (501, "NAVER_MAP", "13034552", False))

    def test_resolve_reuses_naver_map_source_identity_on_repeat(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection()
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "종로 장소",
            "canonicalRoadAddress": "서울 종로구 율곡로 1",
            "canonicalPhone": "02-1234-5678",
        }

        first_place_id = blog_trend_loader._resolve_place_id(connection, evidence)
        second_place_id = blog_trend_loader._resolve_place_id(connection, evidence)

        self.assertEqual(first_place_id, second_place_id)
        self.assertEqual(
            sum("insert into place (" in sql for sql, _ in connection.recording_cursor.calls),
            1,
        )
        self.assertEqual(
            sum("insert into place_source" in sql for sql, _ in connection.recording_cursor.calls),
            2,
        )
        self.assertEqual(
            sum("update place set" in sql for sql, _ in connection.recording_cursor.calls),
            1,
        )

    def test_resolve_preserves_existing_source_update_behavior(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection(existing_source_id=808)
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "종로 장소",
            "canonicalRoadAddress": "서울 종로구 율곡로 1",
        }

        place_id = blog_trend_loader._resolve_place_id(connection, evidence)

        self.assertEqual(place_id, 808)
        self.assertFalse(
            any("insert into place (" in sql for sql, _ in connection.recording_cursor.calls)
        )
        self.assertTrue(any("update place set" in sql for sql, _ in connection.recording_cursor.calls))
        source_upsert = next(
            params
            for sql, params in connection.recording_cursor.calls
            if "insert into place_source" in sql
        )
        self.assertEqual(source_upsert, (808, "NAVER_MAP", "13034552", False))

    def test_coordinate_less_override_rejects_out_of_jongno_places(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection()
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:outside-1",
            "canonicalPlaceName": "마포 장소",
            "canonicalRoadAddress": "서울 마포구 월드컵로 1",
        }
        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)
        self.assertIsNotNone(dto)

        place_id = load_place(
            connection,
            dto,
            LoadStats(),
            allow_blog_trend_naver_map_without_coordinates=True,
        )

        self.assertIsNone(place_id)
        self.assertFalse(
            any("insert into place (" in sql for sql, _ in connection.recording_cursor.calls)
        )

    def test_generic_loader_still_skips_coordinate_less_no_match(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection()
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "종로 장소",
            "canonicalRoadAddress": "서울 종로구 율곡로 1",
        }
        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)
        self.assertIsNotNone(dto)
        stats = LoadStats()

        place_id = load_place(connection, dto, stats)

        self.assertIsNone(place_id)
        self.assertEqual(stats.skipped_no_coordinates, 1)
        self.assertFalse(
            any("insert into place (" in sql for sql, _ in connection.recording_cursor.calls)
        )

    def test_coordinate_less_override_does_not_relax_other_sources(self) -> None:
        connection = ScriptedPlaceConnection()
        dto = PlaceDTO(
            name="종로 장소",
            road_address="서울 종로구 율곡로 1",
            lot_address=None,
            latitude=None,
            longitude=None,
            phone=None,
            raw_category=None,
            description=None,
            source="TOURAPI",
            source_id="tour-1",
            district="종로구",
            normalized_name="종로장소",
            tags=["BLOG_TREND"],
            has_coordinates=False,
        )
        stats = LoadStats()

        place_id = load_place(
            connection,
            dto,
            stats,
            allow_blog_trend_naver_map_without_coordinates=True,
        )

        self.assertIsNone(place_id)
        self.assertEqual(stats.skipped_no_coordinates, 1)
        self.assertFalse(
            any("insert into place (" in sql for sql, _ in connection.recording_cursor.calls)
        )

    def test_naver_map_place_dto_prefers_an_enriched_observation(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:map-1",
            "canonicalPlaceName": "네이버 지도명",
            "evidence": [
                {
                    "canonicalPlaceId": "NAVER_MAP:map-1",
                    "canonicalPlaceName": "네이버 지도명",
                },
                {
                    "canonicalPlaceId": "NAVER_MAP:map-1",
                    "canonicalPlaceName": "네이버 지도명",
                    "canonicalSource": "NAVER_MAP",
                    "canonicalRoadAddress": "서울 종로구 율곡로 1",
                    "canonicalLongitude": 126.99,
                    "canonicalLatitude": 37.58,
                },
            ],
        }

        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)

        self.assertIsNotNone(dto)
        self.assertTrue(dto.has_coordinates)
        self.assertEqual(dto.source, "NAVER_MAP")
        self.assertEqual(dto.source_id, "map-1")
        self.assertIsNone(dto.category_code)
        self.assertEqual(dto.district, "종로구")

    def test_persist_run_skips_unresolved_place_and_keeps_resolved_snapshots(self) -> None:
        connection = RecordingConnection()
        run_result = _run_result()
        unresolved = dict(run_result["evidence"][0])
        unresolved["canonicalPlaceId"] = "NAVER_MAP:unresolved"
        run_result["evidence"] = [unresolved, run_result["evidence"][0]]
        resolved_ids = iter((None, 77))

        stats = blog_trend_loader.persist_blog_trend_run(
            connection,
            run_result,
            place_resolver=lambda _connection, _evidence: next(resolved_ids),
        )

        self.assertEqual(
            stats.as_dict(),
            {
                "placesResolved": 1,
                "placesSkipped": 1,
                "observationsUpserted": 1,
                "snapshotsUpserted": 1,
            },
        )

    def test_persist_run_upserts_observation_and_snapshot_without_topic_storage(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = RecordingConnection()

        stats = blog_trend_loader.persist_blog_trend_run(
            connection,
            _run_result(),
            place_resolver=lambda _connection, _evidence: 77,
        )

        statements = [sql for sql, _ in connection.recording_cursor.calls]
        self.assertTrue(any("insert into blog_trend_observation" in sql for sql in statements))
        self.assertTrue(any("on conflict (collection_date, query, post_url)" in sql for sql in statements))
        self.assertTrue(any("insert into place_trend_snapshot" in sql for sql in statements))
        self.assertTrue(any("on conflict (place_id, snapshot_date)" in sql for sql in statements))
        for forbidden in (
            "place_trend_keyword",
            "body_topic_candidates",
            "explanation_available",
            "explanation_summary",
            "explanation_source",
            "explanation_minimum_authors",
            "explanation_reason",
        ):
            self.assertFalse(any(forbidden in sql for sql in statements), forbidden)
        self.assertEqual(
            stats.as_dict(),
            {
                "placesResolved": 1,
                "placesSkipped": 0,
                "observationsUpserted": 1,
                "snapshotsUpserted": 1,
            },
        )


if __name__ == "__main__":
    unittest.main()
