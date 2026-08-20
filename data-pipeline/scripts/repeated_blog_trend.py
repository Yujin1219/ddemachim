"""Repeated-search evidence pipeline for discovering trending Jongno places.

The pipeline measures recurrence inside collected Naver search-result samples.
It must not be presented as a measurement of all Naver Blog posts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from blog_place_pipeline import BlogBodyFetcher, extract_selected_posts, normalize_blog_url, parse_post_date
from blog_trend_pilot import search_blog_page
from naver_search_trend import (
    MAX_KEYWORDS_PER_GROUP,
    TrendKeywordGroup,
)
from src.cleaners.common import extract_district
from src.db.connection import get_connection
from src.loaders.blog_trend_loader import (
    _search_trend_status,
    classify_trend_place_category,
    persist_blog_trend_run,
    trend_intent_phrase,
)


DEFAULT_CONFIG_PATH = ROOT / "config" / "blog_trend_discovery.json"
DEFAULT_OUTPUT_DIR = ROOT / "results" / "repeated_blog_trend"
SCHEMA_VERSION = 1
FINAL_SEARCH_TREND_STATUSES = ("WATCH", "TRENDING", "INSUFFICIENT_EVIDENCE")
LEGACY_SELECTION_QUOTAS = {
    "relevance": 300,
    "cross_query": 100,
    "diversity": 50,
    "exploration": 50,
}
REUSED_PLACE_FIELDS = (
    "canonicalPlaceId",
    "canonicalPlaceName",
    "canonicalSource",
    "canonicalRoadAddress",
    "canonicalLongitude",
    "canonicalLatitude",
    "canonicalPhone",
    "observedPlaceName",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _unique_text(values: Iterable[Any]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        candidate = _text(value)
        key = candidate.casefold()
        if not candidate or key in seen:
            continue
        seen.add(key)
        output.append(candidate)
    return output


def _normalize_post_identity(value: Any) -> str | None:
    """Normalize a post URL for cross-query identity without breaking PostView URLs."""

    normalized = normalize_blog_url(value)
    if normalized is None:
        return None
    parsed = urlsplit(normalized)
    if parsed.path.casefold().endswith("/postview.naver"):
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
        canonical_pairs = [
            (key, value)
            for key, value in query_pairs
            if key.casefold() in {"blogid", "logno"}
        ]
        query = urlencode(sorted(canonical_pairs or query_pairs))
    else:
        query = ""
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, query, ""))


def _post_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    return parse_post_date(_text(value))


def _search_settings(config: Mapping[str, Any]) -> dict[str, int]:
    raw = config.get("search", {})
    settings = raw if isinstance(raw, Mapping) else {}
    return {
        "pageSize": int(settings.get("pageSize", 100)),
        "maxResultsPerQuery": int(settings.get("maxResultsPerQuery", 300)),
        "windowDays": int(settings.get("windowDays", 7)),
        "overlapDays": int(settings.get("overlapDays", 1)),
    }


def derive_collection_window(
    config: Mapping[str, Any],
    *,
    collection_date: date,
    latest_successful_boundary: date | None = None,
) -> dict[str, Any]:
    """Return the inclusive blog search window for this collection run."""

    settings = _search_settings(config)
    window_days = settings["windowDays"]
    overlap_days = settings["overlapDays"]
    if window_days <= 0:
        raise ValueError("search.windowDays must be positive")
    if overlap_days < 0:
        raise ValueError("search.overlapDays must be non-negative")
    if latest_successful_boundary is None:
        start = collection_date - timedelta(days=window_days - 1)
        mode = "bootstrap"
    else:
        start = latest_successful_boundary - timedelta(days=overlap_days)
        mode = "incremental"
    if start > collection_date:
        raise ValueError("blog search window start cannot be after collection date")
    return {
        "start": start,
        "end": collection_date,
        "mode": mode,
        "windowDays": window_days,
        "overlapDays": overlap_days,
        "latestSuccessfulBoundary": (
            latest_successful_boundary.isoformat()
            if latest_successful_boundary is not None
            else None
        ),
    }


def get_last_successful_blog_trend_boundary(connection: Any) -> date | None:
    """Read the latest successful run boundary without reading credentials."""

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT run_week
            FROM blog_trend_run
            WHERE status = %s
            ORDER BY run_week DESC
            LIMIT 1
            """,
            ("SUCCESS",),
        )
        row = cursor.fetchone()
    if not row:
        return None
    value = row[0] if isinstance(row, Sequence) and not isinstance(row, (str, bytes)) else row
    return _post_date(value)


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("blog trend config must be a JSON object")
    return payload


def _canonical_aliases(config: Mapping[str, Any]) -> dict[str, list[str]]:
    raw_aliases = config.get("canonicalAliases", config.get("regionAliases", {}))
    if not isinstance(raw_aliases, Mapping):
        raw_aliases = {}
    configured_regions = [_text(value) for value in config.get("regions", []) if _text(value)]
    aliases: dict[str, list[str]] = {}
    for region in configured_regions:
        values = raw_aliases.get(region, [region])
        if isinstance(values, str):
            values = [values]
        normalized = _unique_text(values if isinstance(values, Sequence) else [region])
        aliases[region] = _unique_text([region, *normalized]) or [region]
    return aliases


def _intent_entries(config: Mapping[str, Any]) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    query_config = config.get("queryGeneration", {})
    raw_intents = query_config.get("intents", []) if isinstance(query_config, Mapping) else []
    if not isinstance(raw_intents, Sequence) or isinstance(raw_intents, (str, bytes)):
        return entries
    for raw_intent in raw_intents:
        if isinstance(raw_intent, Mapping):
            category = _text(raw_intent.get("category")) or "FOOD"
            phrase = _text(raw_intent.get("phrase"))
        else:
            category = "FOOD"
            phrase = _text(raw_intent)
        if phrase:
            entries.append((category, phrase))
    return entries


def generate_queries(
    config: Mapping[str, Any],
    collection_date: date,
    *,
    regions: Sequence[str] | None = None,
) -> list[dict[str, Any]]:
    """Build one fixed cafe and food query for each canonical region group."""

    configured_regions = [_text(value) for value in config.get("regions", []) if _text(value)]
    aliases_by_region = _canonical_aliases(config)
    region_lookup = {
        alias.casefold(): region
        for region, aliases in aliases_by_region.items()
        for alias in aliases
    }
    requested_regions = [_text(value) for value in (regions or configured_regions) if _text(value)]
    selected_regions: list[str] = []
    for requested in requested_regions:
        canonical = region_lookup.get(requested.casefold(), requested)
        if canonical and canonical not in selected_regions:
            selected_regions.append(canonical)
    entries = _intent_entries(config)
    if not selected_regions or not entries:
        return []
    output: list[dict[str, str]] = []
    for region in selected_regions:
        region_aliases = aliases_by_region.get(region, [region])
        for category, intent in entries:
            output.append(
                {
                    "query": f"{region} {intent}",
                    "region": region,
                    "intent": intent,
                    "intentCategory": category,
                    "regionAliases": region_aliases,
                }
            )
    return output


