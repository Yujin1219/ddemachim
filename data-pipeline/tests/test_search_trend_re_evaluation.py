from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from naver_search_trend import NaverSearchTrendError  # noqa: E402
try:
    import re_evaluate_search_trend as re_evaluation  # noqa: E402
except ImportError:  # Keep the RED phase as an assertion failure.
    re_evaluation = None


AS_OF = date(2026, 8, 13)


def _row(day: date, ratio: float) -> dict[str, Any]:
    return {"period": day.isoformat(), "ratio": ratio}


def _place(index: int, *, aliases: list[str] | None = None) -> dict[str, Any]:
    return {
        "canonicalPlaceId": f"NAVER_MAP:{index}",
        "canonicalPlaceName": f"장소 {index}",
        "aliases": aliases or [],
    }


class FakeTrendClient:
    def __init__(self, *, fail_batch: int | None = None) -> None:
        self.calls: list[list[str]] = []
        self.call_details: list[dict[str, Any]] = []
        self.fail_batch = fail_batch

    def search(self, groups, *, start_date, end_date, time_unit="date"):
        batch_index = len(self.calls)
        self.calls.append([group.group_name for group in groups])
        self.call_details.append(
            {
                "start_date": start_date,
                "end_date": end_date,
                "time_unit": time_unit,
            }
        )
        if self.fail_batch == batch_index:
            raise NaverSearchTrendError("synthetic request failure")
        return [
            {
                "title": group.group_name,
                "keywords": list(group.keywords),
                "data": [
                    _row(date(2026, 5, 1), 31.0),
                    _row(date(2026, 6, 1), 30.0),
                    _row(date(2026, 7, 1), 31.0),
                    _row(date(2026, 8, 1), 26.0),
                ],
                "relative_ratio_only": True,
                "absolute_volume_available": False,
            }
            for group in groups
        ]


class SearchTrendReEvaluationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.assertIsNotNone(
            re_evaluation,
            "focused Search Trend re-evaluation module must exist",
        )

    def _monthly_windows(self) -> dict[str, Any]:
        builder = getattr(re_evaluation, "build_monthly_search_windows", None)
        self.assertIsNotNone(builder, "monthly Search Trend window builder must exist")
        return builder(AS_OF)

    def test_monthly_window_queries_current_and_three_completed_months(self) -> None:
        windows = self._monthly_windows()

        self.assertEqual(windows["query"]["start"], date(2026, 5, 1))
        self.assertEqual(windows["query"]["end"], AS_OF)
        self.assertEqual(windows["query"]["timeUnit"], "month")
        self.assertEqual(windows["current"]["month"], "2026-08")
        self.assertEqual(windows["current"]["daysUsed"], 13)
        self.assertEqual(
            [row["month"] for row in windows["baselineMonths"]],
            ["2026-05", "2026-06", "2026-07"],
        )
        self.assertEqual([row["daysUsed"] for row in windows["baselineMonths"]], [31, 30, 31])
        self.assertEqual(windows["baselineMonthsCount"], 3)
        self.assertTrue(windows["partialMonthAdjusted"])

    def test_monthly_ratio_corrects_partial_current_month_before_surging(self) -> None:
        windows = self._monthly_windows()
        summarizer = getattr(re_evaluation, "summarize_monthly_search_interest", None)
        self.assertIsNotNone(summarizer, "monthly Search Trend summarizer must exist")
        result = summarizer(
            {
                "title": "place:1",
                "data": [
                    _row(date(2026, 5, 1), 31.0),
                    _row(date(2026, 6, 1), 30.0),
                    _row(date(2026, 7, 1), 31.0),
                    _row(date(2026, 8, 1), 26.0),
                ],
            },
            windows=windows,
        )

        self.assertEqual(result["status"], "SURGING")
        self.assertEqual(result["ratio"], 2.0)
        self.assertEqual(result["current"], 2.0)
        self.assertEqual(result["baseline"], 1.0)
        self.assertTrue(result["rising"])
        self.assertEqual(result["baselineMonths"], 3)
        self.assertTrue(result["partialMonthAdjusted"])
        self.assertEqual(result["monthValues"][-1]["daysUsed"], 13)
        self.assertEqual(result["monthValues"][-1]["adjustedDailyAverage"], 2.0)

    def test_zero_baseline_and_positive_current_is_newly_emerging(self) -> None:
        windows = self._monthly_windows()
        summarizer = getattr(re_evaluation, "summarize_monthly_search_interest", None)
        self.assertIsNotNone(summarizer, "monthly Search Trend summarizer must exist")
        result = summarizer(
            {
                "title": "place:1",
                "data": [
                    _row(date(2026, 5, 1), 0.0),
                    _row(date(2026, 6, 1), 0.0),
                    _row(date(2026, 7, 1), 0.0),
                    _row(date(2026, 8, 1), 13.0),
                ],
            },
            windows=windows,
        )

        self.assertEqual(result["status"], "NEWLY_EMERGING")
        self.assertIsNone(result["ratio"])
        self.assertTrue(result["rising"])

    def test_zero_current_and_zero_baseline_is_insufficient_data(self) -> None:
        windows = self._monthly_windows()
        summarizer = getattr(re_evaluation, "summarize_monthly_search_interest", None)
        self.assertIsNotNone(summarizer, "monthly Search Trend summarizer must exist")
        result = summarizer(
            {
                "title": "place:1",
                "data": [
                    _row(date(2026, 5, 1), 0.0),
                    _row(date(2026, 6, 1), 0.0),
                    _row(date(2026, 7, 1), 0.0),
                    _row(date(2026, 8, 1), 0.0),
                ],
            },
            windows=windows,
        )

        self.assertEqual(result["status"], "INSUFFICIENT_DATA")
        self.assertFalse(result["rising"])
        self.assertEqual(result["reason"], "baseline_and_current_zero")

    def test_all_33_places_are_batched_for_api_hub_limits(self) -> None:
        evidence = [_place(index, aliases=[f"별칭 {index}-{n}" for n in range(6)]) for index in range(33)]

        groups = re_evaluation.build_all_place_groups(evidence)
        batches = re_evaluation.fetch_all_trends(
            evidence,
            as_of=AS_OF,
            client=FakeTrendClient(),
            return_batches=True,
        )[1]

        self.assertEqual(len(groups), 33)
        self.assertTrue(all(1 <= len(group.keywords) <= 5 for group in groups))
        self.assertEqual([len(batch) for batch in batches], [5, 5, 5, 5, 5, 5, 3])

        client = FakeTrendClient()
        re_evaluation.fetch_all_trends(evidence, as_of=AS_OF, client=client)
        self.assertEqual(len(client.call_details), 7)
        self.assertTrue(all(call["time_unit"] == "month" for call in client.call_details))
        self.assertTrue(all(call["start_date"] == date(2026, 5, 1) for call in client.call_details))
        self.assertTrue(all(call["end_date"] == AS_OF for call in client.call_details))

    def test_request_failure_is_explicit_for_its_places_and_never_trend_missing(self) -> None:
        evidence = [_place(index) for index in range(7)]
        summaries, batches = re_evaluation.fetch_all_trends(
            evidence,
            as_of=AS_OF,
            client=FakeTrendClient(fail_batch=1),
            return_batches=True,
        )

        self.assertEqual(len(batches), 2)
        failed = [summaries[f"NAVER_MAP:{index}"] for index in range(5, 7)]
        self.assertTrue(all(row["reason"] == "API_ERROR:NaverSearchTrendError" for row in failed))
        self.assertTrue(all(row["reason"] != "trend_missing" for row in summaries.values()))

    def test_default_client_requires_api_hub_credentials_without_legacy_fallback(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "NAVER_SEARCH_TREND_CLIENT_ID": "legacy-id",
                "NAVER_SEARCH_TREND_CLIENT_SECRET": "legacy-secret",
            },
            clear=True,
        ):
            summaries = re_evaluation.fetch_all_trends(
                [_place(1)],
                as_of=AS_OF,
            )

        self.assertEqual(summaries["NAVER_MAP:1"]["reason"], "API_ERROR:CREDENTIALS_MISSING")
        self.assertEqual(summaries["NAVER_MAP:1"]["apiStatus"], "credentials_missing")

    def test_reevaluation_updates_all_evidence_and_preserves_relative_interest_semantics(self) -> None:
        run = {
            "collectionDate": AS_OF.isoformat(),
            "semantics": "repeated observations in collected Naver search-result samples; not total Naver Blog volume",
            "stats": {
                "WATCH": 99,
                "TRENDING": 99,
                "INSUFFICIENT_EVIDENCE": 99,
            },
            "evidence": [_place(index) for index in range(33)],
        }
        result = re_evaluation.reevaluate_run(run, as_of=AS_OF, client=FakeTrendClient())

        self.assertEqual(len(result["evidence"]), 33)
        self.assertTrue(all("trend" in row for row in result["evidence"]))
        self.assertTrue(all(row["trend"].get("reason") != "trend_missing" for row in result["evidence"]))
        self.assertEqual(result["searchTrend"]["batchCount"], 7)
        self.assertEqual(result["searchTrend"].get("timeUnit"), "month")
        self.assertEqual(result["searchTrend"].get("baselineMonths"), 3)
        self.assertEqual(
            result["searchTrend"].get("comparisonLabel"),
            "current_month_vs_previous_3_completed_months",
        )
        self.assertTrue(result["searchTrend"]["relativeRatioOnly"])
        self.assertFalse(result["searchTrend"]["absoluteVolumeAvailable"])
        self.assertTrue(all("monthValues" in row["trend"] for row in result["evidence"]))
        classification_counts = {
            status: sum(
                row["classification"]["status"] == status
                for row in result["evidence"]
            )
            for status in ("WATCH", "TRENDING", "INSUFFICIENT_EVIDENCE")
        }
        self.assertEqual(
            {status: result["stats"][status] for status in classification_counts},
            classification_counts,
        )


if __name__ == "__main__":
    unittest.main()
