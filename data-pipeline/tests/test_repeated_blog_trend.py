from __future__ import annotations

import json
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import repeated_blog_trend as repeated_blog_trend_module  # noqa: E402

from repeated_blog_trend import (  # noqa: E402
    ObservationStore,
    aggregate_place_evidence,
    classify_place,
    generate_queries,
    group_posts,
    load_config,
    normalize_search_item,
    select_body_targets,
    trend_signal,
)
from src.loaders.blog_trend_loader import _search_trend_status  # noqa: E402


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "blog_trend_discovery.json"
AS_OF = date(2026, 8, 13)
CANONICAL_REGIONS = [
    "안국",
    "서촌",
    "익선동",
    "삼청동",
    "혜화",
    "부암동",
    "서순라길",
    "창신동",
    "동묘",
]
CANONICAL_ALIASES = {
    "안국": ["안국", "북촌"],
    "서촌": ["서촌", "경복궁"],
    "익선동": ["익선동", "종로3가"],
    "삼청동": ["삼청동"],
    "혜화": ["혜화", "대학로"],
    "부암동": ["부암동"],
    "서순라길": ["서순라길", "종묘"],
    "창신동": ["창신동"],
    "동묘": ["동묘", "숭인동"],
}


def observation(
    *,
    url: str = "https://blog.naver.com/a/1",
    query: str = "안국 카페",
    author: str = "https://blog.naver.com/a",
    day: str = "2026-08-13",
    rank: int = 1,
    place_id: str | None = None,
    ad: bool = False,
) -> dict:
    row = {
        "postUrl": url,
        "query": query,
        "region": "안국",
        "intent": "카페",
        "intentCategory": "FOOD",
        "title": "새 장소 방문",
        "description": "후기",
        "author": author,
        "publishedAt": "20260813",
        "searchRank": rank,
        "collectionDate": day,
        "collectedAt": f"{day}T01:00:00Z",
        "isAdSuspected": ad,
        "adSignals": ["협찬"] if ad else [],
    }
    if place_id:
        row["canonicalPlaceId"] = place_id
        row["canonicalPlaceName"] = "테스트카페"
    return row


class RepeatedBlogTrendTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load_config(CONFIG_PATH)

    def test_default_query_generation_is_nine_regions_times_two_fixed_intents(self) -> None:
        queries = generate_queries(self.config, AS_OF)
        expected = [
            (
                f"{region} {intent}",
                region,
                intent,
                "CAFE" if intent == "카페" else "RESTAURANT",
                CANONICAL_ALIASES[region],
            )
            for region in CANONICAL_REGIONS
            for intent in ("카페", "맛집")
        ]

        self.assertEqual(len(queries), 18)
        self.assertEqual(
            [
                (
                    row["query"],
                    row["region"],
                    row["intent"],
                    row["intentCategory"],
                    row["regionAliases"],
                )
                for row in queries
            ],
            expected,
        )
        self.assertEqual(len({row["region"] for row in queries}), 9)

    def test_query_plan_uses_only_cafe_and_restaurant_intents(self) -> None:
        queries = generate_queries(self.config, AS_OF)

        self.assertEqual({row["intent"] for row in queries}, {"카페", "맛집"})
        self.assertEqual(
            {row["intentCategory"] for row in queries},
            {"CAFE", "RESTAURANT"},
        )
        self.assertFalse(
            any(
                term in row["query"]
                for row in queries
                for term in ("팝업", "전시", "포토존", "핫플", "웨이팅", "요즘 뜨는 곳")
            )
        )

    def test_query_generation_is_deterministic_across_collection_dates(self) -> None:
        first = generate_queries(self.config, AS_OF)
        repeated = generate_queries(self.config, AS_OF)
        following = generate_queries(self.config, date(2026, 8, 14))
        self.assertEqual(first, repeated)
        self.assertEqual(first, following)

    def test_region_aliases_are_metadata_without_alias_queries(self) -> None:
        queries = generate_queries(self.config, AS_OF)

        for region in CANONICAL_REGIONS:
            rows = [row for row in queries if row["region"] == region]
            self.assertEqual([row["query"] for row in rows], [f"{region} 카페", f"{region} 맛집"])
            self.assertEqual(rows[0]["regionAliases"], CANONICAL_ALIASES[region])
            for alias in CANONICAL_ALIASES[region][1:]:
                self.assertNotIn(f"{alias} 카페", [row["query"] for row in queries])
                self.assertNotIn(f"{alias} 맛집", [row["query"] for row in queries])

    def test_alias_region_input_resolves_to_its_canonical_query_group(self) -> None:
        queries = generate_queries(self.config, AS_OF, regions=["북촌"])

        self.assertEqual([row["query"] for row in queries], ["안국 카페", "안국 맛집"])
        self.assertEqual([row["region"] for row in queries], ["안국", "안국"])
        self.assertEqual(queries[0]["regionAliases"], ["안국", "북촌"])

    def test_configured_metadata_and_body_defaults_are_applied(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            exit_code = repeated_blog_trend_module.main(
                ["--config", str(CONFIG_PATH), "--date", "2026-08-13", "--dry-run", "--skip-db"]
            )

        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(result["maximumMetadata"], 5400)
        self.assertEqual(result["pageCount"], 54)
        self.assertEqual(result["pageSize"], 100)
        self.assertEqual(result["maxResultsPerQuery"], 300)
        self.assertEqual(result["windowDays"], 7)
        self.assertEqual(result["overlapDays"], 1)
        self.assertNotIn("bodyLimit", result)
        self.assertEqual(len(result["queryPlan"]), 18)

    def test_config_removes_live_body_sampling_limits(self) -> None:
        search = self.config["search"]
        trend = self.config["trend"]

        self.assertEqual(search["pageSize"], 100)
        self.assertEqual(search["maxResultsPerQuery"], 300)
        self.assertEqual(search["windowDays"], 7)
        self.assertEqual(search["overlapDays"], 1)
        self.assertNotIn("bodyLimit", self.config.get("selection", {}))
        self.assertNotIn("quotas", self.config.get("selection", {}))
        self.assertEqual(trend["timeUnit"], "month")
        self.assertEqual(trend["baselineMonths"], 3)
        self.assertNotIn("recentDays", trend)
        self.assertNotIn("baselineDays", trend)
        self.assertNotIn("minimumRecentNonzeroObservations", trend)
        self.assertNotIn("minimumBaselineNonzeroObservations", trend)

    def test_bootstrap_window_is_last_seven_calendar_days_inclusive(self) -> None:
        derive_window = getattr(repeated_blog_trend_module, "derive_collection_window", None)
        self.assertIsNotNone(derive_window, "weekly collection window helper must exist")

        window = derive_window(self.config, collection_date=AS_OF)

        self.assertEqual(window["start"], date(2026, 8, 7))
        self.assertEqual(window["end"], AS_OF)
        self.assertEqual(window["mode"], "bootstrap")

    def test_incremental_window_overlaps_latest_successful_boundary_by_one_day(self) -> None:
        derive_window = getattr(repeated_blog_trend_module, "derive_collection_window", None)
        self.assertIsNotNone(derive_window, "weekly collection window helper must exist")

        window = derive_window(
            self.config,
            collection_date=AS_OF,
            latest_successful_boundary=date(2026, 8, 10),
        )

        self.assertEqual(window["start"], date(2026, 8, 9))
        self.assertEqual(window["end"], AS_OF)
        self.assertEqual(window["mode"], "incremental")
        self.assertEqual(window["latestSuccessfulBoundary"], "2026-08-10")

    def test_page_stops_after_page_contains_posts_older_than_window(self) -> None:
        calls: list[tuple[int, int]] = []

        def page(
            _client_id: str,
            _client_secret: str,
            _query: str,
            start: int,
            display: int,
        ) -> dict:
            calls.append((start, display))
            if start == 1:
                dates = ["20260813"] * display
            else:
                dates = ["20260807"] * 4 + ["20260806"] * (display - 4)
            return {
                "items": [
                    {
                        "link": f"https://blog.naver.com/author/{start + offset}",
                        "postdate": postdate,
                    }
                    for offset, postdate in enumerate(dates)
                ]
            }

        items = repeated_blog_trend_module.fetch_query_pages(
            "client-id",
            "client-secret",
            "안국 카페",
            300,
            window_start=date(2026, 8, 7),
            window_end=AS_OF,
            search_page=page,
        )

        self.assertEqual(len(items), 104)
        self.assertEqual(calls, [(1, 100), (101, 100)])

    def test_page_stops_when_response_has_no_next_page(self) -> None:
        calls: list[tuple[int, int]] = []

        def page(
            _client_id: str,
            _client_secret: str,
            _query: str,
            start: int,
            display: int,
        ) -> dict:
            calls.append((start, display))
            return {
                "items": [
                    {
                        "link": f"https://blog.naver.com/author/{index}",
                        "postdate": "20260813",
                    }
                    for index in range(40)
                ]
            }

        items = repeated_blog_trend_module.fetch_query_pages(
            "client-id",
            "client-secret",
            "안국 카페",
            300,
            window_start=date(2026, 8, 7),
            window_end=AS_OF,
            search_page=page,
        )

        self.assertEqual(len(items), 40)
        self.assertEqual(calls, [(1, 100)])

    def test_page_fetch_honors_hard_cap_of_three_pages_per_query(self) -> None:
        calls: list[tuple[int, int]] = []

        def page(
            _client_id: str,
            _client_secret: str,
            _query: str,
            start: int,
            display: int,
        ) -> dict:
            calls.append((start, display))
            return {
                "items": [
                    {
                        "link": f"https://blog.naver.com/author/{start + offset}",
                        "postdate": "20260813",
                    }
                    for offset in range(display)
                ]
            }

        items = repeated_blog_trend_module.fetch_query_pages(
            "client-id",
            "client-secret",
            "안국 카페",
            300,
            window_start=date(2026, 8, 7),
            window_end=AS_OF,
            search_page=page,
        )

        self.assertEqual(len(items), 300)
        self.assertEqual(calls, [(1, 100), (101, 100), (201, 100)])

    def test_cross_query_dedupe_uses_normalized_url(self) -> None:
        grouped = group_posts(
            [
                observation(url="https://blog.naver.com/a/1?trackingCode=first", query="안국 카페"),
                observation(url="https://blog.naver.com/a/1?trackingCode=second", query="안국 맛집"),
            ]
        )

        self.assertEqual(len(grouped), 1)
        self.assertEqual(grouped[0]["queries"], ["안국 맛집", "안국 카페"])

        post_view_grouped = group_posts(
            [
                observation(
                    url=(
                        "https://blog.naver.com/PostView.naver?blogId=a&logNo=1"
                        "&trackingCode=first"
                    ),
                    query="안국 카페",
                ),
                observation(
                    url=(
                        "https://blog.naver.com/PostView.naver?trackingCode=second"
                        "&logNo=1&blogId=a"
                    ),
                    query="안국 맛집",
                ),
            ]
        )

        self.assertEqual(len(post_view_grouped), 1)

    def test_all_unique_in_window_posts_are_body_targets(self) -> None:
        select_all = getattr(repeated_blog_trend_module, "select_all_body_targets", None)
        self.assertIsNotNone(select_all, "live body target selection must be unbounded")
        grouped = group_posts(
            [
                observation(url="https://blog.naver.com/a/1", query="안국 카페"),
                observation(url="https://blog.naver.com/a/1", query="안국 맛집"),
                observation(url="https://blog.naver.com/b/2", query="서촌 카페"),
            ]
        )

        selected = select_all(grouped)

        self.assertEqual({post["postUrl"] for post in selected}, {
            "https://blog.naver.com/a/1",
            "https://blog.naver.com/b/2",
        })
        self.assertEqual(
            selected[0]["sampleQueries"],
            selected[0]["queries"],
        )

    def test_live_path_sends_all_unique_in_window_posts_to_body_extractor(self) -> None:
        config = json.loads(json.dumps(self.config, ensure_ascii=False))
        config["regions"] = ["안국"]
        config["queryGeneration"]["intents"] = [{"category": "FOOD", "phrase": "카페"}]
        captured: list[dict] = []

        def extract(
            selected_posts,
            *,
            fetch_bodies,
            fetcher,
        ):
            captured.extend(selected_posts)
            return (
                [],
                repeated_blog_trend_module.Counter(),
                {
                    "fetched_posts": 0,
                    "map_found_posts": 0,
                    "extracted_place_count": 0,
                },
            )

        items = [
            {
                "link": "https://blog.naver.com/a/1",
                "title": "one",
                "postdate": "20260813",
                "bloggerlink": "https://blog.naver.com/a",
            },
            {
                "link": "https://blog.naver.com/a/1?trackingCode=duplicate",
                "title": "duplicate",
                "postdate": "20260813",
                "bloggerlink": "https://blog.naver.com/a",
            },
            {
                "link": "https://blog.naver.com/b/2",
                "title": "two",
                "postdate": "20260812",
                "bloggerlink": "https://blog.naver.com/b",
            },
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(repeated_blog_trend_module, "load_dotenv"), patch.dict(
                repeated_blog_trend_module.os.environ,
                {
                    "NAVER_API_HUB_CLIENT_ID": "test-client-id",
                    "NAVER_API_HUB_CLIENT_SECRET": "test-client-secret",
                },
            ), patch.object(
                repeated_blog_trend_module,
                "_fetch_query_pages_with_stats",
                return_value=(items, 1),
            ), patch.object(
                repeated_blog_trend_module,
                "extract_selected_posts",
                side_effect=extract,
            ), patch.object(repeated_blog_trend_module, "_fetch_trends", return_value={}):
                result = repeated_blog_trend_module.run_live(
                    config,
                    collection_date=AS_OF,
                    regions=None,
                    results_per_query=300,
                    body_limit=1,
                    output_dir=Path(temp_dir),
                    persist_db=False,
                )

        self.assertEqual(result["stats"]["selectedBodyTargets"], 2)
        self.assertEqual(
            {post["link"] for post in captured},
            {"https://blog.naver.com/a/1", "https://blog.naver.com/b/2"},
        )

    def test_live_trend_path_uses_monthly_summary_for_classification_and_persistence(self) -> None:
        config = json.loads(json.dumps(self.config, ensure_ascii=False))
        config["regions"] = ["안국"]
        config["queryGeneration"]["intents"] = [{"category": "FOOD", "phrase": "카페"}]

        class MonthlyTrendClient:
            def __init__(self) -> None:
                self.calls = []

            def search(self, groups, *, start_date, end_date, time_unit="date"):
                self.calls.append(
                    {
                        "groups": groups,
                        "start_date": start_date,
                        "end_date": end_date,
                        "time_unit": time_unit,
                    }
                )
                return [
                    {
                        "title": group.group_name,
                        "data": [
                            {"period": "2026-05-01", "ratio": 31.0},
                            {"period": "2026-06-01", "ratio": 30.0},
                            {"period": "2026-07-01", "ratio": 31.0},
                            {"period": "2026-08-01", "ratio": 26.0},
                        ],
                    }
                    for group in groups
                ]

        class Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def execute(self, *_args):
                return None

            def fetchone(self):
                return None

        class Connection:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def cursor(self):
                return Cursor()

        items = [
            {
                "link": "https://blog.naver.com/a/1",
                "title": "one",
                "postdate": "20260813",
                "bloggerlink": "https://blog.naver.com/a",
            },
            {
                "link": "https://blog.naver.com/b/2",
                "title": "two",
                "postdate": "20260812",
                "bloggerlink": "https://blog.naver.com/b",
            },
        ]
        representative = {
            "placeId": "map-1",
            "name": "테스트카페",
            "address": "서울 종로구 율곡로 1",
            "latlng": "37.580000,126.990000",
        }

        def extract(selected_posts, *, fetch_bodies, fetcher):
            return (
                [
                    {
                        **selected,
                        "body_status": "fetched",
                        "places": [representative],
                        "representative_status": "auto_confirmed",
                        "representative_place": representative,
                    }
                    for selected in selected_posts
                ],
                repeated_blog_trend_module.Counter(),
                {
                    "body_requests": len(selected_posts),
                    "fetched_posts": len(selected_posts),
                    "map_found_posts": len(selected_posts),
                    "extracted_place_count": len(selected_posts),
                    "body_failed": 0,
                },
            )

        trend_client = MonthlyTrendClient()
        persisted: list[dict] = []

        def persist(result, **_kwargs):
            persisted.append(result)
            return {"runsUpserted": 1, "resultsUpserted": 1}

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(repeated_blog_trend_module, "load_dotenv"), patch.dict(
                repeated_blog_trend_module.os.environ,
                {
                    "NAVER_API_HUB_CLIENT_ID": "test-client-id",
                    "NAVER_API_HUB_CLIENT_SECRET": "test-client-secret",
                },
                clear=True,
            ), patch.object(
                repeated_blog_trend_module,
                "_fetch_query_pages_with_stats",
                return_value=(items, 1),
            ), patch.object(
                repeated_blog_trend_module,
                "extract_selected_posts",
                side_effect=extract,
            ), patch.object(
                repeated_blog_trend_module,
                "persist_result_to_database",
                side_effect=persist,
            ):
                result = repeated_blog_trend_module.run_live(
                    config,
                    collection_date=AS_OF,
                    regions=None,
                    max_results_per_query=300,
                    output_dir=Path(temp_dir),
                    persist_db=True,
                    connection_factory=lambda: Connection(),
                    trend_client=trend_client,
                )

        self.assertEqual(len(trend_client.calls), 1)
        self.assertEqual(trend_client.calls[0]["time_unit"], "month")
        self.assertNotEqual(trend_client.calls[0]["time_unit"], "date")
        self.assertEqual(trend_client.calls[0]["start_date"], date(2026, 5, 1))
        self.assertEqual(trend_client.calls[0]["end_date"], AS_OF)
        self.assertEqual(len(persisted), 1)
        trend = persisted[0]["evidence"][0]["trend"]
        self.assertEqual(trend["status"], "SURGING")
        self.assertEqual(trend["recentSearchInterestAverage"], 2.0)
        self.assertEqual(trend["previous14dSearchInterestAverage"], 1.0)
        self.assertEqual(trend["ratio"], 2.0)
        self.assertEqual(trend["recentNonzeroObservations"], 1)
        self.assertEqual(trend["baselineNonzeroObservations"], 3)
        self.assertEqual(_search_trend_status(trend), "TRENDING")
        self.assertEqual(result["evidence"][0]["classification"]["status"], "WATCH")
        self.assertEqual(result["stats"]["TRENDING"], 1)
        self.assertEqual(result["stats"]["WATCH"], 0)
        self.assertEqual(result["stats"]["INSUFFICIENT_EVIDENCE"], 0)
        console = io.StringIO()
        with redirect_stdout(console):
            repeated_blog_trend_module._print_result(result)
        self.assertIn("WATCH=0 TRENDING=1 INSUFFICIENT=0", console.getvalue())
        self.assertIn("[TRENDING]", console.getvalue())
        self.assertEqual(result["database"]["status"], "persisted")

    def test_last_successful_run_lookup_is_db_only_and_secret_free(self) -> None:
        class Cursor:
            def __init__(self) -> None:
                self.sql = ""
                self.params = None

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def execute(self, sql, params=None) -> None:
                self.sql = sql
                self.params = params

            def fetchone(self):
                return (date(2026, 8, 10),)

        class Connection:
            def __init__(self) -> None:
                self.cursor_value = Cursor()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def cursor(self):
                return self.cursor_value

        connection = Connection()
        lookup = getattr(
            repeated_blog_trend_module,
            "get_last_successful_blog_trend_boundary",
            None,
        )
        self.assertIsNotNone(lookup, "last-successful run lookup must exist")

        with patch.dict(repeated_blog_trend_module.os.environ, {}, clear=True):
            boundary = lookup(connection)

        self.assertEqual(boundary, date(2026, 8, 10))
        self.assertIn("FROM blog_trend_run", connection.cursor_value.sql)
        self.assertIn("status", connection.cursor_value.sql)
        self.assertEqual(connection.cursor_value.params, ("SUCCESS",))

    def test_blog_search_uses_five_naver_pages_for_a_500_result_target(self) -> None:
        calls: list[tuple[str, int, int]] = []

        def page(
            _client_id: str,
            _client_secret: str,
            query: str,
            start: int,
            display: int,
        ) -> dict:
            calls.append((query, start, display))
            return {
                "items": [
                    {
                        "link": f"https://blog.naver.com/author/{start + offset}",
                        "title": f"post-{start + offset}",
                        "description": "description",
                        "bloggerlink": "https://blog.naver.com/author",
                        "postdate": "20260813",
                    }
                    for offset in range(display)
                ]
            }

        fetch_pages = getattr(repeated_blog_trend_module, "fetch_query_pages", None)
        self.assertIsNotNone(fetch_pages, "five-page Naver pagination boundary must exist")
        items = fetch_pages(
            "client-id",
            "client-secret",
            "안국 카페",
            500,
            search_page=page,
        )

        self.assertEqual(len(items), 500)
        self.assertEqual(
            calls,
            [
                ("안국 카페", 1, 100),
                ("안국 카페", 101, 100),
                ("안국 카페", 201, 100),
                ("안국 카페", 301, 100),
                ("안국 카페", 401, 100),
            ],
        )

    def test_author_cap_zero_keeps_repeated_posts_for_body_evidence(self) -> None:
        config = json.loads(json.dumps(self.config, ensure_ascii=False))
        config["selection"]["authorCap"] = 0
        rows = [
            observation(
                url=f"https://blog.naver.com/same-author/{index}",
                author="same-author",
                rank=index,
            )
            for index in range(1, 8)
        ]

        selected = select_body_targets(
            group_posts(rows), config, body_limit=5, seed="same-author"
        )

        self.assertEqual(len(selected), 5)
        self.assertEqual({post["author"] for post in selected}, {"same-author"})

    def test_selection_balances_unique_body_targets_across_queries(self) -> None:
        config = json.loads(json.dumps(self.config, ensure_ascii=False))
        config["selection"]["strategy"] = "query_balanced"
        rows = []
        queries = ["안국 카페", "안국 맛집", "서촌 카페"]
        for query_index, query in enumerate(queries):
            region, intent = query.split()
            for post_index in range(8):
                rows.append(
                    {
                        **observation(
                            url=f"https://blog.naver.com/{query_index}/{post_index}",
                            author=f"author-{query_index}-{post_index}",
                            query=query,
                            rank=post_index + 1,
                        ),
                        "region": region,
                        "intent": intent,
                    }
                )

        selected = select_body_targets(
            group_posts(rows), config, body_limit=8, seed="balanced"
        )

        self.assertEqual(len(selected), 8)
        counts = {}
        for post in selected:
            self.assertEqual(len(post["sampleQueries"]), 1)
            query = post["sampleQueries"][0]
            counts[query] = counts.get(query, 0) + 1
        self.assertEqual(counts, {"안국 카페": 3, "안국 맛집": 3, "서촌 카페": 2})
        self.assertTrue(all(post["selectionBucket"] == "query_balanced" for post in selected))

    def test_relative_mention_rate_uses_each_queries_body_sample_denominator(self) -> None:
        records = [
            {**observation(place_id="k1", query="안국 카페"), "sampledForQuery": True},
            {
                **observation(
                    place_id="k1",
                    query="안국 맛집",
                    url="https://blog.naver.com/b/2",
                    author="author-b",
                ),
                "sampledForQuery": True,
            },
        ]
        evidence = aggregate_place_evidence(
            records,
            as_of=AS_OF,
            config=self.config,
            query_sample_sizes={"안국 카페": 4, "안국 맛집": 2},
        )[0]

        self.assertEqual(evidence["sampledQueryCount"], 2)
        self.assertEqual(evidence["sampledMentionPosts"], 2)
        self.assertEqual(evidence["sampledAuthorCount"], 2)
        self.assertAlmostEqual(evidence["relativeMentionRate"], 0.375)
        self.assertEqual(
            evidence["queryMentionRates"],
            [
                {"query": "안국 맛집", "sampledPosts": 2, "mentionPosts": 1, "mentionRate": 0.5},
                {"query": "안국 카페", "sampledPosts": 4, "mentionPosts": 1, "mentionRate": 0.25},
            ],
        )

    def test_metadata_keeps_rank_context_and_ad_evidence(self) -> None:
        item = {
            "link": "https://blog.naver.com/a/1",
            "title": "협찬 신상 카페",
            "description": "방문",
            "bloggerlink": "https://blog.naver.com/a",
            "postdate": "20260813",
        }
        result = normalize_search_item(
            item,
            {"query": "안국 카페", "region": "안국", "intent": "카페", "intentCategory": "FOOD"},
            search_rank=7,
            collection_date=AS_OF,
            collected_at="2026-08-13T01:00:00Z",
            config=self.config,
        )
        self.assertEqual(result["searchRank"], 7)
        self.assertTrue(result["isAdSuspected"])
        self.assertIn("협찬", result["adSignals"])

    def test_same_url_is_one_post_but_preserves_multiple_queries(self) -> None:
        grouped = group_posts(
            [
                observation(query="안국 카페"),
                observation(query="안국 맛집", rank=3),
                observation(query="북촌 카페", rank=5),
            ]
        )
        self.assertEqual(len(grouped), 1)
        self.assertEqual(len(grouped[0]["queries"]), 3)
        self.assertEqual(len(grouped[0]["observations"]), 3)

    def test_place_evidence_filter_excludes_queries_outside_active_plan(self) -> None:
        filter_rows = getattr(
            repeated_blog_trend_module,
            "filter_observations_to_query_plan",
            None,
        )
        self.assertIsNotNone(filter_rows, "active query-plan evidence boundary must exist")

        rows = [
            observation(query="안국 카페"),
            observation(query="안국 요즘 뜨는 곳", url="https://blog.naver.com/a/2"),
        ]

        filtered = filter_rows(rows, [{"query": "안국 카페"}])

        self.assertEqual([row["query"] for row in filtered], ["안국 카페"])

    def test_selection_is_deterministic_and_respects_author_cap(self) -> None:
        config = json.loads(json.dumps(self.config, ensure_ascii=False))
        config["selection"]["strategy"] = "priority_quotas"
        config["selection"]["authorCap"] = 2
        posts = []
        for index in range(12):
            author = "same-author" if index < 6 else f"author-{index}"
            rows = [
                observation(
                    url=f"https://blog.naver.com/u/{index}",
                    author=author,
                    query="안국 카페",
                    rank=index + 1,
                )
            ]
            if index % 3 == 0:
                rows.append({**rows[0], "query": "안국 맛집", "searchRank": index + 2})
            posts.extend(rows)
        grouped = group_posts(posts)
        first = select_body_targets(grouped, config, body_limit=8, seed="fixed")
        second = select_body_targets(grouped, config, body_limit=8, seed="fixed")
        self.assertEqual(first, second)
        counts = {}
        for post in first:
            counts[post["author"]] = counts.get(post["author"], 0) + 1
        self.assertLessEqual(max(counts.values()), config["selection"]["authorCap"])
        self.assertTrue(any(post["selectionBucket"] == "exploration" for post in first))
        self.assertTrue(any(post["selectionBucket"] == "relevance" for post in first))

    def test_selection_reserves_two_relevance_slots_per_region(self) -> None:
        config = json.loads(json.dumps(self.config, ensure_ascii=False))
        config["selection"]["strategy"] = "priority_quotas"
        rows = []
        regions = config["regions"]
        for region_index, region in enumerate(regions):
            post_count = 5
            for post_index in range(post_count):
                is_low_priority_region = region == "혜화"
                rows.append(
                    {
                        **observation(
                            url=f"https://blog.naver.com/{region_index}/{post_index}",
                            author=f"author-{region_index}-{post_index}",
                            query=f"{region} 카페",
                            rank=20 if is_low_priority_region else 1,
                            ad=is_low_priority_region,
                        ),
                        "region": region,
                        "intent": "카페",
                        "intentCategory": "FOOD",
                    }
                )

        selected = select_body_targets(
            group_posts(rows), config, body_limit=30, seed="region-coverage"
        )

        self.assertEqual(len(selected), 30)
        for region in regions:
            self.assertGreaterEqual(
                sum(region in post["regions"] for post in selected),
                2,
                region,
            )
        self.assertGreaterEqual(
            sum(post["selectionBucket"] == "region_coverage" for post in selected),
            18,
        )

    def test_observation_store_is_day_query_url_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = ObservationStore(Path(temp_dir) / "observations.jsonl")
            row = observation()
            first = store.append([row, row])
            second = store.append([row])
            next_day = store.append([{**row, "collectionDate": "2026-08-14"}])
            self.assertEqual(first, {"appended": 1, "skippedExisting": 1, "skippedInvalid": 0})
            self.assertEqual(second["appended"], 0)
            self.assertEqual(next_day["appended"], 1)
            self.assertEqual(len(store.read()), 2)

    def test_database_persistence_commits_and_returns_loader_counts(self) -> None:
        class Connection:
            def __init__(self) -> None:
                self.committed = False

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def commit(self) -> None:
                self.committed = True

        class Stats:
            def as_dict(self) -> dict:
                return {"snapshotsUpserted": 1}

        connection = Connection()
        persister = getattr(repeated_blog_trend_module, "persist_result_to_database", None)
        self.assertIsNotNone(persister, "database persistence boundary must exist")

        result = persister(
            {"collectionDate": "2026-08-13", "evidence": []},
            connection_factory=lambda: connection,
            loader=lambda active_connection, _result: (
                Stats() if active_connection is connection else None
            ),
        )

        self.assertTrue(connection.committed)
        self.assertEqual(result, {"snapshotsUpserted": 1})

    def test_database_persistence_commits_loader_failure_state_before_reraising(self) -> None:
        class Connection:
            def __init__(self) -> None:
                self.commits = 0

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def commit(self) -> None:
                self.commits += 1

        connection = Connection()

        with self.assertRaises(RuntimeError):
            repeated_blog_trend_module.persist_result_to_database(
                {"collectionDate": "2026-08-13", "evidence": []},
                connection_factory=lambda: connection,
                loader=lambda _connection, _result: (_ for _ in ()).throw(RuntimeError("failed")),
            )

        self.assertEqual(connection.commits, 1)

    def test_search_trend_failure_is_recorded_without_aborting_place_collection(self) -> None:
        config = json.loads(json.dumps(self.config, ensure_ascii=False))
        config["regions"] = []
        config["queryGeneration"]["intents"] = []

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(repeated_blog_trend_module, "load_dotenv"), patch.object(
                repeated_blog_trend_module, "_fetch_trends", side_effect=RuntimeError("trend unavailable")
            ), patch.dict(
                repeated_blog_trend_module.os.environ,
                {
                    "NAVER_API_HUB_CLIENT_ID": "test-client-id",
                    "NAVER_API_HUB_CLIENT_SECRET": "test-client-secret",
                },
            ):
                result = repeated_blog_trend_module.run_live(
                    config,
                    collection_date=AS_OF,
                    regions=None,
                    results_per_query=0,
                    body_limit=0,
                    output_dir=Path(temp_dir),
                    persist_db=False,
                )

        self.assertEqual(result["evidence"], [])
        self.assertEqual(
            result["searchTrend"],
            {"status": "unavailable", "reason": "RuntimeError"},
        )

    def test_main_dry_run_accepts_skip_db_without_writes(self) -> None:
        output = io.StringIO()
        try:
            with redirect_stdout(output):
                exit_code = repeated_blog_trend_module.main(
                    [
                        "--config",
                        str(CONFIG_PATH),
                        "--date",
                        "2026-08-13",
                "--dry-run",
                "--skip-db",
                    ]
                )
        except SystemExit as exception:
            exit_code = int(exception.code)

        self.assertEqual(exit_code, 0)
        self.assertFalse(json.loads(output.getvalue())["writes"])

    def test_author_and_collection_day_diversity_are_independent(self) -> None:
        rows = [
            observation(place_id="k1", url="https://blog.naver.com/a/1", day="2026-08-12"),
            observation(place_id="k1", url="https://blog.naver.com/a/2", day="2026-08-13"),
            observation(place_id="k1", url="https://blog.naver.com/a/1", day="2026-08-13", query="안국 맛집"),
        ]
        evidence = aggregate_place_evidence(rows, as_of=AS_OF, config=self.config)[0]
        self.assertEqual(evidence["uniquePosts"], 2)
        self.assertEqual(evidence["uniqueAuthors"], 1)
        self.assertEqual(evidence["uniqueQueries"], 2)
        self.assertEqual(evidence.get("uniqueIntentCategories"), 1)
        self.assertEqual(evidence["collectionDays"], 2)

    def test_evidence_counts_distinct_posts_per_query_intent(self) -> None:
        rows = [
            observation(place_id="k1", url="https://blog.naver.com/a/1", query="안국 카페"),
            observation(place_id="k1", url="https://blog.naver.com/a/1", query="안국 카페"),
            observation(place_id="k1", url="https://blog.naver.com/b/2", query="안국 맛집"),
        ]

        evidence = aggregate_place_evidence(rows, as_of=AS_OF, config=self.config)[0]

        self.assertEqual(evidence["uniquePostCountsByIntent"], {"카페": 1, "맛집": 1})

    def test_synonymous_queries_are_one_independent_intent_category(self) -> None:
        rows = [
            observation(place_id="k1", url="https://blog.naver.com/a/1", query="안국 카페"),
            observation(place_id="k1", url="https://blog.naver.com/b/2", query="안국 맛집"),
            {
                **observation(
                    place_id="k1",
                    url="https://blog.naver.com/c/3",
                    query="안국 카페 추천",
                ),
                "intent": "카페 추천",
                        "intentCategory": "CAFE",
            },
        ]

        evidence = aggregate_place_evidence(rows, as_of=AS_OF, config=self.config)[0]

        self.assertEqual(evidence["uniqueQueries"], 3)
        self.assertEqual(evidence.get("uniqueIntentCategories"), 2)

    def test_synonymous_query_count_does_not_satisfy_watch_threshold(self) -> None:
        evidence = {
            "uniquePosts": 3,
            "uniqueAuthors": 2,
            "uniqueQueries": 2,
            "uniqueIntentCategories": 1,
            "collectionDays": 1,
            "recentObservedPosts": 3,
            "adSuspectedRatio": 0,
            "trend": {"rising": False},
        }

        self.assertEqual(classify_place(evidence, self.config)["status"], "INSUFFICIENT_EVIDENCE")

    def test_blog_map_name_survives_without_body_topic_fields(self) -> None:
        extracted = [
            {
                "representative_place": {
                    "placeId": "map-1",
                    "name": "블로그 지도명",
                    "address": "서울 종로구 율곡로 1",
                },
                "search_observations": [observation()],
            }
        ]
        extracted[0]["representative_place"]["latlng"] = "37.58,126.99"

        rows = repeated_blog_trend_module._place_evidence_rows(extracted)

        self.assertEqual(rows[0].get("observedPlaceName"), "블로그 지도명")
        self.assertEqual(rows[0].get("canonicalPlaceId"), "NAVER_MAP:map-1")
        self.assertEqual(rows[0].get("canonicalPlaceName"), "블로그 지도명")
        self.assertNotIn("bodyTopicCandidates", rows[0])
        self.assertEqual(rows[0].get("canonicalSource"), "NAVER_MAP")
        self.assertEqual(rows[0].get("canonicalRoadAddress"), "서울 종로구 율곡로 1")
        self.assertEqual(rows[0].get("canonicalLongitude"), 126.99)
        self.assertEqual(rows[0].get("canonicalLatitude"), 37.58)

    def test_place_evidence_rejects_naver_map_outside_jongno(self) -> None:
        extracted = [
            {
                "representative_place": {
                    "placeId": "map-2",
                    "name": "다른 구 카페",
                    "address": "서울 마포구 월드컵로 1",
                    "latlng": "37.56,126.91",
                },
                "search_observations": [observation()],
            }
        ]

        rows = repeated_blog_trend_module._place_evidence_rows(extracted)

        self.assertEqual(rows, [])

    def test_aggregate_evidence_omits_body_topic_explanation(self) -> None:
        rows = []
        for index, author in enumerate(("a", "b", "c"), start=1):
            rows.append(
                {
                    **observation(
                        place_id="k1",
                        url=f"https://blog.naver.com/{author}/{index}",
                        author=f"https://blog.naver.com/{author}",
                    ),
                }
            )

        evidence = aggregate_place_evidence(rows, as_of=AS_OF, config=self.config)[0]
        self.assertNotIn("whyTrending", evidence)

    def test_place_aliases_are_aggregated_and_bounded_in_trend_group(self) -> None:
        rows = []
        aliases = ["별칭 하나", "별칭 둘", "별칭 셋", "별칭 넷", "별칭 다섯", "별칭 여섯"]
        for index, alias in enumerate(aliases):
            rows.append(
                {
                    **observation(
                        place_id="k1",
                        url=f"https://blog.naver.com/alias/{index}",
                        author=f"author-{index}",
                    ),
                    "observedPlaceName": alias,
                        "intentCategory": "FOOD" if index % 2 else "CAFE",
                }
            )
        evidence = aggregate_place_evidence(rows, as_of=AS_OF, config=self.config)[0]
        builder = getattr(
            repeated_blog_trend_module,
            "build_place_trend_groups",
            lambda *_args, **_kwargs: [],
        )

        groups = builder([evidence], self.config)

        self.assertEqual(evidence.get("aliases"), aliases)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0].keywords[0], "테스트카페")
        self.assertLessEqual(len(groups[0].keywords), 5)
        self.assertEqual(len(groups[0].keywords), len(set(groups[0].keywords)))

    def test_trend_requires_nonzero_coverage_before_ratio_check(self) -> None:
        zero = trend_signal(
            {
                "recent_ratio_average": 80,
                "baseline_ratio_average": 0,
                "recent_nonzero_observations": 7,
                "baseline_nonzero_observations": 28,
            },
            self.config,
        )
        sparse_baseline = trend_signal(
            {
                "recent_ratio_average": 80,
                "baseline_ratio_average": 0.1,
                "recent_nonzero_observations": 7,
                "baseline_nonzero_observations": 6,
            },
            self.config,
        )
        sparse_recent = trend_signal(
            {
                "recent_ratio_average": 20,
                "baseline_ratio_average": 8,
                "recent_nonzero_observations": 2,
                "baseline_nonzero_observations": 28,
            },
            self.config,
        )
        covered = trend_signal(
            {
                "recent_ratio_average": 20,
                "baseline_ratio_average": 8,
                "recent_nonzero_observations": 7,
                "baseline_nonzero_observations": 28,
            },
            self.config,
        )
        self.assertFalse(zero["rising"])
        self.assertEqual(zero["reason"], "baseline_missing")
        self.assertFalse(sparse_baseline["rising"])
        self.assertEqual(sparse_baseline["reason"], "insufficient_baseline_coverage")
        self.assertFalse(sparse_recent["rising"])
        self.assertEqual(sparse_recent["reason"], "insufficient_recent_coverage")
        self.assertTrue(covered["rising"])

    def test_classification_boundaries(self) -> None:
        insufficient = {
            "uniquePosts": 1,
            "uniqueAuthors": 1,
            "uniqueQueries": 1,
            "uniqueIntentCategories": 1,
            "collectionDays": 1,
            "recentObservedPosts": 1,
            "adSuspectedRatio": 0,
            "trend": {"rising": True},
        }
        watch = {
            **insufficient,
            "uniquePosts": 3,
            "uniqueAuthors": 2,
            "uniqueQueries": 2,
            "uniqueIntentCategories": 2,
        }
        trending = {
            **watch,
            "uniquePosts": 8,
            "uniqueAuthors": 4,
            "collectionDays": 3,
            "recentObservedPosts": 5,
        }
        self.assertEqual(classify_place(insufficient, self.config)["status"], "INSUFFICIENT_EVIDENCE")
        self.assertEqual(classify_place(watch, self.config)["status"], "WATCH")
        self.assertEqual(classify_place(trending, self.config)["status"], "TRENDING")

    def test_ad_ratio_blocks_trending_but_not_evidence_retention(self) -> None:
        evidence = {
            "uniquePosts": 8,
            "uniqueAuthors": 4,
            "uniqueQueries": 3,
            "uniqueIntentCategories": 3,
            "collectionDays": 3,
            "recentObservedPosts": 5,
            "adSuspectedRatio": 0.75,
            "trend": {"rising": True},
        }
        result = classify_place(evidence, self.config)
        self.assertEqual(result["status"], "WATCH")
        self.assertFalse(result["adRatioPassed"])


if __name__ == "__main__":
    unittest.main()