def _author(item: Mapping[str, Any]) -> str:
    return _text(item.get("bloggerlink")) or _text(item.get("bloggername")) or "unknown"


def _ad_evidence(item: Mapping[str, Any], config: Mapping[str, Any]) -> tuple[bool, list[str]]:
    haystack = f"{_text(item.get('title'))} {_text(item.get('description'))}".casefold()
    signals = [
        _text(term)
        for term in config.get("metadata", {}).get("advertisementSignals", [])
        if _text(term) and _text(term).casefold() in haystack
    ]
    return bool(signals), signals


def normalize_search_item(
    item: Mapping[str, Any],
    query_spec: Mapping[str, Any],
    *,
    search_rank: int,
    collection_date: date,
    collected_at: str,
    config: Mapping[str, Any],
) -> dict[str, Any] | None:
    post_url = _normalize_post_identity(item.get("link"))
    if post_url is None:
        return None
    ad_suspected, ad_signals = _ad_evidence(item, config)
    region_aliases = query_spec.get("regionAliases", [query_spec.get("region")])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "query": _text(query_spec.get("query")),
        "region": _text(query_spec.get("region")),
        "intent": _text(query_spec.get("intent")),
        "intentCategory": _text(query_spec.get("intentCategory")),
        "regionAliases": _unique_text(
            region_aliases if isinstance(region_aliases, Sequence) and not isinstance(region_aliases, (str, bytes)) else []
        ),
        "postUrl": post_url,
        "title": _text(item.get("title")),
        "description": _text(item.get("description")),
        "author": _author(item),
        "authorName": _text(item.get("bloggername")),
        "publishedAt": _text(item.get("postdate")),
        "searchRank": int(search_rank),
        "collectedAt": collected_at,
        "collectionDate": collection_date.isoformat(),
        "isAdSuspected": ad_suspected,
        "adSignals": ad_signals,
    }


