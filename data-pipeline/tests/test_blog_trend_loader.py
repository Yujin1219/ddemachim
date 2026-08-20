from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "src" / "db" / "schema.sql"
MIGRATION_PATH = ROOT / "src" / "db" / "add_blog_trend_tables.sql"
SIMPLIFICATION_MIGRATION_PATH = ROOT / "src" / "db" / "migrate_simplify_blog_trend_persistence.sql"
CLEANUP_MIGRATION_PATH = ROOT / "src" / "db" / "migrate_remove_unused_blog_trend_places.sql"
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
    def test_schema_defines_weekly_run_and_minimal_place_result_contract(self) -> None:
        self.assertTrue(MIGRATION_PATH.exists(), "blog trend migration SQL must exist")
        self.assertTrue(
            SIMPLIFICATION_MIGRATION_PATH.exists(),
            "blog trend simplification migration SQL must exist",
        )

        for path in (SCHEMA_PATH, MIGRATION_PATH, SIMPLIFICATION_MIGRATION_PATH):
            sql = _compact_sql(path)
            self.assertIn("create table if not exists blog_trend_run", sql)
            self.assertIn("unique (run_week)", sql)
            self.assertIn("status varchar(10) not null", sql)
            self.assertIn("check (status in ('running', 'success', 'failed'))", sql)
            self.assertIn("started_at timestamptz not null", sql)
            self.assertIn("finished_at timestamptz", sql)
            self.assertIn("processed_place_count integer not null", sql)
            self.assertIn("result_count integer not null", sql)
            self.assertIn("failure_reason text", sql)
            self.assertIn("create table if not exists place_trend_result", sql)
            self.assertIn("run_id bigint not null references blog_trend_run(id)", sql)
            self.assertIn("place_id bigint not null references place(id)", sql)
            self.assertIn("status varchar(10) not null", sql)
            self.assertIn("check (status in ('watch', 'trending'))", sql)
            self.assertIn("recent_interest_average", sql)
            self.assertIn("previous_interest_average", sql)
            self.assertIn("interest_change_percent", sql)
            self.assertIn("measured_at", sql)
            self.assertIn("expires_at", sql)
            self.assertIn("unique (run_id, place_id)", sql)
            for obsolete in (
                "blog_trend_observation",
                "place_trend_snapshot",
                "place_trend_keyword",
                "body_topic_candidates",
                "trend_month_values",
            ):
                self.assertNotIn(f"create table if not exists {obsolete}", sql)

        migration_sql = _compact_sql(SIMPLIFICATION_MIGRATION_PATH)
        self.assertIn("begin", migration_sql)
        self.assertIn("drop table if exists blog_trend_observation", migration_sql)
        self.assertIn("drop table if exists place_trend_snapshot", migration_sql)
        self.assertIn("drop table if exists place_trend_keyword", migration_sql)
        self.assertIn("commit", migration_sql)
        dropped_tables = re.findall(r"drop table if exists ([a-z_]+)", migration_sql)
        self.assertEqual(
            set(dropped_tables),
            {"blog_trend_observation", "place_trend_snapshot", "place_trend_keyword"},
        )
        self.assertNotIn("drop schema", migration_sql)
        self.assertNotIn("truncate", migration_sql)

    def test_cleanup_migration_is_conservative_transactional_and_fk_safe(self) -> None:
        self.assertTrue(
            CLEANUP_MIGRATION_PATH.exists(),
            "unused blog-trend place cleanup migration SQL must exist",
        )
        cleanup_sql = _compact_sql(CLEANUP_MIGRATION_PATH)

        self.assertIn("begin", cleanup_sql)
        self.assertIn("commit", cleanup_sql)
        self.assertIn("lock table place in share row exclusive mode", cleanup_sql)
        self.assertIn("lock table place_source in share row exclusive mode", cleanup_sql)
        self.assertIn("create temp table blog_trend_place_cleanup_candidates", cleanup_sql)
        self.assertIn("p.tags @> array['blog_trend']::text[]", cleanup_sql)
        self.assertIn("cardinality(p.tags) = 1", cleanup_sql)
        self.assertIn("blog_source.source = 'naver_map'", cleanup_sql)
        self.assertIn("not exists ( select 1 from place_source as non_blog_source", cleanup_sql)
        self.assertIn("not exists ( select 1 from place_trend_result", cleanup_sql)
        self.assertIn("not exists ( select 1 from source_raw_data", cleanup_sql)
        self.assertIn("constraint_row.confrelid = 'public.place_source'::regclass", cleanup_sql)
        self.assertIn("place_source_id", cleanup_sql)
        for relation_table in (
            "place_operating_hours",
            "course_basket_item",
            "event",
            "filming_location",
        ):
            self.assertIn(f"not exists ( select 1 from {relation_table} as", cleanup_sql)
        self.assertIn("pg_constraint", cleanup_sql)
        self.assertIn("delete from place_source", cleanup_sql)
        self.assertIn("delete from place", cleanup_sql)
        self.assertLess(
            cleanup_sql.index("delete from place_source"),
            cleanup_sql.index("delete from place as place_row"),
        )
        self.assertNotIn("truncate", cleanup_sql)
        self.assertNotIn("drop schema", cleanup_sql)


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
        self.rolled_back = False

    def cursor(self) -> RecordingCursor:
        return self.recording_cursor

    def rollback(self) -> None:
        self.rolled_back = True


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
        "startedAt": "2026-08-13T01:00:00Z",
        "measuredAt": "2026-08-13T01:10:00Z",
        "expiresAt": "2026-08-20T01:10:00Z",
        "finishedAt": "2026-08-13T01:20:00Z",
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
                    "status": "SURGING",
                    "rising": True,
                    "trendRatio": 2.5,
                    "recentTrendValue": 50.0,
                    "previousTrendValue": 20.0,
                    "measuredAt": "2026-08-13T01:10:00Z",
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
    def test_naver_map_place_dto_prefers_reliable_matched_kakao_category(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "카페 이름",
            "canonicalRoadAddress": "서울특별시 종로구 계동길 37",
            "matched_place": {
                "category_group_code": "CE7",
                "category_name": "음식점 > 카페 > 테마카페",
            },
            "evidence": [
                {"postUrl": "https://blog.naver.com/a/1", "intent": "맛집"},
                {"postUrl": "https://blog.naver.com/b/2", "intent": "맛집"},
            ],
        }

        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)

        self.assertIsNotNone(dto)
        self.assertEqual(dto.category_code, "CAFE")
        self.assertEqual(dto.raw_category, "음식점 > 카페 > 테마카페")

    def test_naver_map_place_dto_falls_back_to_distinct_post_intent_evidence(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "식당 이름",
            "canonicalRoadAddress": "서울특별시 종로구 계동길 37",
            "evidence": [
                {"postUrl": "https://blog.naver.com/a/1", "intent": "맛집"},
                {"postUrl": "https://blog.naver.com/a/1", "intent": "맛집"},
                {"postUrl": "https://blog.naver.com/b/2", "query": "안국 맛집"},
                {"postUrl": "https://blog.naver.com/c/3", "intent": "카페"},
            ],
        }

        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)

        self.assertIsNotNone(dto)
        self.assertEqual(dto.category_code, "RESTAURANT")

    def test_naver_map_place_dto_leaves_tied_intents_unclassified(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "모호한 장소",
            "canonicalRoadAddress": "서울특별시 종로구 계동길 37",
            "evidence": [
                {"postUrl": "https://blog.naver.com/a/1", "intent": "맛집"},
                {"postUrl": "https://blog.naver.com/b/2", "intent": "카페"},
            ],
        }

        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)

        self.assertIsNotNone(dto)
        self.assertIsNone(dto.category_code)

    def test_naver_map_place_dto_leaves_conflicting_matched_kakao_categories_unclassified(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "모호한 장소",
            "canonicalRoadAddress": "서울특별시 종로구 계동길 37",
            "matched_places": [
                {"category_group_code": "CE7", "category_name": "음식점 > 카페"},
                {"category_group_code": "FD6", "category_name": "음식점 > 한식"},
            ],
            "evidence": [
                {"postUrl": "https://blog.naver.com/a/1", "intent": "맛집"},
                {"postUrl": "https://blog.naver.com/b/2", "intent": "카페"},
            ],
        }

        dto = blog_trend_loader.naver_map_place_dto_from_evidence(evidence)

        self.assertIsNotNone(dto)
        self.assertIsNone(dto.category_code)

    def test_trend_resolution_preserves_an_existing_place_category(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = ScriptedPlaceConnection(existing_source_id=808)
        evidence = {
            "canonicalPlaceId": "NAVER_MAP:13034552",
            "canonicalPlaceName": "카페 이름",
            "canonicalRoadAddress": "서울특별시 종로구 계동길 37",
            "matched_place": {
                "category_group_code": "CE7",
                "category_name": "음식점 > 카페",
            },
        }

        place_id = blog_trend_loader._resolve_place_id(connection, evidence)

        self.assertEqual(place_id, 808)
        update_sql, update_params = next(
            (sql, params)
            for sql, params in connection.recording_cursor.calls
            if "update place set" in sql
        )
        self.assertIn("when %s then coalesce(category_id, %s)", update_sql)
        self.assertTrue(update_params[4])

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
                "runsUpserted": 1,
                "placesResolved": 1,
                "placesSkipped": 1,
                "resultsSkipped": 0,
                "resultsUpserted": 1,
            },
        )

    def test_persist_run_upserts_only_minimal_place_result_fields(self) -> None:
        self.assertIsNotNone(blog_trend_loader, "blog trend loader module must exist")
        connection = RecordingConnection()

        stats = blog_trend_loader.persist_blog_trend_run(
            connection,
            _run_result(),
            place_resolver=lambda _connection, _evidence: 77,
        )

        statements = [sql for sql, _ in connection.recording_cursor.calls]
        self.assertTrue(any("insert into blog_trend_run" in sql for sql in statements))
        self.assertTrue(any("on conflict (run_week)" in sql for sql in statements))
        self.assertTrue(any("status = 'running'" in sql for sql in statements))
        self.assertTrue(any("status = 'success'" in sql for sql in statements))
        self.assertTrue(any("delete from place_trend_result where run_id" in sql for sql in statements))
        self.assertTrue(any("insert into place_trend_result" in sql for sql in statements))
        self.assertTrue(any("on conflict (run_id, place_id)" in sql for sql in statements))
        result_sql = next(sql for sql in statements if "insert into place_trend_result" in sql)
        for column in (
            "run_id",
            "place_id",
            "status",
            "recent_interest_average",
            "previous_interest_average",
            "interest_change_percent",
            "measured_at",
            "expires_at",
        ):
            self.assertIn(column, result_sql)
        for forbidden in (
            "blog_trend_observation",
            "place_trend_snapshot",
            "place_trend_keyword",
            "body_topic_candidates",
            "unique_posts",
            "trend_month_values",
        ):
            self.assertFalse(any(forbidden in sql for sql in statements), forbidden)
        self.assertEqual(
            stats.as_dict(),
            {
                "runsUpserted": 1,
                "placesResolved": 1,
                "placesSkipped": 0,
                "resultsSkipped": 0,
                "resultsUpserted": 1,
            },
        )

    def test_persist_run_marks_failed_for_retry_operations(self) -> None:
        connection = RecordingConnection()

        def fail_resolving(_connection: Any, _evidence: Any) -> int:
            raise RuntimeError("resolver failed")

        with self.assertRaises(RuntimeError):
            blog_trend_loader.persist_blog_trend_run(
                connection,
                _run_result(),
                place_resolver=fail_resolving,
            )

        statements = [sql for sql, _ in connection.recording_cursor.calls]
        self.assertTrue(connection.rolled_back)
        self.assertTrue(any("status = 'failed'" in sql for sql in statements))
        failure_params = next(
            params
            for sql, params in connection.recording_cursor.calls
            if "status = 'failed'" in sql
        )
        self.assertEqual(failure_params["failure_reason"], "RuntimeError")

    def test_persist_run_skips_blog_watch_when_search_trend_is_flat(self) -> None:
        connection = RecordingConnection()
        run_result = _run_result()
        run_result["evidence"][0]["trend"].update(
            {
                "status": "STABLE",
                "available": True,
                "recentInterestAverage": 20.0,
                "previousInterestAverage": 20.0,
            }
        )

        with patch.object(
            blog_trend_loader,
            "load_place",
            side_effect=AssertionError("place must not load"),
        ) as load_place_mock:
            stats = blog_trend_loader.persist_blog_trend_run(connection, run_result)

        load_place_mock.assert_not_called()
        self.assertEqual(stats.places_resolved, 0)
        self.assertEqual(stats.places_skipped, 0)
        self.assertEqual(stats.results_upserted, 0)
        self.assertEqual(stats.results_skipped, 1)
        success_params = next(
            params
            for sql, params in connection.recording_cursor.calls
            if "status = 'success'" in sql
        )
        self.assertEqual(success_params["processed_place_count"], 1)
        self.assertEqual(success_params["result_count"], 0)
        self.assertFalse(
            any("insert into place_trend_result" in sql for sql, _ in connection.recording_cursor.calls)
        )

    def test_persist_run_maps_stable_monthly_growth_to_watch(self) -> None:
        connection = RecordingConnection()
        run_result = _run_result()
        run_result["evidence"][0]["trend"].update(
            {
                "status": "STABLE",
                "available": True,
                "current": 1.5,
                "baseline": 1.0,
                "ratio": 1.5,
                "recentSearchInterestAverage": 1.5,
                "previous14dSearchInterestAverage": 1.0,
            }
        )

        stats = blog_trend_loader.persist_blog_trend_run(
            connection,
            run_result,
            place_resolver=lambda _connection, _evidence: 77,
        )

        self.assertEqual(stats.results_upserted, 1)
        result_params = next(
            params
            for sql, params in connection.recording_cursor.calls
            if "insert into place_trend_result" in sql
        )
        self.assertEqual(result_params["status"], "WATCH")

    def test_persist_run_skips_stable_monthly_decline(self) -> None:
        connection = RecordingConnection()
        run_result = _run_result()
        run_result["evidence"][0]["trend"].update(
            {
                "status": "STABLE",
                "available": True,
                "current": 0.9,
                "baseline": 1.0,
                "ratio": 0.9,
                "recentSearchInterestAverage": 0.9,
                "previous14dSearchInterestAverage": 1.0,
            }
        )

        stats = blog_trend_loader.persist_blog_trend_run(
            connection,
            run_result,
            place_resolver=lambda _connection, _evidence: 77,
        )

        self.assertEqual(stats.results_upserted, 0)
        self.assertEqual(stats.results_skipped, 1)
        self.assertFalse(
            any("insert into place_trend_result" in sql for sql, _ in connection.recording_cursor.calls)
        )

    def test_persist_run_stores_search_trend_surging_when_blog_evidence_is_insufficient(self) -> None:
        for search_status in ("SURGING", "NEWLY_EMERGING"):
            with self.subTest(search_status=search_status):
                connection = RecordingConnection()
                run_result = _run_result()
                run_result["evidence"][0]["classification"]["status"] = "INSUFFICIENT_EVIDENCE"
                run_result["evidence"][0]["trend"].update(
                    {
                        "status": search_status,
                        "available": True,
                        "recentInterestAverage": 50.0,
                        "previousInterestAverage": 20.0,
                    }
                )

                stats = blog_trend_loader.persist_blog_trend_run(
                    connection,
                    run_result,
                    place_resolver=lambda _connection, _evidence: 77,
                )

                self.assertEqual(stats.results_upserted, 1)
                result_params = next(
                    params
                    for sql, params in connection.recording_cursor.calls
                    if "insert into place_trend_result" in sql
                )
                self.assertEqual(result_params["status"], "TRENDING")

    def test_persist_run_uses_two_x_available_search_trend_as_trending(self) -> None:
        connection = RecordingConnection()
        run_result = _run_result()
        run_result["evidence"][0]["classification"]["status"] = "INSUFFICIENT_EVIDENCE"
        run_result["evidence"][0]["trend"].update(
            {
                "status": "RISING",
                "available": True,
                "recentInterestAverage": 20.0,
                "previousInterestAverage": 10.0,
            }
        )

        blog_trend_loader.persist_blog_trend_run(
            connection,
            run_result,
            place_resolver=lambda _connection, _evidence: 77,
        )

        result_params = next(
            params
            for sql, params in connection.recording_cursor.calls
            if "insert into place_trend_result" in sql
        )
        self.assertEqual(result_params["status"], "TRENDING")


if __name__ == "__main__":
    unittest.main()
