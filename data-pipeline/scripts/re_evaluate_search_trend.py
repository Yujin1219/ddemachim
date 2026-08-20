"""Re-evaluate an existing place-evidence run with Naver API HUB Search Trend.

This focused command reads an existing evidence JSON only.  It never searches
Naver Blog or fetches blog bodies.  Search Trend values are relative search
interest indices, not absolute search volume.
"""
from __future__ import annotations

import argparse
import calendar
import json
import os
import sys
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from naver_search_trend import (  # noqa: E402
    API_HUB_SOURCE,
    MAX_KEYWORDS_PER_API_HUB_GROUP,
    MissingNaverTrendApiKeyError,
    NaverSearchTrendClient,
    NaverSearchTrendError,
    TrendKeywordGroup,
    batch_keyword_groups,
)
from src.db.connection import get_connection  # noqa: E402
from src.loaders.blog_trend_loader import persist_blog_trend_run  # noqa: E402


SCHEMA_VERSION = 2
TREND_SOURCE = "NAVER_API_HUB_SEARCH_TREND"
TREND_SEMANTICS = (
    "Naver API HUB Search Trend relative search interest index; "
    "not absolute search volume"
)
DEFAULT_INPUT = ROOT / "results" / "repeated_blog_trend" / "run_2026-08-13.json"
DEFAULT_OUTPUT = ROOT / "results" / "repeated_blog_trend" / "run_2026-08-13_search_trend_api_hub.json"
STATUS_NAMES = ("SURGING", "NEWLY_EMERGING", "STABLE", "INSUFFICIENT_DATA")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _unique_text(values: Sequence[Any]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _text(value)
        key = text.casefold()
        if text and key not in seen:
            seen.add(key)
            output.append(text)
    return output


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


BASELINE_MONTHS = 3
TIME_UNIT = "month"
COMPARISON_LABEL = "current_month_vs_previous_3_completed_months"


def _shift_month(month_start: date, offset: int) -> date:
    absolute_month = month_start.year * 12 + (month_start.month - 1) + offset
    year, month_zero_based = divmod(absolute_month, 12)
    return date(year, month_zero_based + 1, 1)


def _month_label(month_start: date) -> str:
    return month_start.strftime("%Y-%m")


def build_monthly_search_windows(as_of: date) -> dict[str, Any]:
    """Build the month-unit query and the partial-month correction contract."""

    current_start = date(as_of.year, as_of.month, 1)
    baseline_starts = [
        _shift_month(current_start, -offset)
        for offset in range(BASELINE_MONTHS, 0, -1)
    ]
    baseline_months = [
        {
            "month": _month_label(month_start),
            "period": month_start,
            "daysUsed": calendar.monthrange(month_start.year, month_start.month)[1],
            "isCurrentMonth": False,
            "partialMonthAdjusted": False,
        }
        for month_start in baseline_starts
    ]
    current = {
        "month": _month_label(current_start),
        "period": current_start,
        "daysUsed": as_of.day,
        "calendarDays": calendar.monthrange(as_of.year, as_of.month)[1],
        "isCurrentMonth": True,
        "partialMonthAdjusted": as_of.day < calendar.monthrange(as_of.year, as_of.month)[1],
    }
    return {
        "query": {
            "start": baseline_starts[0],
            "end": as_of,
            "timeUnit": TIME_UNIT,
        },
        "current": current,
        "baselineMonths": baseline_months,
        "baselineMonthsCount": BASELINE_MONTHS,
        "partialMonthAdjusted": current["partialMonthAdjusted"],
        "partialMonthDaysUsed": as_of.day,
        "comparisonLabel": COMPARISON_LABEL,
    }


def _window_strings(windows: Mapping[str, Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    def jsonable(value: Any) -> Any:
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, Mapping):
            return {key: jsonable(item) for key, item in value.items()}
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
            return [jsonable(item) for item in value]
        return value

    return jsonable(windows)


def _safe_ratio(numerator: float, denominator: float) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def _round_or_none(value: float | None) -> float | None:
    return round(value, 4) if value is not None else None


def _period_month(value: Any) -> str | None:
    raw = _text(value)
    if not raw:
        return None
    try:
        parsed = date.fromisoformat(raw[:10])
    except ValueError:
        try:
            parsed = datetime.strptime(raw[:7], "%Y-%m").date()
        except ValueError:
            return None
    return _month_label(date(parsed.year, parsed.month, 1))


def summarize_monthly_search_interest(
    trend_result: Mapping[str, Any],
    *,
    windows: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Classify API HUB monthly relative interest with partial-month correction."""

    raw_by_month: dict[str, float] = {}
    rows = trend_result.get("data")
    if isinstance(rows, Sequence) and not isinstance(rows, (str, bytes)):
        for row in rows:
            if not isinstance(row, Mapping):
                continue
            month = _period_month(row.get("period"))
            if month is None:
                continue
            try:
                ratio = float(row.get("ratio"))
            except (TypeError, ValueError):
                continue
            if ratio >= 0:
                raw_by_month[month] = ratio

    month_values: list[dict[str, Any]] = []
    baseline_adjusted_values: list[float] = []
    for month in [*windows["baselineMonths"], windows["current"]]:
        month_name = _text(month["month"])
        raw_ratio = raw_by_month.get(month_name)
        days_used = int(month["daysUsed"])
        adjusted = (raw_ratio or 0.0) / days_used
        value = {
            "month": month_name,
            "period": month["period"].isoformat(),
            "ratio": _round_or_none(raw_ratio),
            "daysUsed": days_used,
            "isCurrentMonth": bool(month["isCurrentMonth"]),
            "partialMonthAdjusted": bool(month["partialMonthAdjusted"]),
            "adjustedDailyAverage": round(adjusted, 4),
            "dataPresent": raw_ratio is not None,
        }
        month_values.append(value)
        if not month["isCurrentMonth"]:
            baseline_adjusted_values.append(adjusted)

    current_value = month_values[-1]
    current = float(current_value["adjustedDailyAverage"])
    baseline = (
        sum(baseline_adjusted_values) / windows["baselineMonthsCount"]
        if windows["baselineMonthsCount"]
        else 0.0
    )
    ratio = _safe_ratio(current, baseline)
    missing_months = [value["month"] for value in month_values if not value["dataPresent"]]

    if baseline == 0 and current > 0:
        status = "NEWLY_EMERGING"
        reason = "baseline_zero_current_positive"
    elif baseline == 0 and current == 0:
        status = "INSUFFICIENT_DATA"
        reason = "baseline_and_current_zero"
    elif ratio is not None and ratio >= 2.0:
        status = "SURGING"
        reason = "ratio_threshold_met"
    else:
        status = "STABLE"
        reason = "ratio_below_threshold"

    return {
        "schemaVersion": SCHEMA_VERSION,
        "groupName": _text(trend_result.get("title")),
        "source": TREND_SOURCE,
        "status": status,
        "available": True,
        "apiStatus": "success",
        "reason": reason,
        "rising": status in {"SURGING", "NEWLY_EMERGING"},
        "timeUnit": TIME_UNIT,
        "baselineMonths": windows["baselineMonthsCount"],
        "comparisonLabel": windows["comparisonLabel"],
        "currentMonth": windows["current"]["month"],
        "currentMonthRatio": _round_or_none(raw_by_month.get(windows["current"]["month"])),
        "current": round(current, 4),
        "baseline": round(baseline, 4),
        "ratio": _round_or_none(ratio),
        "monthlyRatio": _round_or_none(ratio),
        "monthValues": month_values,
        "missingMonths": missing_months,
        "partialMonthAdjusted": windows["partialMonthAdjusted"],
        "partialMonthDaysUsed": windows["partialMonthDaysUsed"],
        # Existing snapshot consumers retain their field names while receiving
        # the monthly corrected current/baseline values and monthly ratio.
        "recentSearchInterestAverage": round(current, 4),
        "previous14dSearchInterestAverage": round(baseline, 4),
        "sixMonthBaselineSearchInterestAverage": round(baseline, 4),
        "shortRatio": _round_or_none(ratio),
        "sixMonthRatio": _round_or_none(ratio),
        "trendRatio": _round_or_none(ratio),
        "recentTrendValue": round(current, 4),
        "previousTrendValue": round(baseline, 4),
        "recentNonzeroObservations": int(current_value["dataPresent"] and raw_by_month.get(windows["current"]["month"], 0) > 0),
        "baselineNonzeroObservations": sum(
            1
            for value in month_values[:-1]
            if value["dataPresent"] and float(value["ratio"] or 0) > 0
        ),
        "recentValidObservationDays": None,
        "previousValidObservationDays": None,
        "sixMonthBaselineValidObservationDays": None,
        "relativeRatioOnly": True,
        "absoluteVolumeAvailable": False,
        "semantics": TREND_SEMANTICS,
        "windows": _window_strings(windows),
    }


def _error_summary(
    group: TrendKeywordGroup,
    *,
    windows: Mapping[str, Mapping[str, Any]],
    reason: str,
    api_status: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "groupName": group.group_name,
        "keywords": list(group.keywords),
        "source": TREND_SOURCE,
        "status": "INSUFFICIENT_DATA",
        "available": False,
        "apiStatus": api_status,
        "reason": reason,
        "rising": False,
        "timeUnit": TIME_UNIT,
        "baselineMonths": BASELINE_MONTHS,
        "comparisonLabel": COMPARISON_LABEL,
        "currentMonth": windows["current"]["month"],
        "currentMonthRatio": None,
        "current": 0.0,
        "baseline": 0.0,
        "ratio": None,
        "monthlyRatio": None,
        "monthValues": [],
        "missingMonths": [],
        "partialMonthAdjusted": windows["partialMonthAdjusted"],
        "partialMonthDaysUsed": windows["partialMonthDaysUsed"],
        "recentSearchInterestAverage": 0.0,
        "previous14dSearchInterestAverage": 0.0,
        "sixMonthBaselineSearchInterestAverage": 0.0,
        "shortRatio": None,
        "sixMonthRatio": None,
        "trendRatio": None,
        "recentTrendValue": 0.0,
        "previousTrendValue": 0.0,
        "recentNonzeroObservations": 0,
        "baselineNonzeroObservations": 0,
        "recentValidObservationDays": 0,
        "previousValidObservationDays": 0,
        "sixMonthBaselineValidObservationDays": 0,
        "relativeRatioOnly": True,
        "absoluteVolumeAvailable": False,
        "semantics": TREND_SEMANTICS,
        "windows": _window_strings(windows),
    }


def _group_for_evidence(evidence: Mapping[str, Any]) -> TrendKeywordGroup | None:
    place_id = _text(evidence.get("canonicalPlaceId"))
    canonical_name = _text(evidence.get("canonicalPlaceName"))
    raw_aliases = evidence.get("aliases", [])
    aliases = list(raw_aliases) if isinstance(raw_aliases, Sequence) and not isinstance(raw_aliases, (str, bytes)) else []
    observed_names: list[Any] = []
    observations = evidence.get("evidence", [])
    if isinstance(observations, Sequence) and not isinstance(observations, (str, bytes)):
        observed_names = [
            row.get("observedPlaceName")
            for row in observations
            if isinstance(row, Mapping)
        ]
    keywords = _unique_text([canonical_name, *aliases, *observed_names])[:MAX_KEYWORDS_PER_API_HUB_GROUP]
    if not place_id or not keywords:
        return None
    return TrendKeywordGroup(
        group_name=f"place:{place_id}",
        keywords=tuple(keywords),
        kind="place",
        kakao_place_id=place_id,
    )


def build_all_place_groups(evidence: Sequence[Mapping[str, Any]]) -> list[TrendKeywordGroup]:
    """Build one API HUB place group for every valid evidence row."""

    groups: list[TrendKeywordGroup] = []
    for row in evidence:
        if not isinstance(row, Mapping):
            continue
        group = _group_for_evidence(row)
        if group is not None:
            groups.append(group)
    return groups


def _place_error_summaries(
    evidence: Sequence[Mapping[str, Any]],
    *,
    windows: Mapping[str, Mapping[str, Any]],
    reason: str,
    api_status: str,
) -> dict[str, Mapping[str, Any]]:
    output: dict[str, Mapping[str, Any]] = {}
    for row in evidence:
        if not isinstance(row, Mapping):
            continue
        place_id = _text(row.get("canonicalPlaceId"))
        group = _group_for_evidence(row)
        if place_id and group is not None:
            output[place_id] = _error_summary(
                group,
                windows=windows,
                reason=reason,
                api_status=api_status,
            )
    return output


def _api_hub_client_from_env() -> NaverSearchTrendClient:
    """Create an API HUB-only client; never silently fall back to legacy DataLab."""

    client_id = _text(os.getenv("NAVER_API_HUB_CLIENT_ID"))
    client_secret = _text(os.getenv("NAVER_API_HUB_CLIENT_SECRET"))
    if not client_id or not client_secret:
        raise MissingNaverTrendApiKeyError(
            "NAVER_API_HUB_CLIENT_ID and NAVER_API_HUB_CLIENT_SECRET are required"
        )
    return NaverSearchTrendClient(
        client_id,
        client_secret,
        source=API_HUB_SOURCE,
    )


def fetch_all_trends(
    evidence: Sequence[Mapping[str, Any]],
    *,
    as_of: date,
    client: Any = None,
    return_batches: bool = False,
) -> Any:
    """Fetch all place groups, isolating failures to their five-group batch."""

    windows = build_monthly_search_windows(as_of)
    groups = build_all_place_groups(evidence)
    batches = batch_keyword_groups(groups, source=API_HUB_SOURCE)
    summaries: dict[str, Mapping[str, Any]] = {}

    if client is None:
        try:
            client = _api_hub_client_from_env()
        except MissingNaverTrendApiKeyError:
            summaries.update(
                _place_error_summaries(
                    evidence,
                    windows=windows,
                    reason="API_ERROR:CREDENTIALS_MISSING",
                    api_status="credentials_missing",
                )
            )
            return (summaries, batches) if return_batches else summaries

    for batch in batches:
        try:
            raw_results = client.search(
                batch,
                start_date=windows["query"]["start"],
                end_date=windows["query"]["end"],
                time_unit=TIME_UNIT,
            )
        except (NaverSearchTrendError, ValueError) as exc:
            reason = f"API_ERROR:{type(exc).__name__}"
            for group in batch:
                if group.kakao_place_id:
                    summaries[group.kakao_place_id] = _error_summary(
                        group,
                        windows=windows,
                        reason=reason,
                        api_status="request_failed",
                    )
            continue
        except Exception as exc:  # noqa: BLE001 - transport implementations vary
            reason = f"API_ERROR:{type(exc).__name__}"
            for group in batch:
                if group.kakao_place_id:
                    summaries[group.kakao_place_id] = _error_summary(
                        group,
                        windows=windows,
                        reason=reason,
                        api_status="request_failed",
                    )
            continue

        if not isinstance(raw_results, Sequence) or isinstance(raw_results, (str, bytes)):
            for group in batch:
                if group.kakao_place_id:
                    summaries[group.kakao_place_id] = _error_summary(
                        group,
                        windows=windows,
                        reason="API_ERROR:InvalidResponse",
                        api_status="response_invalid",
                    )
            continue

        raw_by_title = {
            _text(raw.get("title")): raw
            for raw in raw_results
            if isinstance(raw, Mapping) and _text(raw.get("title"))
        }
        for group in batch:
            if not group.kakao_place_id:
                continue
            raw = raw_by_title.get(group.group_name)
            if raw is None:
                summaries[group.kakao_place_id] = _error_summary(
                    group,
                    windows=windows,
                    reason="MISSING_RESPONSE",
                    api_status="missing_response",
                )
                continue
            summaries[group.kakao_place_id] = summarize_monthly_search_interest(raw, windows=windows)

    # A malformed evidence row should still have a concrete reason if it has an
    # identity, rather than falling back to the old trend_missing sentinel.
    for row in evidence:
        if not isinstance(row, Mapping):
            continue
        place_id = _text(row.get("canonicalPlaceId"))
        if place_id and place_id not in summaries:
            group = _group_for_evidence(row)
            if group is not None:
                summaries[place_id] = _error_summary(
                    group,
                    windows=windows,
                    reason="MISSING_RESPONSE",
                    api_status="missing_response",
                )

    return (summaries, batches) if return_batches else summaries


def _load_default_config() -> Mapping[str, Any]:
    from repeated_blog_trend import load_config

    return load_config()


def _classify_with_compatibility(
    evidence: Mapping[str, Any],
    *,
    config: Mapping[str, Any] | None,
) -> dict[str, Any]:
    from repeated_blog_trend import classify_place

    return classify_place(evidence, config or _load_default_config())


def reevaluate_run(
    run: Mapping[str, Any],
    *,
    as_of: date,
    client: Any = None,
    config: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    evidence_rows = run.get("evidence", [])
    if not isinstance(evidence_rows, Sequence) or isinstance(evidence_rows, (str, bytes)):
        raise ValueError("run evidence must be a list")
    summaries, batches = fetch_all_trends(
        evidence_rows,
        as_of=as_of,
        client=client,
        return_batches=True,
    )
    windows = build_monthly_search_windows(as_of)
    updated_evidence: list[dict[str, Any]] = []
    for raw in evidence_rows:
        if not isinstance(raw, Mapping):
            continue
        row = dict(raw)
        place_id = _text(row.get("canonicalPlaceId"))
        trend = dict(summaries.get(place_id, {}))
        if not trend:
            group = _group_for_evidence(row)
            if group is not None:
                trend = _error_summary(
                    group,
                    windows=windows,
                    reason="MISSING_RESPONSE",
                    api_status="missing_response",
                )
        trend["trendCheckedAt"] = _utc_now()
        row["trend"] = trend
        row["classification"] = _classify_with_compatibility(row, config=config)
        updated_evidence.append(row)

    status_counts = Counter(
        _text(row.get("trend", {}).get("status")) or "INSUFFICIENT_DATA"
        for row in updated_evidence
    )
    classification_counts = Counter(
        _text(row.get("classification", {}).get("status"))
        or "INSUFFICIENT_EVIDENCE"
        for row in updated_evidence
    )
    api_failure_count = sum(
        1
        for row in updated_evidence
        if _text(row.get("trend", {}).get("apiStatus")) in {
            "credentials_missing",
            "request_failed",
            "response_invalid",
        }
    )
    api_result_missing_count = sum(
        1
        for row in updated_evidence
        if _text(row.get("trend", {}).get("apiStatus")) in {
            "missing_response",
        }
    )
    result = dict(run)
    result["schemaVersion"] = SCHEMA_VERSION
    result["collectionDate"] = as_of.isoformat()
    result["measuredAt"] = _text(run.get("measuredAt")) or _utc_now()
    result["semantics"] = (
        f"{_text(run.get('semantics'))}; {TREND_SEMANTICS}"
        if _text(run.get("semantics"))
        else TREND_SEMANTICS
    )
    result["evidence"] = updated_evidence
    result["trendStatusCounts"] = {status: status_counts.get(status, 0) for status in STATUS_NAMES}
    result["searchTrend"] = {
        "schemaVersion": SCHEMA_VERSION,
        "source": TREND_SOURCE,
        "timeUnit": TIME_UNIT,
        "baselineMonths": BASELINE_MONTHS,
        "comparisonLabel": COMPARISON_LABEL,
        "partialMonthAdjusted": windows["partialMonthAdjusted"],
        "groupCount": len(build_all_place_groups(evidence_rows)),
        "batchCount": len(batches),
        "batchSizes": [len(batch) for batch in batches],
        "batches": [[group.to_dict() for group in batch] for batch in batches],
        "windows": _window_strings(windows),
        "relativeRatioOnly": True,
        "absoluteVolumeAvailable": False,
        "semantics": TREND_SEMANTICS,
        "apiFailureCount": api_failure_count,
        "apiResultMissingCount": api_result_missing_count,
        "dataInsufficientCount": status_counts.get("INSUFFICIENT_DATA", 0),
        "summaries": [
            {
                "canonicalPlaceId": row.get("canonicalPlaceId"),
                "canonicalPlaceName": row.get("canonicalPlaceName"),
                **dict(row.get("trend", {})),
            }
            for row in updated_evidence
        ],
    }
    stats = dict(result.get("stats", {})) if isinstance(result.get("stats"), Mapping) else {}
    stats["searchTrendGroups"] = len(build_all_place_groups(evidence_rows))
    stats["searchTrendBatches"] = len(batches)
    stats["searchTrendApiFailures"] = api_failure_count
    stats["searchTrendDataInsufficient"] = status_counts.get("INSUFFICIENT_DATA", 0)
    for status in ("WATCH", "TRENDING", "INSUFFICIENT_EVIDENCE"):
        stats[status] = classification_counts.get(status, 0)
    result["stats"] = stats
    return result


def persist_result_to_database(
    result: Mapping[str, Any],
    *,
    connection_factory: Callable[[], Any] = get_connection,
    loader: Callable[[Any, Mapping[str, Any]], Any] = persist_blog_trend_run,
) -> dict[str, int]:
    """Persist the refreshed weekly run and frontend-ready place results."""

    with connection_factory() as connection:
        try:
            stats = loader(connection, result)
        except Exception:
            # Preserve the loader's FAILED run state for retry/operations.
            connection.commit()
            raise
        connection.commit()
    return stats.as_dict()


def _load_json(path: Path) -> Mapping[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise ValueError("run JSON must be an object")
    return payload


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Re-evaluate an existing run with Naver API HUB Search Trend only"
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--date", type=date.fromisoformat, default=None)
    parser.add_argument("--skip-db", action="store_true")
    args = parser.parse_args(argv)
    try:
        load_dotenv(ROOT / ".env", override=True)
        run = _load_json(args.input)
        as_of = args.date or date.fromisoformat(_text(run.get("collectionDate")))
        result = reevaluate_run(run, as_of=as_of)
        if args.skip_db:
            result["database"] = {"status": "skipped", "reason": "skip_db_requested"}
        else:
            result["database"] = {
                "status": "persisted",
                **persist_result_to_database(result),
            }
        _write_json(args.output, result)
        print(
            json.dumps(
                {
                    "output": str(args.output),
                    "places": len(result.get("evidence", [])),
                    "trendStatusCounts": result.get("trendStatusCounts", {}),
                    "apiFailureCount": result.get("searchTrend", {}).get("apiFailureCount", 0),
                    "dataInsufficientCount": result.get("searchTrend", {}).get("dataInsufficientCount", 0),
                    "database": result.get("database", {}),
                },
                ensure_ascii=False,
            )
        )
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"search trend re-evaluation failed ({type(exc).__name__})", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
