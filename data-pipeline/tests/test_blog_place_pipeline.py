from __future__ import annotations

import html
import json
import sys
import tempfile
import unittest
from collections import Counter
from datetime import date, timedelta
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from blog_place_pipeline import (  # noqa: E402
    BlogBodyFetcher,
    BodyFetchResult,
    aggregate_places,
    build_post_view_url,
    choose_representative_place,
    extract_post_view_url,
    extract_selected_posts,
    extract_v2_map_places,
    score_representative_places,
    select_posts,
)


TODAY = date(2026, 8, 12)
START = TODAY - timedelta(days=60)


def _item(index: int, *, author: str | None = None, days_ago: int = 0, title: str | None = None) -> dict:
    author = author or f"author-{index}"
    return {
        "title": title or f"안국 방문 후기 {index}",
        "description": "현장에 다녀온 방문 리뷰",
        "link": f"https://blog.naver.com/{author}/{100000 + index}",
        "bloggerlink": f"https://blog.naver.com/{author}",
        "postdate": (TODAY - timedelta(days=days_ago)).strftime("%Y%m%d"),
    }


def _map_html(places: list[dict]) -> str:
    payload = {"type": "v2_map", "data": {"places": places}}
    value = html.escape(json.dumps(payload, ensure_ascii=False), quote=True)
    return f'<html><script class="__se_module_data" data-module-v2="{value}"></script></html>'


def _map_script(place: dict) -> str:
    payload = {"type": "v2_map", "data": {"places": [place]}}
    value = html.escape(json.dumps(payload, ensure_ascii=False), quote=True)
    return f'<script class="__se_module_data" data-module-v2="{value}"></script>'


def _text_paragraph(value: str) -> str:
    return f'<p class="se-text-paragraph"><span>{value}</span></p>'