def group_posts(observations: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate posts without collapsing their independent query observations."""

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for raw in observations:
        post_url = _normalize_post_identity(raw.get("postUrl", raw.get("link")))
        if post_url:
            observation = dict(raw)
            observation["postUrl"] = post_url
            grouped[post_url].append(observation)
    output: list[dict[str, Any]] = []
    for post_url in sorted(grouped):
        rows = sorted(
            grouped[post_url],
            key=lambda row: (int(row.get("searchRank", 10**9)), _text(row.get("query"))),
        )
        representative = rows[0]
        output.append(
            {
                "postUrl": post_url,
                "title": _text(representative.get("title")),
                "description": _text(representative.get("description")),
                "author": _text(representative.get("author")) or "unknown",
                "authorName": _text(representative.get("authorName")),
                "publishedAt": _text(representative.get("publishedAt")),
                "queries": sorted({_text(row.get("query")) for row in rows if _text(row.get("query"))}),
                "regions": sorted({_text(row.get("region")) for row in rows if _text(row.get("region"))}),
                "regionAliases": sorted(
                    {
                        _text(alias)
                        for row in rows
                        for alias in row.get("regionAliases", [])
                        if _text(alias)
                    }
                ),
                "intents": sorted({_text(row.get("intent")) for row in rows if _text(row.get("intent"))}),
                "intentCategories": sorted(
                    {_text(row.get("intentCategory")) for row in rows if _text(row.get("intentCategory"))}
                ),
                "bestSearchRank": min(int(row.get("searchRank", 10**9)) for row in rows),
                "isAdSuspected": any(bool(row.get("isAdSuspected")) for row in rows),
                "adSignals": sorted({signal for row in rows for signal in row.get("adSignals", [])}),
                "observations": rows,
            }
        )
    return output


def filter_observations_to_query_plan(
    observations: Sequence[Mapping[str, Any]],
    query_specs: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Keep only evidence produced by the active fixed query plan."""

    active_queries = {
        _text(spec.get("query"))
        for spec in query_specs
        if isinstance(spec, Mapping) and _text(spec.get("query"))
    }
    return [
        dict(row)
        for row in observations
        if isinstance(row, Mapping) and _text(row.get("query")) in active_queries
    ]


def filter_observations_to_window(
    observations: Sequence[Mapping[str, Any]],
    query_specs: Sequence[Mapping[str, Any]],
    *,
    window_start: date,
    window_end: date,
) -> list[dict[str, Any]]:
    """Keep only active-plan evidence collected inside the inclusive window."""

    rows = filter_observations_to_query_plan(observations, query_specs)
    output: list[dict[str, Any]] = []
    for row in rows:
        collected_date = _post_date(row.get("collectionDate"))
        if collected_date is not None and window_start <= collected_date <= window_end:
            output.append(row)
    return output


def _selection_score(post: Mapping[str, Any]) -> int:
    score = max(0, 30 - int(post.get("bestSearchRank", 30)))
    score += 12 * max(0, len(post.get("queries", [])) - 1)
    score += 4 * len(post.get("intentCategories", []))
    if post.get("isAdSuspected"):
        score -= 12
    return score


def _scaled_quotas(quotas: Mapping[str, Any], limit: int) -> dict[str, int]:
    normalized = {str(key): max(0, int(value)) for key, value in quotas.items()}
    total = sum(normalized.values())
    if total <= 0 or limit >= total:
        return normalized
    exact = {key: value * limit / total for key, value in normalized.items()}
    scaled = {key: int(value) for key, value in exact.items()}
    remainder = limit - sum(scaled.values())
    order = sorted(normalized, key=lambda key: (-(exact[key] - scaled[key]), key))
    for key in order[:remainder]:
        scaled[key] += 1
    return scaled


def select_body_targets(
    grouped_posts: Sequence[Mapping[str, Any]],
    config: Mapping[str, Any],
    *,
    body_limit: int | None = None,
    seed: str | int | None = None,
) -> list[dict[str, Any]]:
    selection = config.get("selection", {})
    raw_quotas = dict(selection.get("quotas", {})) or dict(LEGACY_SELECTION_QUOTAS)
    limit = int(body_limit if body_limit is not None else sum(int(value) for value in raw_quotas.values()))
    quotas = _scaled_quotas(raw_quotas, limit)
    # A non-positive cap means unlimited.  Body selection must not discard
    # repeated URLs from one author because uniquePosts is the evidence unit.
    author_cap = max(0, int(selection.get("authorCap", 0) or 0))
    region_minimum = max(0, int(selection.get("regionMinimum", 0)))
    randomizer = random.Random(str(seed if seed is not None else selection.get("seed", "0")))
    posts = [dict(post) for post in grouped_posts if _text(post.get("postUrl"))]

    if _text(selection.get("strategy")) == "query_balanced":
        configured_queries = [
            f"{_text(region)} {_text(intent.get('phrase'))}"
            for region in config.get("regions", [])
            for intent in config.get("queryGeneration", {}).get("intents", [])
            if _text(region) and isinstance(intent, Mapping) and _text(intent.get("phrase"))
        ]
        observed_queries = {
            _text(query)
            for post in posts
            for query in post.get("queries", [])
            if _text(query)
        }
        query_order = [query for query in configured_queries if query in observed_queries]
        query_order.extend(sorted(observed_queries - set(query_order)))
        if not query_order or limit <= 0:
            return []

        base, remainder = divmod(limit, len(query_order))
        targets = {
            query: base + (1 if index < remainder else 0)
            for index, query in enumerate(query_order)
        }
        by_query: dict[str, list[dict[str, Any]]] = {}
        for query in query_order:
            candidates = [post for post in posts if query in post.get("queries", [])]
            candidates.sort(
                key=lambda post: (
                    min(
                        (
                            int(row.get("searchRank", 10**9))
                            for row in post.get("observations", [])
                            if _text(row.get("query")) == query
                        ),
                        default=10**9,
                    ),
                    bool(post.get("isAdSuspected")),
                    _text(post.get("postUrl")),
                )
            )
            by_query[query] = candidates

        selected: list[dict[str, Any]] = []
        selected_urls: set[str] = set()
        author_counts: Counter[str] = Counter()
        cursors: Counter[str] = Counter()

        def take_next(query: str) -> bool:
            candidates = by_query[query]
            while cursors[query] < len(candidates):
                post = dict(candidates[cursors[query]])
                cursors[query] += 1
                url = _text(post.get("postUrl"))
                author = _text(post.get("author")) or "unknown"
                if url in selected_urls or (author_cap > 0 and author_counts[author] >= author_cap):
                    continue
                post["selectionBucket"] = "query_balanced"
                post["selectionScore"] = _selection_score(post)
                post["sampleQueries"] = [query]
                selected.append(post)
                selected_urls.add(url)
                author_counts[author] += 1
                return True
            return False

        for query in query_order:
            for _ in range(targets[query]):
                if not take_next(query):
                    break

        # Redistribute a sparse query's unused quota without changing the one-query
        # assignment that defines each selected post's denominator.
        while len(selected) < limit:
            progressed = False
            for query in query_order:
                if len(selected) >= limit:
                    break
                progressed = take_next(query) or progressed
            if not progressed:
                break
        return selected

    selected: list[dict[str, Any]] = []
    selected_urls: set[str] = set()
    author_counts: Counter[str] = Counter()

    def take(bucket: str, ordered: Iterable[Mapping[str, Any]], count: int) -> int:
        taken = 0
        for raw in ordered:
            if len(selected) >= limit or taken >= count:
                break
            post = dict(raw)
            url = _text(post.get("postUrl"))
            author = _text(post.get("author")) or "unknown"
            if url in selected_urls or (author_cap > 0 and author_counts[author] >= author_cap):
                continue
            post["selectionBucket"] = bucket
            post["selectionScore"] = _selection_score(post)
            selected.append(post)
            selected_urls.add(url)
            author_counts[author] += 1
            taken += 1
        return taken

    relevance = sorted(posts, key=lambda post: (-_selection_score(post), _text(post.get("postUrl"))))
    observed_regions = {
        _text(region)
        for post in posts
        for region in post.get("regions", [])
        if _text(region)
    }
    configured_regions = [_text(region) for region in config.get("regions", []) if _text(region)]
    region_order = [region for region in configured_regions if region in observed_regions]
    region_order.extend(sorted(observed_regions - set(region_order)))
    relevance_quota = int(quotas.get("relevance", 0))
    coverage_taken = 0
    for coverage_round in range(region_minimum):
        for region in region_order:
            if coverage_taken >= relevance_quota or len(selected) >= limit:
                break
            target_count = coverage_round + 1
            current_count = sum(region in post.get("regions", []) for post in selected)
            if current_count >= target_count:
                continue
            candidates = (post for post in relevance if region in post.get("regions", []))
            coverage_taken += take("region_coverage", candidates, 1)

    cross_query = sorted(
        (post for post in posts if len(post.get("queries", [])) >= 2),
        key=lambda post: (-len(post.get("queries", [])), -_selection_score(post), _text(post.get("postUrl"))),
    )
    take("cross_query", cross_query, int(quotas.get("cross_query", 0)))

    diversity = sorted(
        posts,
        key=lambda post: (
            author_counts[_text(post.get("author")) or "unknown"],
            -len(post.get("intentCategories", [])),
            -_selection_score(post),
            _text(post.get("postUrl")),
        ),
    )
    take("diversity", diversity, int(quotas.get("diversity", 0)))

    exploration = [post for post in posts if not post.get("isAdSuspected")]
    exploration.sort(key=lambda post: _text(post.get("postUrl")))
    randomizer.shuffle(exploration)
    take("exploration", exploration, int(quotas.get("exploration", 0)))

    take("relevance", relevance, max(0, relevance_quota - coverage_taken))
    take("backfill", relevance, limit)
    return selected


def select_all_body_targets(grouped_posts: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Mark every unique in-window post for body extraction.

    This is the live collector's only body-target selector. The older
    ``select_body_targets`` helper remains available for artifact compatibility
    tests and offline analyses, but is not part of the live path.
    """

    selected: list[dict[str, Any]] = []
    for raw in grouped_posts:
        post_url = _normalize_post_identity(raw.get("postUrl"))
        if post_url is None:
            continue
        post = dict(raw)
        post["postUrl"] = post_url
        post["selectionBucket"] = "all_in_window"
        post["selectionScore"] = _selection_score(post)
        post["sampleQueries"] = list(post.get("queries", []))
        selected.append(post)
    return selected


class ObservationStore:
    """Append-only JSONL store keyed by collection day, query, and post URL."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    @staticmethod
    def identity(record: Mapping[str, Any]) -> tuple[str, str, str] | None:
        collection_date = _text(record.get("collectionDate"))
        query = _text(record.get("query"))
        post_url = _normalize_post_identity(record.get("postUrl", record.get("link")))
        if not collection_date or not query or post_url is None:
            return None
        return collection_date, query, post_url

    def read(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        rows: list[dict[str, Any]] = []
        with self.path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(value, dict):
                    rows.append(value)
        return rows

    def append(self, records: Iterable[Mapping[str, Any]]) -> dict[str, int]:
        existing = {identity for row in self.read() if (identity := self.identity(row)) is not None}
        batch: set[tuple[str, str, str]] = set()
        output: list[dict[str, Any]] = []
        skipped = 0
        invalid = 0
        for raw in records:
            row = dict(raw)
            identity = self.identity(row)
            if identity is None:
                invalid += 1
                continue
            if identity in existing or identity in batch:
                skipped += 1
                continue
            row["collectionDate"], row["query"], row["postUrl"] = identity
            row["schemaVersion"] = SCHEMA_VERSION
            batch.add(identity)
            output.append(row)
        if output:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                for row in output:
                    handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        return {"appended": len(output), "skippedExisting": skipped, "skippedInvalid": invalid}


def trend_signal(trend: Mapping[str, Any] | None, config: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(trend, Mapping):
        return {"available": False, "rising": False, "reason": "trend_missing"}

    def numeric(keys: Sequence[str], default: float = 0.0) -> float:
        for key in keys:
            value = trend.get(key)
            if value in (None, ""):
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
        return default

    recent = numeric(
        (
            "recentSearchInterestAverage",
            "recent_interest_average",
            "current",
            "recent_ratio_average",
            "recentRatioAverage",
            "recentTrendValue",
            "recent_trend_value",
        )
    )
    baseline = numeric(
        (
            "previous14dSearchInterestAverage",
            "previous_interest_average",
            "baseline",
            "baseline_ratio_average",
            "baselineInterestAverage",
            "previousTrendValue",
            "previous_trend_value",
        )
    )
    recent_nonzero = int(
        trend.get("recent_nonzero_observations", trend.get("recentNonzeroObservations", 0)) or 0
    )
    baseline_nonzero = int(
        trend.get(
            "baseline_nonzero_observations",
            trend.get("baselineNonzeroObservations", 0),
        )
        or 0
    )
    ratio = numeric(("ratio", "trendRatio", "monthlyRatio", "shortRatio"), default=-1.0)
    if ratio < 0:
        ratio = None if baseline <= 0 else recent / baseline
    status = _text(trend.get("status")).upper()
    result = {
        **dict(trend),
        "available": trend.get("available") is not False,
        "status": status or None,
        "rising": False,
        "ratio": ratio,
        "trendRatio": ratio,
        "recentSearchInterestAverage": recent,
        "previous14dSearchInterestAverage": baseline,
        "recentTrendValue": recent,
        "previousTrendValue": baseline,
        "recentNonzeroObservations": recent_nonzero,
        "baselineNonzeroObservations": baseline_nonzero,
    }
    if status:
        return {
            **result,
            "rising": status in {"SURGING", "NEWLY_EMERGING"},
            "reason": _text(trend.get("reason")) or status.casefold(),
        }

    # Keep old saved daily summaries readable, but the live path above uses
    # the monthly status and values from re_evaluate_search_trend.py.
    trend_config = config.get("trend", {})
    if baseline <= 0:
        return {
            **result,
            "reason": "baseline_missing",
        }
    minimum_baseline = int(trend_config.get("minimumBaselineNonzeroObservations", 7))
    if baseline_nonzero < minimum_baseline:
        return {**result, "reason": "insufficient_baseline_coverage"}
    minimum_recent = int(trend_config.get("minimumRecentNonzeroObservations", 3))
    if recent_nonzero < minimum_recent:
        return {**result, "reason": "insufficient_recent_coverage"}
    minimum = float(trend_config.get("minimumRatio", 1.5))
    return {
        **result,
        "rising": bool(ratio is not None and ratio >= minimum),
        "reason": "ratio_checked",
    }


def classify_place(evidence: Mapping[str, Any], config: Mapping[str, Any]) -> dict[str, Any]:
    classification = config.get("classification", {})
    minimum = classification.get("minimumEvidence", {})
    minimum_passed = all(
        int(evidence.get(name, 0) or 0) >= int(threshold)
        for name, threshold in minimum.items()
    )
    trend_rising = bool(evidence.get("trend", {}).get("rising"))
    values = {**dict(evidence), "trendRising": trend_rising}
    watch_thresholds = classification.get("watch", {}).get("signals", {})
    watch_signals = {
        name: (
            bool(values.get(name)) is bool(threshold)
            if isinstance(threshold, bool)
            else int(values.get(name, 0) or 0) >= int(threshold)
        )
        for name, threshold in watch_thresholds.items()
    }
    watch_k = int(classification.get("watch", {}).get("k", 2))
    trending_thresholds = classification.get("trending", {}).get("signals", {})
    trending_signals = {
        name: (
            bool(values.get(name)) is bool(threshold)
            if isinstance(threshold, bool)
            else int(values.get(name, 0) or 0) >= int(threshold)
        )
        for name, threshold in trending_thresholds.items()
    }
    ad_limit = float(classification.get("trending", {}).get("maxAdSuspectedRatio", 1.0))
    if minimum_passed and all(trending_signals.values()) and float(evidence.get("adSuspectedRatio", 0)) <= ad_limit:
        status = "TRENDING"
    elif minimum_passed and sum(watch_signals.values()) >= watch_k:
        status = "WATCH"
    else:
        status = "INSUFFICIENT_EVIDENCE"
    return {
        "status": status,
        "minimumEvidencePassed": minimum_passed,
        "watchSignals": watch_signals,
        "watchSignalCount": sum(watch_signals.values()),
        "trendingSignals": trending_signals,
        "adRatioPassed": float(evidence.get("adSuspectedRatio", 0)) <= ad_limit,
    }


def _final_search_trend_status(evidence: Mapping[str, Any]) -> str:
    trend = evidence.get("trend")
    if not isinstance(trend, Mapping):
        trend = {}
    return _search_trend_status(trend) or "INSUFFICIENT_EVIDENCE"


def aggregate_place_evidence(
    records: Sequence[Mapping[str, Any]],
    *,
    as_of: date,
    config: Mapping[str, Any],
    trends: Mapping[str, Mapping[str, Any]] | None = None,
    query_sample_sizes: Mapping[str, int] | None = None,
) -> list[dict[str, Any]]:
    """Aggregate traceable place observations; one URL remains one unique post."""

    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for record in records:
        place_id = _text(record.get("canonicalPlaceId"))
        if place_id:
            grouped[place_id].append(record)
    recent_days = int(config.get("evidence", {}).get("recentDays", 7))
    recent_start = as_of - timedelta(days=max(0, recent_days - 1))
    output: list[dict[str, Any]] = []
    for place_id, rows in sorted(grouped.items()):
        post_urls = {_normalize_post_identity(row.get("postUrl")) for row in rows}
        post_urls.discard(None)
        authors = {_text(row.get("author")) for row in rows if _text(row.get("author"))}
        queries = {_text(row.get("query")) for row in rows if _text(row.get("query"))}
        intent_categories = {
            _text(row.get("intentCategory"))
            for row in rows
            if _text(row.get("intentCategory"))
        }
        days = {_text(row.get("collectionDate")) for row in rows if _text(row.get("collectionDate"))}
        published_by_url: dict[str, date] = {}
        for row in rows:
            url = _normalize_post_identity(row.get("postUrl"))
            raw_date = _text(row.get("publishedAt"))
            try:
                parsed = datetime.strptime(raw_date[:8], "%Y%m%d").date()
            except ValueError:
                continue
            if url:
                published_by_url[url] = parsed
        recent_posts = sum(1 for value in published_by_url.values() if recent_start <= value <= as_of)
        ranks = [int(row["searchRank"]) for row in rows if str(row.get("searchRank", "")).isdigit()]
        ad_urls = {
            _normalize_post_identity(row.get("postUrl"))
            for row in rows
            if row.get("isAdSuspected") and _normalize_post_identity(row.get("postUrl"))
        }
        trend = trend_signal((trends or {}).get(place_id), config)
        post_urls_by_intent: dict[str, set[str]] = {"카페": set(), "맛집": set()}
        for row in rows:
            post_url = _normalize_post_identity(row.get("postUrl"))
            intent = trend_intent_phrase(row)
            if post_url and intent:
                post_urls_by_intent[intent].add(post_url)
        unique_post_counts_by_intent = {
            intent: len(post_urls)
            for intent, post_urls in post_urls_by_intent.items()
        }
        canonical_name = next(
            (_text(row.get("canonicalPlaceName")) for row in rows if _text(row.get("canonicalPlaceName"))),
            "",
        )
        aliases = _unique_text(row.get("observedPlaceName") for row in rows)
        aliases = [alias for alias in aliases if alias.casefold() != canonical_name.casefold()]
        region_aliases = _unique_text(
            alias
            for row in rows
            for alias in row.get("regionAliases", [])
            if _text(alias)
        )
        sampled_mentions: dict[str, set[str]] = defaultdict(set)
        sampled_authors: set[str] = set()
        for row in rows:
            if not row.get("sampledForQuery"):
                continue
            query = _text(row.get("query"))
            url = _normalize_post_identity(row.get("postUrl"))
            if query and url:
                sampled_mentions[query].add(url)
                author = _text(row.get("author"))
                if author:
                    sampled_authors.add(author)
        query_rates = []
        for query in sorted(sampled_mentions):
            denominator = int((query_sample_sizes or {}).get(query, 0) or 0)
            if denominator <= 0:
                continue
            mentions = len(sampled_mentions[query])
            query_rates.append(
                {
                    "query": query,
                    "sampledPosts": denominator,
                    "mentionPosts": mentions,
                    "mentionRate": round(mentions / denominator, 6),
                }
            )
        relative_rate = (
            round(sum(row["mentionRate"] for row in query_rates) / len(query_rates), 6)
            if query_rates
            else 0.0
        )
        evidence = {
            "schemaVersion": SCHEMA_VERSION,
            "canonicalPlaceId": place_id,
            "canonicalPlaceName": canonical_name,
            "aliases": aliases,
            "regionAliases": region_aliases,
            "uniquePosts": len(post_urls),
            "uniqueAuthors": len(authors),
            "uniqueQueries": len(queries),
            "uniqueIntentCategories": len(intent_categories),
            "uniquePostCountsByIntent": unique_post_counts_by_intent,
            "collectionDays": len(days),
            "recentObservedPosts": recent_posts,
            "averageObservedRank": round(sum(ranks) / len(ranks), 2) if ranks else None,
            "firstObservedAt": min((_text(row.get("collectedAt")) for row in rows if _text(row.get("collectedAt"))), default=None),
            "latestObservedAt": max((_text(row.get("collectedAt")) for row in rows if _text(row.get("collectedAt"))), default=None),
            "adSuspectedRatio": round(len(ad_urls) / len(post_urls), 4) if post_urls else 0.0,
            "relativeMentionRate": relative_rate,
            "sampledMentionPosts": len(
                {
                    url
                    for urls in sampled_mentions.values()
                    for url in urls
                }
            ),
            "sampledAuthorCount": len(sampled_authors),
            "sampledQueryCount": len(query_rates),
            "queryMentionRates": query_rates,
            "trend": {**trend, "trendCheckedAt": _utc_now()} if trend.get("available") else trend,
            "evidence": [dict(row) for row in rows],
        }
        evidence["categoryCode"] = classify_trend_place_category(evidence)
        evidence["classification"] = classify_place(evidence, config)
        output.append(evidence)
    return output


def _selected_for_extraction(posts: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for post in posts:
        observations = list(post.get("observations", []))
        primary = observations[0] if observations else {}
        output.append(
            {
                "query": _text(primary.get("query")),
                "link": post.get("postUrl"),
                "bloggerlink": post.get("author"),
                "bloggername": post.get("authorName"),
                "title": post.get("title"),
                "description": post.get("description"),
                "postdate": post.get("publishedAt"),
                "selection_bucket": post.get("selectionBucket"),
                "selection_score": post.get("selectionScore"),
                "sample_queries": list(post.get("sampleQueries", [])),
                "selection_reasons": ["repeated-observation-selection"],
                "regions": list(post.get("regions", [])),
                "regionAliases": list(post.get("regionAliases", [])),
                "search_observations": observations,
            }
        )
    return output


def _map_coordinates(value: Any) -> tuple[float | None, float | None]:
    if isinstance(value, Mapping):
        latitude = value.get("lat", value.get("latitude", value.get("y")))
        longitude = value.get("lng", value.get("longitude", value.get("x")))
    else:
        parts = re.split(r"\s*,\s*|\s+", _text(value))
        if len(parts) < 2:
            return None, None
        latitude, longitude = parts[0], parts[1]
    try:
        return float(latitude), float(longitude)
    except (TypeError, ValueError):
        return None, None


def _naver_map_place_id(place: Mapping[str, Any]) -> str:
    place_id = _text(place.get("placeId"))
    if place_id:
        return f"NAVER_MAP:{place_id}"
    fingerprint = "|".join(
        (_text(place.get("name")).casefold(), _text(place.get("address")).casefold())
    )
    return f"NAVER_MAP:FALLBACK:{hashlib.sha256(fingerprint.encode()).hexdigest()[:24]}"


def _place_evidence_rows(extracted: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for post in extracted:
        representative = post.get("representative_place")
        if not isinstance(representative, Mapping):
            continue
        address = _text(representative.get("address"))
        if extract_district(address) != "종로구":
            continue
        latitude, longitude = _map_coordinates(representative.get("latlng"))
        sample_queries = {
            _text(query) for query in post.get("sample_queries", []) if _text(query)
        }
        for observation in post.get("search_observations", []):
            row = dict(observation)
            row["sampledForQuery"] = _text(observation.get("query")) in sample_queries
            row["canonicalPlaceId"] = _naver_map_place_id(representative)
            row["canonicalPlaceName"] = _text(representative.get("name"))
            row["canonicalSource"] = "NAVER_MAP"
            row["canonicalRoadAddress"] = address
            row["canonicalLongitude"] = longitude
            row["canonicalLatitude"] = latitude
            row["canonicalPhone"] = _text(representative.get("tel")) or None
            row["observedPlaceName"] = _text(
                representative.get("name", representative.get("place_name"))
            )
            rows.append(row)
    return rows


def build_place_trend_groups(
    evidence: Sequence[Mapping[str, Any]], config: Mapping[str, Any]
) -> list[TrendKeywordGroup]:
    minimum = config.get("classification", {}).get("minimumEvidence", {})
    candidates = [
        row
        for row in evidence
        if int(row.get("uniqueAuthors", 0)) >= int(minimum.get("uniqueAuthors", 2))
        or int(row.get("uniqueIntentCategories", 0)) >= 2
    ]
    groups: list[TrendKeywordGroup] = []
    for row in candidates:
        place_id = _text(row.get("canonicalPlaceId"))
        aliases = row.get("aliases", [])
        if isinstance(aliases, str):
            aliases = [aliases]
        keywords = _unique_text(
            [
                row.get("canonicalPlaceName"),
                *(aliases if isinstance(aliases, Sequence) else []),
            ]
        )[:MAX_KEYWORDS_PER_GROUP]
        if not place_id or not keywords:
            continue
        groups.append(
            TrendKeywordGroup(
                f"place:{place_id}",
                tuple(keywords),
                "place",
                place_id,
            )
        )
    return groups


def _fetch_trends(
    evidence: Sequence[Mapping[str, Any]],
    config: Mapping[str, Any],
    as_of: date,
    *,
    client: Any = None,
) -> dict[str, Mapping[str, Any]]:
    # Import lazily: the reevaluation command imports this collector only from
    # compatibility helpers, so keeping the dependency local avoids an import
    # cycle while sharing the one monthly window/summarizer implementation.
    from re_evaluate_search_trend import fetch_all_trends

    groups = build_place_trend_groups(evidence, config)
    if not groups:
        return {}
    trend_config = config.get("trend", {})
    configured_time_unit = _text(trend_config.get("timeUnit")) or "month"
    configured_baseline_months = int(trend_config.get("baselineMonths", 3))
    if configured_time_unit != "month":
        raise ValueError("trend.timeUnit must be month")
    if configured_baseline_months != 3:
        raise ValueError("trend.baselineMonths must be 3")
    candidate_ids = {
        _text(group.kakao_place_id)
        for group in groups
        if _text(group.kakao_place_id)
    }
    candidate_evidence = [
        row
        for row in evidence
        if _text(row.get("canonicalPlaceId")) in candidate_ids
    ]
    return dict(fetch_all_trends(candidate_evidence, as_of=as_of, client=client))


def _fetch_query_pages_with_stats(
    client_id: str,
    client_secret: str,
    query: str,
    results_per_query: int | None = None,
    *,
    page_size: int = 100,
    max_results_per_query: int | None = None,
    window_start: date | None = None,
    window_end: date | None = None,
    search_page: Callable[[str, str, str, int, int], Mapping[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Fetch latest Naver Blog pages, filtering and stopping at the window boundary."""

    target_value = (
        max_results_per_query
        if max_results_per_query is not None
        else results_per_query
        if results_per_query is not None
        else 300
    )
    target = int(target_value)
    display_limit = int(page_size)
    if target < 0:
        raise ValueError("max_results_per_query must be non-negative")
    if display_limit <= 0 or display_limit > 100:
        raise ValueError("Naver Blog display must be between 1 and 100")
    if (window_start is None) != (window_end is None):
        raise ValueError("window_start and window_end must be provided together")
    if window_start is not None and window_start > window_end:
        raise ValueError("window_start cannot be after window_end")
    if target == 0:
        return [], 0

    fetch_page = search_page or search_blog_page
    items: list[dict[str, Any]] = []
    page_count = 0
    for start in range(1, target + 1, display_limit):
        display = min(display_limit, target - start + 1)
        payload = fetch_page(client_id, client_secret, query, start, display)
        page_count += 1
        page_items = payload.get("items", [])
        if not isinstance(page_items, list):
            raise ValueError("Naver Blog response items must be a list")
        page_items = page_items[:display]
        reached_window_boundary = False
        for item in page_items:
            if not isinstance(item, Mapping):
                continue
            if window_start is None:
                items.append(dict(item))
                continue
            post_date = _post_date(item.get("postdate"))
            if post_date is not None and post_date < window_start:
                reached_window_boundary = True
            if post_date is not None and window_start <= post_date <= window_end:
                items.append(dict(item))
        if reached_window_boundary:
            break
        if len(page_items) < display:
            break
    return items[:target], page_count


def fetch_query_pages(
    client_id: str,
    client_secret: str,
    query: str,
    results_per_query: int | None = None,
    *,
    page_size: int = 100,
    max_results_per_query: int | None = None,
    window_start: date | None = None,
    window_end: date | None = None,
    search_page: Callable[[str, str, str, int, int], Mapping[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Fetch one query's in-window metadata; kept public for pagination tests."""

    items, _page_count = _fetch_query_pages_with_stats(
        client_id,
        client_secret,
        query,
        results_per_query,
        page_size=page_size,
        max_results_per_query=max_results_per_query,
        window_start=window_start,
        window_end=window_end,
        search_page=search_page,
    )
    return items


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def persist_result_to_database(
    result: Mapping[str, Any],
    *,
    connection_factory: Callable[[], Any] = get_connection,
    loader: Callable[[Any, Mapping[str, Any]], Any] = persist_blog_trend_run,
) -> dict[str, int]:
    """Persist one completed run atomically and return non-sensitive load counts."""

    try:
        with connection_factory() as connection:
            try:
                stats = loader(connection, result)
            except Exception:
                # The loader records FAILED before re-raising. Commit that
                # operational state so a retry can be diagnosed and reused.
                connection.commit()
                raise
            connection.commit()
    except Exception as exc:  # noqa: BLE001 - normalize DB/driver failures at the CLI boundary
        raise RuntimeError("blog trend database persistence failed") from exc
    return stats.as_dict()


def run_live(
    config: Mapping[str, Any],
    *,
    collection_date: date,
    regions: Sequence[str] | None,
    results_per_query: int | None = None,
    body_limit: int | None = None,
    output_dir: Path,
    persist_db: bool = True,
    max_results_per_query: int | None = None,
    latest_successful_boundary: date | None = None,
    connection_factory: Callable[[], Any] | None = None,
    trend_client: Any = None,
) -> dict[str, Any]:
    load_dotenv(ROOT / ".env", override=True)
    search_settings = _search_settings(config)
    max_results = int(
        max_results_per_query
        if max_results_per_query is not None
        else results_per_query
        if results_per_query is not None
        else search_settings["maxResultsPerQuery"]
    )
    if max_results < 0:
        raise ValueError("search.maxResultsPerQuery must be non-negative")
    db_connection_factory = connection_factory or get_connection
    if latest_successful_boundary is None and persist_db:
        try:
            with db_connection_factory() as connection:
                latest_successful_boundary = get_last_successful_blog_trend_boundary(connection)
        except Exception as exc:  # noqa: BLE001 - hide connection details at the CLI boundary
            raise RuntimeError("blog trend last successful run lookup failed") from exc
    window = derive_collection_window(
        config,
        collection_date=collection_date,
        latest_successful_boundary=latest_successful_boundary,
    )
    client_id = _text(os.getenv("NAVER_API_HUB_CLIENT_ID"))
    client_secret = _text(os.getenv("NAVER_API_HUB_CLIENT_SECRET"))
    if not client_id or not client_secret:
        raise RuntimeError("NAVER_API_HUB_CLIENT_ID/SECRET is required")
    collected_at = _utc_now()
    query_specs = generate_queries(config, collection_date, regions=regions)
    page_size = search_settings["pageSize"]
    if page_size <= 0 or page_size > 100:
        raise ValueError("search.pageSize must be between 1 and 100")
    observations: list[dict[str, Any]] = []
    query_stats: list[dict[str, Any]] = []
    page_count = 0
    for spec in query_specs:
        items, pages = _fetch_query_pages_with_stats(
            client_id,
            client_secret,
            spec["query"],
            max_results,
            page_size=page_size,
            window_start=window["start"],
            window_end=window["end"],
        )
        page_count += pages
        query_stats.append(
            {
                "query": spec["query"],
                "region": spec["region"],
                "intent": spec["intent"],
                "pages": pages,
                "items": len(items),
                "inWindowItems": len(items),
            }
        )
        for rank, item in enumerate(items, start=1):
            if isinstance(item, Mapping):
                normalized = normalize_search_item(
                    item,
                    spec,
                    search_rank=rank,
                    collection_date=collection_date,
                    collected_at=collected_at,
                    config=config,
                )
                if normalized:
                    observations.append(normalized)
    output_dir.mkdir(parents=True, exist_ok=True)
    search_store = ObservationStore(output_dir / "search-observations.jsonl")
    place_store = ObservationStore(output_dir / "place-evidence.jsonl")
    search_append = search_store.append(observations)

    grouped = group_posts(observations)
    selected = select_all_body_targets(grouped)
    sampled_queries_by_url = {
        _text(post.get("postUrl")): {
            _text(query) for query in post.get("sampleQueries", []) if _text(query)
        }
        for post in selected
        if _text(post.get("postUrl")) and post.get("sampleQueries")
    }

    # A previously resolved post does not need another body request.
    # Its appearance under a new query/day is still retained as new evidence.
    active_place_rows = filter_observations_to_window(
        place_store.read(),
        query_specs,
        window_start=window["start"],
        window_end=window["end"],
    )
    known_by_url: dict[str, Mapping[str, Any]] = {}
    for row in active_place_rows:
        post_url = _normalize_post_identity(row.get("postUrl"))
        if post_url and _text(row.get("canonicalPlaceId")):
            known_by_url[post_url] = row
    reused_rows: list[dict[str, Any]] = []
    for observation in observations:
        known = known_by_url.get(_text(observation.get("postUrl")))
        if not known:
            continue
        reused = dict(observation)
        reused["sampledForQuery"] = _text(observation.get("query")) in sampled_queries_by_url.get(
            _text(observation.get("postUrl")), set()
        )
        for field in REUSED_PLACE_FIELDS:
            value = known.get(field)
            reused[field] = list(value) if isinstance(value, list) else value
        reused_rows.append(reused)
    reused_append = place_store.append(reused_rows)

    unresolved = [post for post in selected if _text(post.get("postUrl")) not in known_by_url]
    extracted, reason_counts, fetch_stats = extract_selected_posts(
        _selected_for_extraction(unresolved), fetch_bodies=True, fetcher=BlogBodyFetcher()
    )
    query_sample_sizes = Counter(
        _text(query)
        for post in selected
        for query in post.get("sampleQueries", [])
        if _text(query)
    )
    new_place_append = place_store.append(_place_evidence_rows(extracted))
    place_append = {
        key: reused_append[key] + new_place_append[key]
        for key in ("appended", "skippedExisting", "skippedInvalid")
    }
    active_place_rows = filter_observations_to_window(
        place_store.read(),
        query_specs,
        window_start=window["start"],
        window_end=window["end"],
    )
    historical_evidence = aggregate_place_evidence(
        active_place_rows,
        as_of=collection_date,
        config=config,
        query_sample_sizes=query_sample_sizes,
    )
    try:
        trends = _fetch_trends(
            historical_evidence,
            config,
            collection_date,
            client=trend_client,
        )
        search_trend_status = {"status": "available", "groups": len(trends)}
    except Exception as exc:  # noqa: BLE001 - trend is an optional corroborating signal
        trends = {}
        search_trend_status = {
            "status": "unavailable",
            "reason": type(exc).__name__,
        }
    evidence = aggregate_place_evidence(
        active_place_rows,
        as_of=collection_date,
        config=config,
        trends=trends,
        query_sample_sizes=query_sample_sizes,
    )
    relative_ranking = sorted(
        (
            {
                "canonicalPlaceId": row.get("canonicalPlaceId"),
                "canonicalPlaceName": row.get("canonicalPlaceName"),
                "relativeMentionRate": row.get("relativeMentionRate", 0),
                "sampledMentionPosts": row.get("sampledMentionPosts", 0),
                "sampledAuthorCount": row.get("sampledAuthorCount", 0),
                "sampledQueryCount": row.get("sampledQueryCount", 0),
                "uniquePosts": row.get("uniquePosts", 0),
                "uniqueAuthors": row.get("uniqueAuthors", 0),
                "queryMentionRates": row.get("queryMentionRates", []),
            }
            for row in evidence
            if int(row.get("sampledMentionPosts", 0) or 0) >= 2
            and int(row.get("sampledAuthorCount", 0) or 0) >= 2
        ),
        key=lambda row: (
            -float(row.get("relativeMentionRate", 0) or 0),
            -int(row.get("sampledQueryCount", 0) or 0),
            _text(row.get("canonicalPlaceName")),
        ),
    )
    counts = Counter(_final_search_trend_status(row) for row in evidence)
    stats = {
        "queryCount": len(query_specs),
        "pageCount": page_count,
        "maxResultsPerQuery": max_results,
        "pageSize": page_size,
        "windowStart": window["start"].isoformat(),
        "windowEnd": window["end"].isoformat(),
        "windowMode": window["mode"],
        "windowDays": window["windowDays"],
        "overlapDays": window["overlapDays"],
        "searchObservations": len(observations),
        "rawObservations": len(observations),
        "searchMetadata": len(observations),
        "uniquePosts": len(grouped),
        "selectedBodyTargets": len(selected),
        "bodyTargets": len(selected),
        "bodyRequests": int(fetch_stats.get("body_requests", 0)),
        "bodyFetchFailures": int(fetch_stats.get("body_failed", 0)),
        "querySampleSizes": dict(sorted(query_sample_sizes.items())),
        "relativeCandidatePlaces": len(relative_ranking),
        "bodyFetchSuccess": int(fetch_stats.get("fetched_posts", 0)),
        "mapFoundPosts": int(fetch_stats.get("map_found_posts", 0)),
        "rawPlaces": int(fetch_stats.get("extracted_place_count", 0)),
        "canonicalPlaces": len(evidence),
        "jongnoPlaceEvidence": len(evidence),
        "jongnoMapPlaces": len(evidence),
        **{
            status: counts.get(status, 0)
            for status in FINAL_SEARCH_TREND_STATUSES
        },
    }
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "collectionDate": collection_date.isoformat(),
        "runWeek": collection_date.isoformat(),
        "measuredAt": collected_at,
        "collectionWindow": {
            "start": window["start"].isoformat(),
            "end": window["end"].isoformat(),
            "mode": window["mode"],
            "latestSuccessfulBoundary": window["latestSuccessfulBoundary"],
        },
        "semantics": "unique Naver Blog posts published in the inclusive weekly collection window; not total Naver Blog volume",
        "stats": stats,
        "queryPlan": query_specs,
        "queryStats": query_stats,
        "searchTrend": search_trend_status,
        "append": {"search": search_append, "placeEvidence": place_append},
        "bodySelection": selected,
        "relativeRanking": relative_ranking,
        "evidence": evidence,
        "failureReasonCounts": dict(reason_counts),
    }
    if persist_db:
        result["database"] = {
            "status": "persisted",
            **persist_result_to_database(result, connection_factory=db_connection_factory),
        }
    else:
        result["database"] = {
            "status": "skipped",
            "reason": "skip_db_requested",
        }
    _write_json(output_dir / f"run_{collection_date.isoformat()}.json", result)
    return result


def _print_result(result: Mapping[str, Any]) -> None:
    stats = result.get("stats", {})
    print(
        "queries={queryCount} pages={pageCount} observations={searchObservations} deduped={uniquePosts} "
        "body_targets={selectedBodyTargets} body_success={bodyFetchSuccess} map_posts={mapFoundPosts} "
        "raw_places={rawPlaces} canonical={canonicalPlaces} jongno_map={jongnoMapPlaces} "
        "WATCH={WATCH} TRENDING={TRENDING} INSUFFICIENT={INSUFFICIENT_EVIDENCE}".format(**stats)
    )
    for row in result.get("evidence", []):
        status = _final_search_trend_status(row)
        if status not in {"WATCH", "TRENDING"}:
            continue
        trend = row.get("trend", {})
        print(
            f"[{status}] {row.get('canonicalPlaceName')} posts={row.get('uniquePosts')} "
            f"authors={row.get('uniqueAuthors')} queries={row.get('uniqueQueries')} "
            f"days={row.get('collectionDays')} trendRatio={trend.get('trendRatio')} "
            f"adRatio={row.get('adSuspectedRatio')}"
        )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Repeated-observation Naver Blog place discovery")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--date", type=date.fromisoformat, default=date.today())
    parser.add_argument("--regions", nargs="*", default=None)
    parser.add_argument(
        "--max-results-per-query",
        "--results-per-query",
        dest="max_results_per_query",
        type=int,
        default=None,
    )
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-db", action="store_true")
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config)
        search_settings = _search_settings(config)
        max_results = (
            args.max_results_per_query
            if args.max_results_per_query is not None
            else search_settings["maxResultsPerQuery"]
        )
        if max_results < 0:
            raise ValueError("max-results-per-query must be non-negative")
        queries = generate_queries(config, args.date, regions=args.regions)
        if args.dry_run:
            page_size = search_settings["pageSize"]
            if page_size <= 0 or page_size > 100:
                raise ValueError("search.pageSize must be between 1 and 100")
            page_count = sum(
                len(range(1, max_results + 1, page_size)) for _query in queries
            )
            result = {
                "schemaVersion": SCHEMA_VERSION,
                "status": "dry_run",
                "collectionDate": args.date.isoformat(),
                "queryPlan": queries,
                "maximumMetadata": len(queries) * max_results,
                "pageCount": page_count,
                "pageSize": page_size,
                "maxResultsPerQuery": max_results,
                "windowDays": search_settings["windowDays"],
                "overlapDays": search_settings["overlapDays"],
                "bodySelection": "all_unique_in_window",
                "writes": False,
                "network": False,
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        result = run_live(
            config,
            collection_date=args.date,
            regions=args.regions,
            max_results_per_query=max_results,
            output_dir=args.output_dir,
            persist_db=not args.skip_db,
        )
        _print_result(result)
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"repeated blog trend pipeline failed ({type(exc).__name__})", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
