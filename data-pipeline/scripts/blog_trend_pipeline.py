"""Orchestration entrypoint for the seven-step blog trend pipeline.

Each stage can be run independently.  ``--dry-run`` performs input parsing and
contract planning without reading credentials or making network requests.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from blog_place_pipeline import (
    _relevance_details,
    _representative_score_rows,
    choose_representative_place,
    parse_post_date,
    score_representative_places,
    select_posts,
)
from blog_trend_metrics import aggregate_verified_place_mentions, place_record_key
from blog_trend_report import build_final_report, write_final_report
from blog_trend_snapshot import JsonlSnapshotStore, snapshot_schema_document
from kakao_place_validation import (
    KakaoLocalClient,
    MissingKakaoApiKeyError,
    load_representatives_from_artifact,
    place_source_key,
    summarize_validation,
    validate_representatives,
)
from naver_search_trend import (
    MissingNaverTrendApiKeyError,
    NaverSearchTrendClient,
    NaverSearchTrendError,
    batch_keyword_groups,
    build_keyword_groups,
    summarize_trend_ratio,
)


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIR = ROOT / "results" / "blog_trend_pipeline"
DEFAULT_INPUT = ROOT / "results" / "blog_place_pilot" / "extracted-places_20260812T042328Z.json"
SCHEMA_VERSION = 1


def _load_json(path: Path) -> Mapping[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, Mapping):
        raise ValueError("input must be a JSON object")
    return value


def _write_json(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def _safe_run_id(value: str | None = None) -> str:
    if value:
        return value.replace("/", "_").replace(" ", "_")
    return date.today().strftime("%Y%m%d")


def _posts_from_payload(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    for key in ("extracted_posts", "selected_posts"):
        value = payload.get(key)
        if isinstance(value, list):
            return [dict(post) for post in value if isinstance(post, Mapping)]
    # A raw-search artifact may provide query -> items. It is intentionally not
    # fetched here; callers can run selection only and decide separately if
    # public body retrieval is appropriate.
    items_by_query = payload.get("items_by_query")
    if isinstance(items_by_query, Mapping):
        rows: list[dict[str, Any]] = []
        for query, items in items_by_query.items():
            if not isinstance(items, Sequence) or isinstance(items, (str, bytes)):
                continue
            rows.extend({**dict(item), "query": query} for item in items if isinstance(item, Mapping))
        return rows
    return []


def refresh_representative_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Re-score extracted places without mutating the input artifact.

    Extracted artifacts can outlive the representative-place scoring rules.
    Recompute only posts that carry a places list so an old auto-confirmed
    representative cannot bypass the current evidence checks.  Empty lists
    retain explicit fetch/no-place states because they do not provide new
    evidence to score.
    """

    refreshed = dict(payload)
    raw_posts = payload.get("extracted_posts")
    if not isinstance(raw_posts, list):
        return refreshed

    refreshed_posts: list[Any] = []
    preserved_empty_statuses = {"body_failed", "no_place", "skipped"}
    for raw_post in raw_posts:
        if not isinstance(raw_post, Mapping):
            refreshed_posts.append(raw_post)
            continue

        post = dict(raw_post)
        places = raw_post.get("places")
        if not isinstance(places, list):
            refreshed_posts.append(post)
            continue

        if not places:
            post["places"] = []
            if str(post.get("representative_status", "") or "") not in preserved_empty_statuses:
                status, representative, reasons = choose_representative_place([])
                post.update(
                    {
                        "representative_status": status,
                        "representative_place": representative,
                        "representative_scores": _representative_score_rows([]),
                        "representative_reasons": reasons,
                    }
                )
            refreshed_posts.append(post)
            continue

        scored_places = score_representative_places(
            places,
            query=str(raw_post.get("query") or ""),
            title=raw_post.get("title", ""),
            description=raw_post.get("description", ""),
        )
        representative_status, representative_place, representative_reasons = (
            choose_representative_place(scored_places)
        )
        post.update(
            {
                "places": scored_places,
                "representative_status": representative_status,
                "representative_place": representative_place,
                "representative_scores": _representative_score_rows(scored_places),
                "representative_reasons": representative_reasons,
            }
        )
        refreshed_posts.append(post)

    refreshed["extracted_posts"] = refreshed_posts
    return refreshed


