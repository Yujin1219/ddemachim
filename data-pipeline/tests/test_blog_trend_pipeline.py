from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from blog_place_pipeline import select_posts  # noqa: E402
from blog_trend_metrics import aggregate_verified_place_mentions  # noqa: E402
from blog_trend_report import build_final_report  # noqa: E402
from blog_trend_snapshot import JsonlSnapshotStore  # noqa: E402
import blog_trend_pipeline as trend_pipeline  # noqa: E402
from blog_trend_pipeline import refresh_representative_payload  # noqa: E402
from kakao_place_validation import (  # noqa: E402
    KakaoLocalClient,
    MissingKakaoApiKeyError,
    load_representatives_from_artifact,
    validate_representative_place,
)
from naver_search_trend import (  # noqa: E402
    API_HUB_SOURCE,
    NAVER_API_HUB_SEARCH_TREND_URL,
    NaverSearchTrendClient,
    NaverSearchTrendError,
    TrendKeywordGroup,
    batch_keyword_groups,
    naver_trend_credentials_from_env,
    summarize_trend_ratio,
)


TODAY = date(2026, 8, 12)


class _Response:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.status_code = 200

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


class _KakaoSession:
    def __init__(self, documents: list[dict]) -> None:
        self.documents = documents
        self.calls: list[dict] = []

    def get(self, url: str, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return _Response({"documents": self.documents})


class _KakaoSequenceSession:
    def __init__(self, responses: list[list[dict]]) -> None:
        self.responses = list(responses)
        self.calls: list[dict] = []

    def get(self, url: str, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return _Response({"documents": self.responses.pop(0)})


class _TrendSession:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def post(self, url: str, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return _Response(
            {
                "results": [
                    {
                        "title": "place:k1",
                        "keywords": ["온카페"],
                        "data": [
                            {"period": "2026-07-20", "ratio": 10},
                            {"period": "2026-08-10", "ratio": 30},
                        ],
                    }
                ]
            }
        )


class _FailingTrendClient:
    def __init__(self) -> None:
        self.calls = 0

    def search(self, *args, **kwargs):
        self.calls += 1
        raise NaverSearchTrendError("HTTP 401 response body must not be persisted")


def _representative() -> dict:
    return {
        "placeId": "map-1",
        "name": "온카페",
        "address": "서울특별시 종로구 율곡로 1",
        "latlng": "37.580000,126.990000",
    }


def _kakao_document(**overrides) -> dict:
    value = {
        "id": "kakao-1",
        "place_name": "온카페",
        "category_group_code": "CE7",
        "category_name": "음식점 > 카페",
        "address_name": "서울 종로구 율곡로 1",
        "road_address_name": "서울 종로구 율곡로 1",
        "x": "126.990000",
        "y": "37.580000",
    }
    value.update(overrides)
    return value


class BlogTrendPipelineTest(unittest.TestCase):
    def test_kakao_matched_structures_fields_and_safe_query(self) -> None:
        session = _KakaoSession([_kakao_document()])
        client = KakaoLocalClient("test-key", session=session)
        result = validate_representative_place(_representative(), client)

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["matched_place_id"], "kakao-1")
        self.assertEqual(result["matched_place"]["category_group_code"], "CE7")
        self.assertEqual(result["matched_place"]["road_address_name"], "서울 종로구 율곡로 1")
        self.assertEqual(result["matched_place"]["x"], 126.99)
        self.assertEqual(result["matched_place"]["y"], 37.58)
        self.assertEqual(session.calls[0]["params"]["query"], "온카페")
        self.assertNotIn("test-key", json.dumps(result, ensure_ascii=False))

    def test_kakao_name_only_search_is_attempted_before_any_fallback(self) -> None:
        session = _KakaoSession([_kakao_document()])
        result = validate_representative_place(_representative(), KakaoLocalClient("key", session=session))

        self.assertEqual(result["status"], "matched")
        self.assertEqual(len(session.calls), 1)
        self.assertEqual(session.calls[0]["params"]["query"], "온카페")

    def test_kakao_empty_name_search_falls_back_to_target_district(self) -> None:
        session = _KakaoSequenceSession([[], [_kakao_document()]])
        result = validate_representative_place(_representative(), KakaoLocalClient("key", session=session))

        self.assertEqual(result["status"], "matched")
        self.assertEqual(
            [call["params"]["query"] for call in session.calls],
            ["온카페", "온카페 종로구"],
        )
        self.assertEqual(result["query"], "온카페 종로구")

    def test_kakao_name_containment_requires_address_or_coordinate_evidence(self) -> None:
        matching = _kakao_document(
            place_name="아티스트베이커리 안국1호점",
            address_name="서울 종로구 율곡로 1",
            road_address_name="서울 종로구 율곡로 1",
        )
        representative = {
            **_representative(),
            "name": "아티스트베이커리 안국",
        }
        matched = validate_representative_place(
            representative,
            KakaoLocalClient("key", session=_KakaoSession([matching])),
        )
        evidence = matched["matched_place"]["match_evidence"]
        self.assertEqual(matched["status"], "matched")
        self.assertTrue(evidence["normalized_name_containment_match"])
        self.assertTrue(evidence["address_match"] or evidence["coordinate_match"])

        name_only = _kakao_document(
            place_name="아티스트베이커리 안국1호점",
            address_name="서울 종로구 다른길 99",
            road_address_name="서울 종로구 다른길 99",
            x="126.800000",
            y="37.400000",
        )
        not_confirmed = validate_representative_place(
            representative,
            KakaoLocalClient("key", session=_KakaoSession([name_only])),
        )
        self.assertEqual(not_confirmed["status"], "location_mismatch")

    def test_kakao_core_name_match_confirms_moheji_location_variant(self) -> None:
        representative = {
            **_representative(),
            "placeId": "map-moheji",
            "name": "모헤지 종로3가",
        }
        candidate = _kakao_document(
            id="kakao-moheji",
            place_name="모헤지",
            x="126.9900067",
            y="37.580000",
        )

        result = validate_representative_place(
            representative,
            KakaoLocalClient("key", session=_KakaoSession([candidate])),
        )

        evidence = result["matched_place"]["match_evidence"]
        self.assertEqual(result["status"], "matched")
        self.assertTrue(evidence["shared_core_name"])
        self.assertEqual(evidence["representative_core_name"], "모헤지")
        self.assertEqual(evidence["candidate_core_name"], "모헤지")
        self.assertTrue(evidence["strong_address_match"])
        self.assertTrue(evidence["location_confirmed"])
        self.assertLess(evidence["distance_m"], 25)

    def test_kakao_core_name_match_confirms_different_branch_suffix(self) -> None:
        representative = {
            **_representative(),
            "placeId": "map-keep-that",
            "name": "킵댓 안국점",
        }
        candidate = _kakao_document(
            id="kakao-keep-that",
            place_name="킵댓 창경궁점",
            x="126.9900180",
            y="37.580000",
        )

        result = validate_representative_place(
            representative,
            KakaoLocalClient("key", session=_KakaoSession([candidate])),
        )

        evidence = result["matched_place"]["match_evidence"]
        self.assertEqual(result["status"], "matched")
        self.assertTrue(evidence["normalized_core_name_match"])
        self.assertEqual(evidence["representative_core_name"], "킵댓")
        self.assertEqual(evidence["candidate_core_name"], "킵댓")
        self.assertTrue(evidence["coordinate_match"])
        self.assertTrue(evidence["strong_address_match"])

    def test_kakao_same_building_unrelated_name_is_not_confirmed(self) -> None:
        representative = {
            **_representative(),
            "placeId": "map-keep-that",
            "name": "킵댓 안국점",
        }
        unrelated = _kakao_document(
            id="kakao-unrelated",
            place_name="다른카페 안국점",
            x="126.9900000",
            y="37.580000",
        )

        result = validate_representative_place(
            representative,
            KakaoLocalClient("key", session=_KakaoSession([unrelated])),
        )

        evidence = result["candidates"][0]["match_evidence"]
        self.assertEqual(result["status"], "not_found")
        self.assertTrue(evidence["location_confirmed"])
        self.assertFalse(evidence["shared_core_name"])
        self.assertIsNone(result["matched_place"])

    def test_kakao_category_and_location_mismatch_are_distinct(self) -> None:
        category_session = _KakaoSession([_kakao_document(category_group_code="AT4")])
        category_result = validate_representative_place(
            _representative(), KakaoLocalClient("key", session=category_session)
        )
        self.assertEqual(category_result["status"], "category_mismatch")

        location_session = _KakaoSession(
            [_kakao_document(address_name="부산 해운대구 달맞이길", road_address_name="부산 해운대구 달맞이길")]
        )
        location_result = validate_representative_place(
            _representative(), KakaoLocalClient("key", session=location_session)
        )
        self.assertEqual(location_result["status"], "location_mismatch")

    def test_kakao_ambiguous_and_missing_key(self) -> None:
        documents = [
            _kakao_document(id="a", address_name="서울 종로구 율곡로 2", road_address_name="서울 종로구 율곡로 2"),
            _kakao_document(id="b", address_name="서울 종로구 율곡로 3", road_address_name="서울 종로구 율곡로 3"),
        ]
        result = validate_representative_place(
            _representative(), KakaoLocalClient("key", session=_KakaoSession(documents))
        )
        self.assertEqual(result["status"], "ambiguous")
        with self.assertRaises(MissingKakaoApiKeyError):
            KakaoLocalClient.from_env(environ={})

    def test_selection_penalties_are_saved_without_hard_drop(self) -> None:
        item = {
            "title": "부산 카페 목록 모음",
            "description": "타지역과 비교한 일상 기록",
            "link": "https://blog.naver.com/a/1",
            "bloggerlink": "https://blog.naver.com/a",
            "postdate": TODAY.strftime("%Y%m%d"),
        }
        selected = select_posts([item], "안국 신상 카페", analysis_start=TODAY, analysis_end=TODAY)
        self.assertEqual(len(selected), 1)
        self.assertIsInstance(selected[0]["selection_score"], int)
        self.assertTrue(any("out-of-scope" in reason for reason in selected[0]["selection_reasons"]))
        self.assertTrue(any("collection" in reason for reason in selected[0]["selection_reasons"]))
        self.assertTrue(any("target-region-absent" in reason for reason in selected[0]["selection_reasons"]))

    def test_stale_out_of_region_auto_confirmation_is_removed_from_validation(self) -> None:
        payload = {
            "extracted_posts": [
                {
                    "query": "안국 신상 카페",
                    "title": "부산 온카페 분위기 디저트",
                    "description": "부산에서 방문한 온카페 후기",
                    "places": [
                        {
                            "placeId": "busan-1",
                            "name": "온카페",
                            "address": "부산광역시 해운대구 달맞이길 1",
                        }
                    ],
                    "representative_status": "auto_confirmed",
                    "representative_place": {"placeId": "busan-1", "name": "온카페"},
                }
            ]
        }

        refreshed = refresh_representative_payload(payload)

        self.assertEqual(payload["extracted_posts"][0]["representative_status"], "auto_confirmed")
        self.assertEqual(refreshed["extracted_posts"][0]["representative_status"], "review_required")
        self.assertIsNone(refreshed["extracted_posts"][0]["representative_place"])
        self.assertEqual(load_representatives_from_artifact(refreshed), [])

    def test_current_in_region_representative_remains_auto_confirmed(self) -> None:
        payload = {
            "extracted_posts": [
                {
                    "query": "안국 신상 카페",
                    "title": "온카페 분위기 디저트",
                    "description": "종로구 안국에서 방문한 온카페 후기",
                    "places": [
                        {
                            "placeId": "map-1",
                            "name": "온카페",
                            "address": "서울특별시 종로구 율곡로 1",
                        }
                    ],
                    "representative_status": "auto_confirmed",
                }
            ]
        }

        refreshed = refresh_representative_payload(payload)
        post = refreshed["extracted_posts"][0]

        self.assertEqual(post["representative_status"], "auto_confirmed")
        self.assertEqual(post["representative_place"]["placeId"], "map-1")
        self.assertEqual(len(post["representative_scores"]), 1)
        representatives = load_representatives_from_artifact(refreshed)
        self.assertEqual([place["placeId"] for _, place in representatives], ["map-1"])

    def _post(self, index: int, post_date: date, blogger: str, *, title: str = "온카페 분위기 디저트") -> dict:
        return {
            "query": "안국 신상 카페",
            "link": f"https://blog.naver.com/{blogger}/{index}",
            "bloggerlink": f"https://blog.naver.com/{blogger}",
            "postdate": post_date.strftime("%Y%m%d"),
            "title": title,
            "description": "시그니처 디저트와 분위기 좋은 공간",
            "representative_place": _representative(),
        }

    def test_metrics_use_validated_id_weekly_windows_and_flag_ads(self) -> None:
        validation = [
            {
                "source_key": "map:map-1",
                "status": "matched",
                "matched_place_id": "kakao-1",
                "representative_place": _representative(),
                "matched_place": {"id": "kakao-1"},
            }
        ]
        posts = [
            self._post(1, TODAY, "a", title="온카페 협찬 후기"),
            self._post(2, TODAY - timedelta(days=1), "b"),
            self._post(3, TODAY - timedelta(days=2), "c"),
            self._post(4, TODAY - timedelta(days=7), "d"),
            self._post(5, TODAY - timedelta(days=14), "e"),
            self._post(6, TODAY - timedelta(days=21), "f"),
            self._post(7, TODAY - timedelta(days=28), "g"),
        ]
        metrics = aggregate_verified_place_mentions(posts, validation, as_of=TODAY)
        self.assertEqual(len(metrics), 1)
        metric = metrics[0]
        self.assertEqual(metric["kakao_place_id"], "kakao-1")
        self.assertEqual(metric["recent_unique_links"], 3)
        self.assertEqual(metric["prior_unique_links"], 4)
        self.assertEqual(metric["recent_weekly_average"], 3.0)
        self.assertEqual(metric["prior_weekly_average"], 1.0)
        self.assertEqual(metric["growth_ratio"], 3.0)
        self.assertEqual(metric["absolute_delta"], 2.0)
        self.assertTrue(metric["advertising_signal"]["ad_suspected"])
        self.assertTrue(metric["advertising_signal"]["flag_only"])

    def test_prior_zero_is_new_and_not_false_growth(self) -> None:
        validation = [{
            "source_key": "map:map-1",
            "status": "matched",
            "matched_place_id": "kakao-1",
            "representative_place": _representative(),
            "matched_place": {"id": "kakao-1"},
        }]
        metrics = aggregate_verified_place_mentions(
            [self._post(1, TODAY, "a"), self._post(2, TODAY - timedelta(days=1), "b")],
            validation,
            as_of=TODAY,
        )
        self.assertTrue(metrics[0]["prior_zero_new"])
        self.assertEqual(metrics[0]["trend_state"], "new")
        self.assertIsNone(metrics[0]["growth_ratio"])

    def test_snapshot_is_append_only_and_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = JsonlSnapshotStore(Path(temp_dir) / "snapshots.jsonl")
            record = {
                "collected_at": "2026-08-12T00:00:00Z",
                "query": "안국 신상 카페",
                "link": "https://blog.naver.com/a/1",
            }
            first = store.append([record])
            second = store.append([record])
            self.assertEqual((first.appended, first.skipped_existing), (1, 0))
            self.assertEqual((second.appended, second.skipped_existing), (0, 1))
            self.assertEqual(len(store.read_records()), 1)

    def test_naver_trend_batches_and_stores_relative_ratio_only(self) -> None:
        groups = [TrendKeywordGroup(f"g-{index}", (f"keyword-{index}",)) for index in range(7)]
        batches = batch_keyword_groups(groups)
        self.assertEqual([len(batch) for batch in batches], [5, 2])
        session = _TrendSession()
        client = NaverSearchTrendClient("client", "secret", session=session)
        results = client.search(
            [TrendKeywordGroup("place:k1", ("온카페",))],
            start_date=TODAY - timedelta(days=34),
            end_date=TODAY,
        )
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["relative_ratio_only"])
        self.assertFalse(results[0]["absolute_volume_available"])
        request_body = json.loads(session.calls[0]["data"])
        self.assertEqual(request_body["keywordGroups"][0]["groupName"], "place:k1")
        summary = summarize_trend_ratio(
            results[0],
            recent_start=TODAY - timedelta(days=6),
            recent_end=TODAY,
            baseline_start=TODAY - timedelta(days=34),
            baseline_end=TODAY - timedelta(days=7),
        )
        self.assertEqual(summary["state"], "rising")
        self.assertTrue(summary["relative_ratio_only"])

    def test_naver_trend_summary_counts_nonzero_window_observations(self) -> None:
        result = {
            "title": "place:k1",
            "data": [
                {"period": "2026-07-10", "ratio": 0},
                {"period": "2026-07-11", "ratio": 4},
                {"period": "2026-07-12", "ratio": 8},
                {"period": "2026-08-10", "ratio": 0},
                {"period": "2026-08-11", "ratio": 12},
                {"period": "2026-08-12", "ratio": 0},
            ],
        }

        summary = summarize_trend_ratio(
            result,
            recent_start=date(2026, 8, 10),
            recent_end=date(2026, 8, 12),
            baseline_start=date(2026, 7, 10),
            baseline_end=date(2026, 8, 9),
        )

        self.assertEqual(summary["baseline_observations"], 3)
        self.assertEqual(summary["recent_observations"], 3)
        self.assertEqual(summary.get("baseline_nonzero_observations"), 2)
        self.assertEqual(summary.get("recent_nonzero_observations"), 1)

    def test_naver_api_hub_credentials_use_hub_endpoint_and_headers(self) -> None:
        environ = {
            "NAVER_API_HUB_CLIENT_ID": "hub-client",
            "NAVER_API_HUB_CLIENT_SECRET": "hub-secret",
            "NAVER_SEARCH_TREND_CLIENT_ID": "legacy-client",
            "NAVER_SEARCH_TREND_CLIENT_SECRET": "legacy-secret",
        }
        credentials = naver_trend_credentials_from_env(environ)
        self.assertEqual(credentials.source, API_HUB_SOURCE)

        session = _TrendSession()
        client = NaverSearchTrendClient.from_env(session=session, environ=environ)
        client.search(
            [TrendKeywordGroup("place:k1", ("온카페",))],
            start_date=TODAY - timedelta(days=7),
            end_date=TODAY,
        )
        call = session.calls[0]
        self.assertEqual(call["url"], NAVER_API_HUB_SEARCH_TREND_URL)
        self.assertEqual(call["headers"]["X-NCP-APIGW-API-KEY-ID"], "hub-client")
        self.assertEqual(call["headers"]["X-NCP-APIGW-API-KEY"], "hub-secret")
        self.assertNotIn("X-Naver-Client-Id", call["headers"])

    def test_naver_api_hub_rejects_more_than_five_keywords_per_group(self) -> None:
        client = NaverSearchTrendClient.from_env(
            session=_TrendSession(),
            environ={
                "NAVER_API_HUB_CLIENT_ID": "hub-client",
                "NAVER_API_HUB_CLIENT_SECRET": "hub-secret",
            },
        )
        with self.assertRaises(ValueError):
            client.search(
                [TrendKeywordGroup("too-many", tuple(f"keyword-{index}" for index in range(6)))],
                start_date=TODAY - timedelta(days=7),
                end_date=TODAY,
            )

    def test_naver_trend_error_is_safe_and_does_not_stop_snapshot_or_report(self) -> None:
        payload = {
            "extracted_posts": [
                {
                    "query": "안국 신상 카페",
                    "link": "https://blog.naver.com/a/1",
                    "bloggerlink": "https://blog.naver.com/a",
                    "postdate": TODAY.strftime("%Y%m%d"),
                    "title": "온카페 분위기",
                    "description": "종로구 안국 카페",
                    "places": [
                        {
                            "placeId": "map-1",
                            "name": "온카페",
                            "address": "서울특별시 종로구 율곡로 1",
                            "latlng": "37.580000,126.990000",
                        }
                    ],
                    "representative_status": "auto_confirmed",
                }
            ]
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_path = root / "input.json"
            output_dir = root / "output"
            input_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            kakao_client = KakaoLocalClient("test-key", session=_KakaoSession([_kakao_document()]))
            trend_client = _FailingTrendClient()

            with patch.object(trend_pipeline.KakaoLocalClient, "from_env", return_value=kakao_client), patch.object(
                trend_pipeline.NaverSearchTrendClient, "from_env", return_value=trend_client
            ):
                result = trend_pipeline.run_pipeline(
                    input_path,
                    output_dir=output_dir,
                    as_of=TODAY,
                    run_id="trend-error",
                    fetch_trend=True,
                )

            self.assertEqual(trend_client.calls, 1)
            self.assertEqual(result["trend"]["status"], "unavailable")
            self.assertEqual(result["trend"]["reason"], "search_error:NaverSearchTrendError")
            self.assertEqual(result["trend"]["error_class"], "NaverSearchTrendError")
            trend_artifact = (output_dir / "naver-trend_trend-error.json").read_text(encoding="utf-8")
            self.assertNotIn("HTTP 401 response body", trend_artifact)
            self.assertTrue((output_dir / "snapshot_trend-error.json").exists())
            self.assertTrue((output_dir / "final-report_trend-error.json").exists())
            self.assertTrue((output_dir / "final-report_trend-error.txt").exists())

    def test_final_report_has_no_body_topic_evidence(self) -> None:
        metric = {
            "kakao_place_id": "kakao-1",
            "recent_unique_links": 3,
            "recent_unique_bloggers": 3,
            "growth_ratio": 2.0,
            "absolute_delta": 2.0,
            "prior_zero_new": False,
        }
        report = build_final_report([metric], as_of=TODAY)
        self.assertNotIn("topic_evidence", report["decisions"][0])

    def test_search_trend_groups_are_place_aliases_only(self) -> None:
        groups = trend_pipeline.build_keyword_groups(
            [{"kakao_place_id": "place-1", "name": "온카페", "aliases": ["별칭"]}]
        )

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0].kind, "place")
        self.assertEqual(groups[0].keywords, ("온카페", "별칭"))

    def test_pipeline_source_has_no_body_topic_stage_or_extractor(self) -> None:
        source = Path(trend_pipeline.__file__).read_text(encoding="utf-8")
        self.assertNotIn("blog_topic_extraction", source)
        self.assertNotIn("topics_", source)

    def test_final_report_keeps_admin_review_and_missing_trend_is_not_hard_fail(self) -> None:
        metric = {
            "kakao_place_id": "kakao-1",
            "recent_unique_links": 3,
            "recent_unique_bloggers": 3,
            "growth_ratio": 2.0,
            "absolute_delta": 2.0,
            "prior_zero_new": False,
            "advertising_signal": {"ad_suspected": False, "flag_only": True},
        }
        report = build_final_report([metric], as_of=TODAY)
        decision = report["decisions"][0]
        self.assertEqual(decision["eligibility"], "qualified")
        self.assertEqual(decision["status"], "review_required")
        self.assertFalse(decision["trend_corroboration"]["hard_fail"])
        self.assertEqual(report["admin_review_status"], "review_required")


if __name__ == "__main__":
    unittest.main()
