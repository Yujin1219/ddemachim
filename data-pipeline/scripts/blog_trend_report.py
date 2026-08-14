"""Final evidence report and conservative review decisions."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any, Mapping, Sequence


SCHEMA_VERSION = 1
DEFAULT_CRITERIA = {
    "local_validation_status": "matched",
    "recent_unique_links_min": 3,
    "recent_unique_bloggers_min": 3,
    "growth_ratio_min": 2.0,
    "absolute_delta_min": 2.0,
    "trend_ratio_is_corroboration_only": True,
    "admin_review_status": "review_required",
}


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _trend_corrob(trend: Mapping[str, Any] | None) -> dict[str, Any]:
    if not isinstance(trend, Mapping):
        return {
            "available": False,
            "rising": None,
            "hard_fail": False,
            "reason": "trend_missing_or_not_run",
        }
    ratio_growth = _number(trend.get("ratio_growth"))
    rising = bool(ratio_growth is not None and ratio_growth > 1)
    return {
        "available": True,
        "rising": rising,
        "state": trend.get("state"),
        "ratio_growth": ratio_growth,
        "relative_ratio_only": bool(trend.get("relative_ratio_only", True)),
        "hard_fail": False,
        "reason": "corroboration_only",
    }


def evaluate_place_decision(
    metric: Mapping[str, Any],
    *,
    validation_status: str = "matched",
    trend: Mapping[str, Any] | None = None,
    criteria: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    effective = dict(DEFAULT_CRITERIA)
    if criteria:
        effective.update(criteria)
    recent_links = int(metric.get("recent_unique_links", metric.get("unique_link_count", 0)) or 0)
    recent_bloggers = int(metric.get("recent_unique_bloggers", metric.get("unique_blogger_count", 0)) or 0)
    growth_ratio = _number(metric.get("growth_ratio"))
    absolute_delta = _number(metric.get("absolute_delta"))
    prior_zero_new = bool(metric.get("prior_zero_new"))
    conditions = {
        "local_validation": validation_status == effective["local_validation_status"],
        "recent_unique_links": recent_links >= int(effective["recent_unique_links_min"]),
        "recent_unique_bloggers": recent_bloggers >= int(effective["recent_unique_bloggers_min"]),
        "growth_ratio": bool(growth_ratio is not None and growth_ratio >= float(effective["growth_ratio_min"])),
        "absolute_delta": bool(absolute_delta is not None and absolute_delta >= float(effective["absolute_delta_min"])),
    }
    if prior_zero_new:
        eligibility = "new_candidate"
        conditions["growth_ratio"] = False
        conditions["absolute_delta"] = False
        decision_reason = "prior_window_zero; growth criteria are not defined"
    elif all(conditions.values()):
        eligibility = "qualified"
        decision_reason = "all base criteria met"
    else:
        eligibility = "not_qualified"
        decision_reason = "one_or_more_base_criteria_not_met"
    trend_evidence = _trend_corrob(trend)
    return {
        "schema_version": SCHEMA_VERSION,
        "kakao_place_id": metric.get("kakao_place_id"),
        "eligibility": eligibility,
        "status": "review_required",
        "admin_review_status": "review_required",
        "decision_reason": decision_reason,
        "criteria": effective,
        "conditions": conditions,
        "metrics": dict(metric),
        "trend_corroboration": trend_evidence,
        "advertising_signal": metric.get("advertising_signal", {"ad_suspected": False, "flag_only": True}),
        "hard_fail_reasons": [
            name for name, passed in conditions.items() if not passed and name != "local_validation"
        ] + ([] if conditions["local_validation"] else ["local_validation_not_matched"]),
    }


def build_final_report(
    metrics: Sequence[Mapping[str, Any]],
    *,
    as_of: date,
    validation_status_by_place: Mapping[str, str] | None = None,
    trend_by_place: Mapping[str, Mapping[str, Any]] | None = None,
    criteria: Mapping[str, Any] | None = None,
    source_artifacts: Sequence[str] = (),
) -> dict[str, Any]:
    validation = validation_status_by_place or {}
    trends = trend_by_place or {}
    decisions: list[dict[str, Any]] = []
    for metric in metrics:
        if not isinstance(metric, Mapping):
            continue
        place_id = str(metric.get("kakao_place_id", "") or "")
        decisions.append(
            evaluate_place_decision(
                metric,
                validation_status=validation.get(place_id, "matched"),
                trend=trends.get(place_id),
                criteria=criteria,
            )
        )
    qualified = sum(1 for decision in decisions if decision["eligibility"] == "qualified")
    return {
        "schema_version": SCHEMA_VERSION,
        "report_type": "blog_trend_final",
        "as_of": as_of.isoformat(),
        "basis_date": as_of.isoformat(),
        "status": "review_required",
        "admin_review_status": "review_required",
        "criteria": {**DEFAULT_CRITERIA, **(dict(criteria) if criteria else {})},
        "trend_policy": {
            "relative_ratio_only": True,
            "rising_is_corroboration": True,
            "missing_or_low_search_volume_is_not_a_hard_fail": True,
        },
        "summary": {
            "places": len(decisions),
            "qualified_for_admin_review": qualified,
            "new_candidates": sum(1 for decision in decisions if decision["eligibility"] == "new_candidate"),
            "not_qualified": sum(1 for decision in decisions if decision["eligibility"] == "not_qualified"),
        },
        "source_artifacts": list(source_artifacts),
        "decisions": decisions,
    }


def write_final_report(output_dir: Path, report: Mapping[str, Any], *, run_id: str) -> dict[str, Path]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"final-report_{run_id}.json"
    text_path = output_dir / f"final-report_{run_id}.txt"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "Blog trend final report",
        f"basis date: {report.get('basis_date')}",
        "status: review_required",
        "criteria: local matched, recent links>=3, bloggers>=3, growth>=2x, absolute delta>=2",
        "trend ratio: corroboration only; missing/low trend data is not a hard fail",
        "",
    ]
    for decision in report.get("decisions", []):
        if not isinstance(decision, Mapping):
            continue
        metric = decision.get("metrics") if isinstance(decision.get("metrics"), Mapping) else {}
        lines.append(
            "- {place}: eligibility={eligibility}; status=review_required; links={links}; bloggers={bloggers}; "
            "growth={growth}; delta={delta}; trend={trend}".format(
                place=decision.get("kakao_place_id", ""),
                eligibility=decision.get("eligibility"),
                links=metric.get("recent_unique_links", 0),
                bloggers=metric.get("recent_unique_bloggers", 0),
                growth=metric.get("growth_ratio"),
                delta=metric.get("absolute_delta"),
                trend=(decision.get("trend_corroboration") or {}).get("state", "unavailable"),
            )
        )
        signal = decision.get("advertising_signal")
        ad_flag = bool(signal.get("ad_suspected")) if isinstance(signal, Mapping) else False
        lines.append(
            "  evidence: reasons={reasons}; advertising_signal_flag={ad}".format(
                reasons=",".join(str(reason) for reason in decision.get("hard_fail_reasons", [])) or "base-criteria",
                ad=ad_flag,
            )
        )
    text_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"json": json_path, "text": text_path}