class BlogPlacePipelineTest(unittest.TestCase):
    def test_selection_uses_25_15_10_quotas_without_duplicates(self) -> None:
        items = [_item(index, days_ago=index % 60) for index in range(80)]
        selected = select_posts(items, "안국 신상 카페", analysis_start=START, analysis_end=TODAY)

        self.assertEqual(len(selected), 50)
        self.assertEqual(Counter(post["selection_bucket"] for post in selected), Counter({
            "latest": 25,
            "relevance": 15,
            "exploration": 10,
        }))
        self.assertEqual(len({post["link"] for post in selected}), 50)

    def test_selection_caps_author_and_is_deterministic(self) -> None:
        items = [_item(index, author=f"author-{index % 6}", days_ago=index % 60) for index in range(80)]
        first = select_posts(items, "안국 신상 카페", analysis_start=START, analysis_end=TODAY)
        second = select_posts(items, "안국 신상 카페", analysis_start=START, analysis_end=TODAY)

        self.assertEqual(first, second)
        counts = Counter(post["bloggerlink"] for post in first)
        self.assertTrue(counts)
        self.assertLessEqual(max(counts.values()), 2)
        self.assertEqual(len({post["link"] for post in first}), len(first))

    def test_selection_filters_period_and_non_naver_urls(self) -> None:
        items = [
            _item(1),
            {**_item(2), "link": "https://example.com/post/2"},
            {**_item(3), "postdate": "20260101"},
        ]
        selected = select_posts(items, "안국 방문", analysis_start=START, analysis_end=TODAY)
        self.assertEqual([post["link"] for post in selected], [items[0]["link"]])

    def test_post_view_url_is_safe_and_frameset_is_supported(self) -> None:
        source = "https://blog.naver.com/sample/223456789"
        expected = "https://blog.naver.com/PostView.naver?blogId=sample&logNo=223456789"
        self.assertEqual(build_post_view_url(source), expected)
        frameset = '<frameset><frame name="mainFrame" src="/PostView.naver?blogId=sample&amp;logNo=223456789"></frameset>'
        self.assertEqual(extract_post_view_url(frameset, source), expected)
        iframe = '<iframe src="/PostView.naver?blogId=sample&amp;logNo=223456789"></iframe>'
        self.assertEqual(extract_post_view_url(iframe, source), expected)
        self.assertIsNone(build_post_view_url("https://evil.example/sample/1"))
        self.assertEqual(
            extract_post_view_url('<frameset><frame src="https://evil.example/x"></frameset>', source),
            expected,
        )

    def test_fetcher_follows_only_safe_post_view_and_sends_request_controls(self) -> None:
        payload = {
            "type": "v2_map",
            "data": {"places": [{"placeId": "p1", "name": "테스트 장소", "address": "서울"}]},
        }
        map_html = '<script class="__se_module_data" data-module-v2="{}"></script>'.format(
            html.escape(json.dumps(payload, ensure_ascii=False), quote=True)
        )

        class Response:
            def __init__(self, text: str) -> None:
                self.status_code = 200
                self.text = text
                self.headers = {}

        class Session:
            def __init__(self) -> None:
                self.calls: list[tuple[str, dict, float, bool]] = []

            def get(self, url: str, *, headers: dict, timeout: float, allow_redirects: bool) -> Response:
                self.calls.append((url, headers, timeout, allow_redirects))
                if len(self.calls) == 1:
                    return Response('<frameset><frame src="/PostView.naver?blogId=sample&amp;logNo=1"></frameset>')
                return Response(map_html)

        session = Session()
        result = BlogBodyFetcher(session=session, timeout=3.5, throttle_seconds=0).fetch(
            "https://blog.naver.com/sample/1"
        )
        self.assertIsNone(result.reason)
        self.assertEqual(result.request_count, 2)
        self.assertEqual(session.calls[1][0], "https://blog.naver.com/PostView.naver?blogId=sample&logNo=1")
        self.assertEqual(session.calls[0][2:], (3.5, False))
        self.assertIn("User-Agent", session.calls[0][1])

    def test_v2_map_extracts_single_and_multiple_places(self) -> None:
        payload = {
            "type": "v2_map",
            "data": {
                "places": [
                    {"placeId": "1", "name": "첫 장소", "address": "서울 종로구", "latlng": "37,127"},
                    {"placeId": "2", "name": "둘째 장소", "address": "서울 중구", "tel": "02-0000"},
                ]
            },
        }
        value = html.escape(json.dumps(payload, ensure_ascii=False), quote=True)
        source = f'<html><script class="__se_module_data" data-module="{value}"></script></html>'
        places = extract_v2_map_places(source)

        self.assertEqual([place["placeId"] for place in places], ["1", "2"])
        self.assertEqual(places[0]["latlng"], "37,127")

    def test_representative_title_match_is_auto_confirmed_and_category_unverified(self) -> None:
        places = score_representative_places(
            [{"placeId": "1", "name": "온카페", "address": "서울특별시 종로구 율곡로"}],
            query="안국 신상 카페",
            title="안국 온카페 방문 후기",
            description="현장 방문",
        )
        status, representative, reasons = choose_representative_place(places)

        self.assertEqual(status, "auto_confirmed")
        self.assertEqual(representative["name"], "온카페")
        self.assertEqual(representative["representative_score"], 9)
        self.assertIn("name_in_title(+5)", representative["representative_reasons"])
        self.assertEqual(representative["category_status"], "unverified")
        self.assertEqual(reasons, ["unique_highest_score_with_sufficient_evidence"])

    def test_representative_region_match_can_supply_required_evidence(self) -> None:
        places = score_representative_places(
            [{"placeId": "1", "name": "지역 장소", "address": "서울 종로구 율곡로"}],
            query="안국 신상 카페",
            title="오늘의 방문 기록",
            description="지역 장소에 현장 방문",
        )
        status, representative, _ = choose_representative_place(places)

        self.assertEqual(status, "auto_confirmed")
        self.assertEqual(representative["representative_score"], 7)
        self.assertTrue(
            any(reason.startswith("target_area_in_address") for reason in representative["representative_reasons"])
        )

    def test_out_of_scope_address_with_exact_title_requires_review(self) -> None:
        places = score_representative_places(
            [{"placeId": "1", "name": "온카페", "address": "부산광역시 해운대구 달맞이길"}],
            query="안국 신상 카페",
            title="온카페 방문 후기",
            description="온카페에 다녀왔습니다",
        )
        status, representative, reasons = choose_representative_place(places)

        self.assertEqual(status, "review_required")
        self.assertIsNone(representative)
        self.assertIn("area_mismatch", reasons)

    def test_jongno_address_without_name_text_requires_review(self) -> None:
        places = score_representative_places(
            [{"placeId": "1", "name": "온카페", "address": "서울특별시 종로구 율곡로"}],
            query="안국 신상 카페",
            title="안국 신상 카페 방문기",
            description="현장 방문 후기",
        )
        status, representative, reasons = choose_representative_place(places)

        self.assertEqual(status, "review_required")
        self.assertIsNone(representative)
        self.assertIn("name_text_evidence_missing", reasons)

    def test_jongno_address_and_name_text_auto_confirms(self) -> None:
        places = score_representative_places(
            [{"placeId": "1", "name": "온카페", "address": "서울특별시 종로구 율곡로"}],
            query="안국 신상 카페",
            title="안국 온카페 방문기",
            description="현장 방문 후기",
        )
        status, representative, reasons = choose_representative_place(places)

        self.assertEqual(status, "auto_confirmed")
        self.assertEqual(representative["name"], "온카페")
        self.assertEqual(reasons, ["unique_highest_score_with_sufficient_evidence"])

    def test_representative_tie_requires_review(self) -> None:
        places = score_representative_places(
            [
                {"placeId": "1", "name": "첫 장소", "address": "서울"},
                {"placeId": "2", "name": "둘째 장소", "address": "서울 안국"},
            ],
            query="안국 맛집",
            title="첫 장소 방문",
            description="둘째 장소 추천",
        )
        status, representative, reasons = choose_representative_place(places)

        self.assertEqual([place["representative_score"] for place in places], [6, 6])
        self.assertEqual(status, "review_required")
        self.assertIsNone(representative)
        self.assertIn("score_tie", reasons)

    def test_representative_single_name_without_evidence_requires_review(self) -> None:
        places = score_representative_places(
            [{"placeId": "1", "name": "이름만 있는 장소", "address": "서울"}],
            query="안국 맛집",
            title="오늘의 기록",
            description="방문 후기",
        )
        status, representative, reasons = choose_representative_place(places)

        self.assertEqual(places[0]["representative_score"], 1)
        self.assertEqual(status, "review_required")
        self.assertIsNone(representative)
        self.assertIn("insufficient_text_or_region_evidence", reasons)

    def test_extracted_post_without_map_is_no_place(self) -> None:
        class EmptyFetcher:
            def fetch(self, link: str) -> BodyFetchResult:
                return BodyFetchResult(link, "<html></html>", link, None, 1)

        extracted, _, stats = extract_selected_posts(
            [_item(1)], fetch_bodies=True, fetcher=EmptyFetcher()
        )

        self.assertEqual(extracted[0]["representative_status"], "no_place")
        self.assertIsNone(extracted[0]["representative_place"])
        self.assertEqual(stats["fetched_posts"], 1)
        self.assertEqual(stats["map_found_posts"], 0)
        self.assertEqual(stats["no_map"], 1)

    def test_extracted_post_keeps_place_evidence_but_not_body_topics(self) -> None:
        place = {
            "placeId": "map-1",
            "name": "온카페",
            "address": "서울 종로구 율곡로 1",
        }
        body = "".join(
            [
                "<html>",
                _text_paragraph("온카페의 말차 크림 라떼와 한옥 정원이 인상적이에요"),
                _map_script(place),
                "</html>",
            ]
        )

        class ContextFetcher:
            def fetch(self, link: str) -> BodyFetchResult:
                return BodyFetchResult(link, body, link, None, 1)

        selected = {
            **_item(1, title="안국 온카페 방문 후기"),
            "query": "안국 신상 카페",
        }
        extracted, _, _ = extract_selected_posts(
            [selected],
            fetch_bodies=True,
            fetcher=ContextFetcher(),
        )

        post = extracted[0]
        self.assertEqual(post["representative_status"], "auto_confirmed")
        self.assertNotIn("body_topic_candidates", post)
        self.assertNotIn("body_topic_text", post)
        self.assertNotIn("body_html", post)

    def test_extracted_post_does_not_drop_late_candidates_from_long_context(self) -> None:
        place = {
            "placeId": "map-1",
            "name": "온카페",
            "address": "서울 종로구 율곡로 1",
        }
        filler = " ".join(f"가나다{index}" for index in range(140))
        body = "".join(
            [
                "<html>",
                _text_paragraph(f"온카페 {filler} 흑임자 크림 라떼"),
                _map_script(place),
                "</html>",
            ]
        )

        class ContextFetcher:
            def fetch(self, link: str) -> BodyFetchResult:
                return BodyFetchResult(link, body, link, None, 1)

        selected = {
            **_item(1, title="안국 온카페 방문 후기"),
            "query": "안국 신상 카페",
        }
        extracted, _, _ = extract_selected_posts(
            [selected],
            fetch_bodies=True,
            fetcher=ContextFetcher(),
        )

        self.assertNotIn("body_topic_candidates", extracted[0])

    def test_body_selection_is_capped_at_50_for_one_query(self) -> None:
        items = [_item(index, days_ago=index % 60) for index in range(80)]
        selected = select_posts(items, "안국 신상 카페", analysis_start=START, analysis_end=TODAY)
        calls: list[str] = []

        class Fetcher:
            def fetch(self, link: str) -> BodyFetchResult:
                calls.append(link)
                return BodyFetchResult(link, _map_html([]), link, None, 1)

        extracted, _, stats = extract_selected_posts(
            selected, fetch_bodies=True, fetcher=Fetcher()
        )

        self.assertEqual(len(extracted), 50)
        self.assertEqual(len(calls), 50)
        self.assertEqual(stats["body_requests"], 50)

    def test_saved_query_filter_is_exact_and_defaults_to_all_queries(self) -> None:
        sys.path.insert(0, str(SCRIPTS_DIR))
        import blog_trend_pilot as pilot  # noqa: E402

        self.assertEqual(pilot.resolve_query_filter(None), pilot.QUERIES)
        self.assertEqual(pilot.resolve_query_filter(pilot.QUERIES[2]), [pilot.QUERIES[2]])
        with self.assertRaisesRegex(ValueError, "존재하지 않는 검색어"):
            pilot.resolve_query_filter("없는 검색어")

        with tempfile.TemporaryDirectory() as temp_dir:
            raw_dir = Path(temp_dir)
            query = pilot.QUERIES[0]
            path = raw_dir / f"{pilot._safe_query_filename(query)}_20260812000000.json"
            path.write_text(json.dumps({"query": query, "items": []}), encoding="utf-8")
            items_by_query, summaries = pilot._load_saved_items(raw_dir, [query])
            self.assertEqual(list(items_by_query), [query])
            self.assertEqual([summary["query"] for summary in summaries], [query])

    def test_malformed_module_data_is_graceful(self) -> None:
        malformed = '<script class="__se_module_data" data-module="{&quot;type&quot;: &quot;v2_map&quot;, bad"></script>'
        self.assertEqual(extract_v2_map_places(malformed), [])
        self.assertEqual(extract_v2_map_places("<html><script>unterminated"), [])

    def test_place_aggregation_deduplicates_and_counts_sources(self) -> None:
        records = [
            {
                "query": "안국 방문",
                "link": "https://blog.naver.com/a/1",
                "bloggerlink": "https://blog.naver.com/a",
                "postdate": "20260812",
                "title": "첫 글",
                "places": [{"placeId": "p1", "name": "장소", "address": "서울"}],
            },
            {
                "query": "북촌 후기",
                "link": "https://blog.naver.com/b/2",
                "bloggerlink": "https://blog.naver.com/b",
                "postdate": "20260811",
                "title": "둘째 글",
                "places": [{"placeId": "p1", "name": "장소 다른 표기", "address": "서울"}],
            },
            {
                "query": "안국 방문",
                "link": "https://blog.naver.com/c/3",
                "bloggerlink": "https://blog.naver.com/a",
                "postdate": "20260810",
                "title": "fallback",
                "places": [{"name": "이름만 없는 장소", "address": "서울 종로구 1"}],
            },
            {
                "query": "안국 후기",
                "link": "https://blog.naver.com/d/4",
                "bloggerlink": "https://blog.naver.com/b",
                "postdate": "20260809",
                "title": "fallback 2",
                "places": [{"name": "이름만 없는 장소", "address": "서울 종로구 1"}],
            },
        ]
        places = aggregate_places(records)

        self.assertEqual(len(places), 2)
        by_key = {place["dedupe_key"]: place for place in places}
        self.assertEqual(by_key["place_id:p1"]["unique_link_count"], 2)
        self.assertEqual(by_key["place_id:p1"]["unique_blogger_count"], 2)
        fallback = by_key["name_address:이름만없는장소|서울종로구1"]
        self.assertEqual(fallback["unique_link_count"], 2)
        self.assertEqual(fallback["unique_blogger_count"], 2)
        self.assertEqual(set(fallback["queries"]), {"안국 방문", "안국 후기"})


if __name__ == "__main__":
    unittest.main()