def _selection_rows(
    payload: Mapping[str, Any],
    *,
    as_of: date,
    author_cap: int = 2,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    items_by_query = payload.get("items_by_query")
    if isinstance(items_by_query, Mapping):
        selected: list[dict[str, Any]] = []
        counts: dict[str, int] = {}
        for query, items in items_by_query.items():
            if not isinstance(items, Sequence) or isinstance(items, (str, bytes)):
                continue
            query_text = str(query)
            rows = select_posts(
                [item for item in items if isinstance(item, Mapping)],
                query_text,
                analysis_start=as_of - timedelta(days=59),
                analysis_end=as_of,
                author_cap=author_cap,
            )
            selected.extend(rows)
            counts[query_text] = len(rows)
        return selected, {"mode": "raw_selection", "selection_counts": counts}

    posts = _posts_from_payload(payload)
    output: list[dict[str, Any]] = []
    for post in posts:
        query = str(post.get("query", "") or "")
        post_date = parse_post_date(post.get("postdate")) or as_of
        score, reasons = _relevance_details(post, query, post_date, as_of)
        row = dict(post)
        row["selection_score"] = score
        row["selection_reasons"] = list(dict.fromkeys(reasons + list(row.get("selection_reasons", []))))
        output.append(row)
    return output, {"mode": "artifact_re_score", "selection_counts": {"artifact": len(output)}}


def _validation_index(records: Sequence[Mapping[str, Any]]) -> dict[str, Mapping[str, Any]]:
    index: dict[str, Mapping[str, Any]] = {}
    for record in records:
        if not isinstance(record, Mapping):
            continue
        source_key = str(record.get("source_key", "") or "")
        if source_key:
            index[source_key] = record
        representative = record.get("representative_place")
        if isinstance(representative, Mapping):
            index[place_record_key(representative)] = record
    return index


def _attach_validations(
    posts: Sequence[Mapping[str, Any]],
    validation_records: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    index = _validation_index(validation_records)
    output: list[dict[str, Any]] = []
    for raw in posts:
        post = dict(raw)
        representative = post.get("representative_place")
        if isinstance(representative, Mapping):
            validation = index.get(place_record_key(representative))
            if validation is not None:
                post["local_validation"] = dict(validation)
        output.append(post)
    return output


def _matched_place_rows(validation_records: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for record in validation_records:
        if not isinstance(record, Mapping) or record.get("status") != "matched":
            continue
        matched = record.get("matched_place")
        if not isinstance(matched, Mapping):
            continue
        place_id = str(record.get("matched_place_id", matched.get("id", "")) or "").strip()
        if not place_id:
            continue
        representative = record.get("representative_place")
        name = str(matched.get("place_name", "") or "")
        aliases: list[str] = []
        if isinstance(representative, Mapping):
            representative_name = str(representative.get("name", "") or "").strip()
            if representative_name and representative_name != name:
                aliases.append(representative_name)
        row = rows.setdefault(
            place_id,
            {
                "kakao_place_id": place_id,
                "name": name,
                "aliases": aliases,
                "regions": ["종로구"],
            },
        )
        row["aliases"] = sorted(set(row["aliases"]) | set(aliases))
    return [rows[key] for key in sorted(rows)]


def _run_kakao_stage(
    payload: Mapping[str, Any],
    *,
    output_dir: Path,
    run_id: str,
    dry_run: bool,
) -> tuple[dict[str, Any], list[Mapping[str, Any]]]:
    representatives = load_representatives_from_artifact(payload)
    unique_representative_count = len(
        {source_key or place_source_key(place) for source_key, place in representatives}
    )
    representative_mention_count = len(representatives)
    if dry_run:
        result = {
            "schema_version": SCHEMA_VERSION,
            "status": "dry_run",
            "representative_count": unique_representative_count,
            "unique_representative_count": unique_representative_count,
            "representative_mention_count": representative_mention_count,
            "validation": [],
            "constraints": {"category_group_codes": ["CE7", "FD6"], "target_district": "종로구"},
        }
        _write_json(output_dir / f"kakao-validation_{run_id}.json", result)
        return result, []
    try:
        client = KakaoLocalClient.from_env()
    except MissingKakaoApiKeyError as exc:
        result = {
            "schema_version": SCHEMA_VERSION,
            "status": "unavailable",
            "representative_count": unique_representative_count,
            "unique_representative_count": unique_representative_count,
            "representative_mention_count": representative_mention_count,
            "validation": [],
            "reason": str(exc),
            "constraints": {"category_group_codes": ["CE7", "FD6"], "target_district": "종로구"},
        }
        _write_json(output_dir / f"kakao-validation_{run_id}.json", result)
        return result, []
    records = validate_representatives(representatives, client)
    result = {
        "schema_version": SCHEMA_VERSION,
        "status": "completed",
        "representative_count": unique_representative_count,
        "unique_representative_count": unique_representative_count,
        "representative_mention_count": representative_mention_count,
        "counts": summarize_validation(records),
        "validation": records,
    }
    _write_json(output_dir / f"kakao-validation_{run_id}.json", result)
    return result, records


def _run_trend_stage(
    place_rows: Sequence[Mapping[str, Any]],
    *,
    as_of: date,
    output_dir: Path,
    run_id: str,
    dry_run: bool,
    fetch_trend: bool,
) -> tuple[dict[str, Any], dict[str, Mapping[str, Any]]]:
    groups = build_keyword_groups(place_rows)
    batches = batch_keyword_groups(groups)
    if dry_run or not fetch_trend:
        result = {
            "schema_version": SCHEMA_VERSION,
            "status": "dry_run" if dry_run else "skipped",
            "reason": "dry_run" if dry_run else "--fetch-trend not supplied",
            "group_count": len(groups),
            "batch_count": len(batches),
            "batches": [[group.to_dict() for group in batch] for batch in batches],
            "results": [],
        }
        _write_json(output_dir / f"naver-trend_{run_id}.json", result)
        return result, {}
    try:
        client = NaverSearchTrendClient.from_env()
    except MissingNaverTrendApiKeyError as exc:
        result = {
            "schema_version": SCHEMA_VERSION,
            "status": "unavailable",
            "reason": str(exc),
            "group_count": len(groups),
            "batch_count": len(batches),
            "results": [],
        }
        _write_json(output_dir / f"naver-trend_{run_id}.json", result)
        return result, {}
    start_date = as_of - timedelta(days=34)
    try:
        raw_results = client.search(groups, start_date=start_date, end_date=as_of)
    except NaverSearchTrendError as exc:
        error_class = type(exc).__name__
        result = {
            "schema_version": SCHEMA_VERSION,
            "status": "unavailable",
            "reason": f"search_error:{error_class}",
            "error_class": error_class,
            "group_count": len(groups),
            "batch_count": len(batches),
            "results": [],
        }
        _write_json(output_dir / f"naver-trend_{run_id}.json", result)
        return result, {}
    group_by_name = {group.group_name: group for group in groups}
    summaries: list[dict[str, Any]] = []
    by_place: dict[str, Mapping[str, Any]] = {}
    recent_start = as_of - timedelta(days=6)
    baseline_end = recent_start - timedelta(days=1)
    baseline_start = baseline_end - timedelta(days=27)
    for raw in raw_results:
        title = str(raw.get("title", "") or "")
        group = group_by_name.get(title)
        summary = summarize_trend_ratio(
            raw,
            recent_start=recent_start,
            recent_end=as_of,
            baseline_start=baseline_start,
            baseline_end=baseline_end,
        )
        summary["kakao_place_id"] = group.kakao_place_id if group else None
        summaries.append(summary)
        if group and group.kind == "place" and group.kakao_place_id:
            by_place[group.kakao_place_id] = summary
    result = {
        "schema_version": SCHEMA_VERSION,
        "status": "completed",
        "group_count": len(groups),
        "batch_count": len(batches),
        "results": raw_results,
        "summaries": summaries,
    }
    _write_json(output_dir / f"naver-trend_{run_id}.json", result)
    return result, by_place


def run_pipeline(
    input_path: Path,
    *,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    as_of: date,
    run_id: str | None = None,
    dry_run: bool = False,
    fetch_trend: bool = False,
    snapshot: bool = True,
) -> dict[str, Any]:
    payload = refresh_representative_payload(_load_json(input_path))
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    effective_run_id = _safe_run_id(run_id)

    selected_posts, selection_meta = _selection_rows(payload, as_of=as_of)
    _write_json(
        output_dir / f"selection_{effective_run_id}.json",
        {"schema_version": SCHEMA_VERSION, **selection_meta, "posts": selected_posts},
    )

    kakao_result, validation_records = _run_kakao_stage(
        payload, output_dir=output_dir, run_id=effective_run_id, dry_run=dry_run
    )
    posts = _attach_validations(selected_posts, validation_records)
    metrics = aggregate_verified_place_mentions(posts, validation_records, as_of=as_of)
    _write_json(output_dir / f"metrics_{effective_run_id}.json", {"schema_version": SCHEMA_VERSION, "metrics": metrics})

    place_rows = _matched_place_rows(validation_records)
    trend_result, trend_by_place = _run_trend_stage(
        place_rows,
        as_of=as_of,
        output_dir=output_dir,
        run_id=effective_run_id,
        dry_run=dry_run,
        fetch_trend=fetch_trend,
    )

    if snapshot and not dry_run:
        snapshot_path = output_dir / "blog-post-snapshots.jsonl"
        store = JsonlSnapshotStore(snapshot_path)
        snapshot_rows = []
        for post in posts:
            snapshot_rows.append(
                {
                    key: post.get(key)
                    for key in (
                        "collected_at",
                        "query",
                        "link",
                        "bloggerlink",
                        "postdate",
                        "title",
                        "description",
                        "selection_bucket",
                        "selection_score",
                        "selection_reasons",
                        "representative_status",
                        "local_validation",
                    )
                    if post.get(key) not in (None, "")
                }
            )
        snapshot_result = store.append(snapshot_rows, collected_at=as_of)
        _write_json(
            output_dir / f"snapshot_{effective_run_id}.json",
            {"schema_version": SCHEMA_VERSION, "path": str(snapshot_path), **snapshot_result.__dict__},
        )
    else:
        snapshot_result = None
        _write_json(
            output_dir / f"snapshot_{effective_run_id}.json",
            {"schema_version": SCHEMA_VERSION, "status": "dry_run", "schema": snapshot_schema_document()},
        )

    validation_status = {
        str(record.get("matched_place_id", "")): str(record.get("status", ""))
        for record in validation_records
        if record.get("matched_place_id")
    }
    final_report = build_final_report(
        metrics,
        as_of=as_of,
        validation_status_by_place=validation_status,
        trend_by_place=trend_by_place,
        source_artifacts=[str(input_path)],
    )
    report_paths = write_final_report(output_dir, final_report, run_id=effective_run_id)
    return {
        "schema_version": SCHEMA_VERSION,
        "input": str(input_path),
        "output_dir": str(output_dir),
        "run_id": effective_run_id,
        "selection": {**selection_meta, "post_count": len(selected_posts)},
        "kakao": kakao_result,
        "metrics": metrics,
        "trend": trend_result,
        "snapshot": snapshot_result.__dict__ if snapshot_result else {"status": "dry_run"},
        "report": {key: str(path) for key, path in report_paths.items()},
    }


def _latest_default_input() -> Path:
    candidates = sorted((ROOT / "results" / "blog_place_pilot").glob("extracted-places_*.json"))
    return candidates[-1] if candidates else DEFAULT_INPUT


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the six-stage blog trend data pipeline")
    parser.add_argument("--input", type=Path, default=None, help="blog_place extracted JSON artifact")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    parser.add_argument("--run-id", default=None)
    parser.add_argument(
        "--stage",
        choices=("all", "validate", "select", "aggregate", "snapshot", "trend", "report"),
        default="all",
    )
    parser.add_argument("--dry-run", action="store_true", help="no credentials, network, or snapshot append")
    parser.add_argument("--fetch-trend", action="store_true", help="call Naver Search Trend when credentials exist")
    parser.add_argument("--no-snapshot", action="store_true")
    args = parser.parse_args(argv)
    input_path = args.input or _latest_default_input()
    try:
        if args.stage == "all":
            result = run_pipeline(
                input_path,
                output_dir=args.output_dir,
                as_of=args.as_of,
                run_id=args.run_id,
                dry_run=args.dry_run,
                fetch_trend=args.fetch_trend,
                snapshot=not args.no_snapshot,
            )
            kakao = result["kakao"]
            trend = result["trend"]
            print(
                "blog trend pipeline completed: selection={} validation={} metrics={} "
                "kakao_status={} trend_status={}".format(
                    result["selection"].get("post_count", 0),
                    kakao.get("representative_count", 0),
                    len(result["metrics"]),
                    kakao.get("status"),
                    trend.get("status"),
                )
            )
            return 0

        payload = refresh_representative_payload(_load_json(input_path))
        run_id = _safe_run_id(args.run_id)
        args.output_dir.mkdir(parents=True, exist_ok=True)
        if args.stage == "validate":
            result, _ = _run_kakao_stage(payload, output_dir=args.output_dir, run_id=run_id, dry_run=args.dry_run)
            print(f"validation stage: status={result['status']} representatives={result['representative_count']}")
            return 0 if result["status"] not in {"unavailable"} else 2
        selected, meta = _selection_rows(payload, as_of=args.as_of)
        if args.stage == "select":
            path = _write_json(args.output_dir / f"selection_{run_id}.json", {"schema_version": SCHEMA_VERSION, **meta, "posts": selected})
            print(f"selection stage: posts={len(selected)} output={path}")
            return 0
        # The standalone later stages use the complete orchestrator so they
        # retain the same joins and output contracts.
        result = run_pipeline(
            input_path,
            output_dir=args.output_dir,
            as_of=args.as_of,
            run_id=run_id,
            dry_run=args.dry_run,
            fetch_trend=args.fetch_trend if args.stage == "trend" else False,
            snapshot=not args.no_snapshot and args.stage == "snapshot",
        )
        print(f"{args.stage} stage: output_dir={result['output_dir']}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"blog trend pipeline failed ({type(exc).__name__})", file=sys.stderr)
        return 2


# Re-export the stage contracts for network-free callers/tests that prefer one
# orchestration import instead of reaching into each module.
__all__ = [
    "KakaoLocalClient",
    "NaverSearchTrendClient",
    "aggregate_verified_place_mentions",
    "build_final_report",
    "build_keyword_groups",
    "refresh_representative_payload",
    "run_pipeline",
]


if __name__ == "__main__":
    raise SystemExit(main())
