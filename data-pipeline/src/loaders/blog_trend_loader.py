from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Callable, Mapping, Sequence

from src.cleaners.common import extract_district, is_valid_seoul_coordinate, normalize_place_name
from src.loaders.place_loader import LoadStats, load_place
from src.models.place_dto import PlaceDTO


NAVER_MAP_SOURCE = "NAVER_MAP"
SEARCH_TREND_SOURCE = "NAVER_API_HUB_SEARCH_TREND"
KAKAO_CATEGORY_CODES = {"CE7": "CAFE", "FD6": "RESTAURANT"}
INTENT_CATEGORY_CODES = {"카페": "CAFE", "맛집": "RESTAURANT"}
CANONICAL_METADATA_FIELDS = (
    "canonicalSource",
    "canonicalRoadAddress",
    "canonicalLongitude",
    "canonicalLatitude",
    "canonicalPhone",
)


SEARCH_TREND_COLUMNS_SQL = """
ALTER TABLE place_trend_snapshot
    ADD COLUMN IF NOT EXISTS relative_mention_rate double precision,
    ADD COLUMN IF NOT EXISTS sampled_mention_posts integer,
    ADD COLUMN IF NOT EXISTS sampled_author_count integer,
    ADD COLUMN IF NOT EXISTS sampled_query_count integer,
    ADD COLUMN IF NOT EXISTS query_mention_rates jsonb,
    ADD COLUMN IF NOT EXISTS trend_status varchar(30),
    ADD COLUMN IF NOT EXISTS short_ratio double precision,
    ADD COLUMN IF NOT EXISTS six_month_ratio double precision,
    ADD COLUMN IF NOT EXISTS recent_search_interest_average double precision,
    ADD COLUMN IF NOT EXISTS previous_14d_search_interest_average double precision,
    ADD COLUMN IF NOT EXISTS six_month_baseline_search_interest_average double precision,
    ADD COLUMN IF NOT EXISTS recent_valid_observation_days integer,
    ADD COLUMN IF NOT EXISTS previous_valid_observation_days integer,
    ADD COLUMN IF NOT EXISTS six_month_baseline_valid_observation_days integer,
    ADD COLUMN IF NOT EXISTS trend_source varchar(80),
    ADD COLUMN IF NOT EXISTS trend_recent_start date,
    ADD COLUMN IF NOT EXISTS trend_recent_end date,
    ADD COLUMN IF NOT EXISTS trend_previous_start date,
    ADD COLUMN IF NOT EXISTS trend_previous_end date,
    ADD COLUMN IF NOT EXISTS trend_baseline_start date,
    ADD COLUMN IF NOT EXISTS trend_baseline_end date,
    ADD COLUMN IF NOT EXISTS trend_time_unit varchar(10),
    ADD COLUMN IF NOT EXISTS trend_baseline_months integer,
    ADD COLUMN IF NOT EXISTS trend_comparison_label varchar(120),
    ADD COLUMN IF NOT EXISTS trend_current_month varchar(7),
    ADD COLUMN IF NOT EXISTS trend_current_month_ratio double precision,
    ADD COLUMN IF NOT EXISTS trend_current_value double precision,
    ADD COLUMN IF NOT EXISTS trend_baseline_value double precision,
    ADD COLUMN IF NOT EXISTS monthly_ratio double precision,
    ADD COLUMN IF NOT EXISTS trend_partial_month_adjusted boolean,
    ADD COLUMN IF NOT EXISTS trend_partial_month_days_used integer,
    ADD COLUMN IF NOT EXISTS trend_month_values jsonb,
    ADD COLUMN IF NOT EXISTS trend_missing_months text[]
"""


class BlogTrendPlaceResolutionError(RuntimeError):
    """A canonical blog-trend place cannot be safely linked to place."""


def ensure_search_trend_columns(connection: Any) -> None:
    """Apply the additive, repeatable migration required by API HUB snapshots."""

    with connection.cursor() as cursor:
        cursor.execute(SEARCH_TREND_COLUMNS_SQL)


@dataclass
class BlogTrendLoadStats:
    places_resolved: int = 0
    places_skipped: int = 0
    observations_upserted: int = 0
    snapshots_upserted: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "placesResolved": self.places_resolved,
            "placesSkipped": self.places_skipped,
            "observationsUpserted": self.observations_upserted,
            "snapshotsUpserted": self.snapshots_upserted,
        }


def _text(value: Any) -> str:
    return str(value or "").strip()


def _optional_text(value: Any) -> str | None:
    text = _text(value)
    return text or None


def _optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _date_value(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    raw = _text(value)
    for pattern in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(raw, pattern).date()
        except ValueError:
            continue
    return None


def _datetime_value(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    raw = _text(value)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _string_array(value: Any) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    output: list[str] = []
    for item in value:
        text = _text(item)
        if text and text not in output:
            output.append(text)
    return output


def _first_present(mapping: Mapping[str, Any], keys: Sequence[str]) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return value
    return None


def trend_intent_phrase(row: Mapping[str, Any]) -> str | None:
    """Return the fixed cafe/restaurant query intent for one observation."""

    for value in (
        row.get("query"),
        row.get("intent"),
        row.get("intentCategory"),
        row.get("intent_category"),
    ):
        text = _text(value)
        if not text:
            continue
        matches = [phrase for phrase in INTENT_CATEGORY_CODES if phrase in text]
        if len(matches) == 1:
            return matches[0]
        category = text.upper()
        if category == "CAFE":
            return "카페"
        if category == "RESTAURANT":
            return "맛집"
    return None


_KAKAO_MATCH_CONTAINER_KEYS = frozenset(
    {
        "matched_place",
        "matchedPlace",
        "matched_places",
        "matchedPlaces",
        "matched_kakao_place",
        "matchedKakaoPlace",
        "matched_kakao_places",
        "matchedKakaoPlaces",
        "local_validation",
        "localValidation",
        "kakao_validation",
        "kakaoValidation",
    }
)
_KAKAO_CATEGORY_CODE_KEYS = (
    "category_group_code",
    "categoryGroupCode",
    "kakaoCategoryGroupCode",
    "matchedCategoryGroupCode",
)
_KAKAO_CATEGORY_NAME_KEYS = (
    "category_name",
    "categoryName",
    "kakaoCategoryName",
    "matchedCategoryName",
)


def _matched_kakao_categories(
    value: Any,
    *,
    matched_context: bool = False,
) -> list[tuple[str, str | None]]:
    found: list[tuple[str, str | None]] = []
    if isinstance(value, Mapping):
        context = matched_context or any(
            key in value for key in ("matched_place_id", "matchedPlaceId")
        )
        if context:
            raw_code = _text(_first_present(value, _KAKAO_CATEGORY_CODE_KEYS)).upper()
            raw_name = _optional_text(_first_present(value, _KAKAO_CATEGORY_NAME_KEYS))
            category = KAKAO_CATEGORY_CODES.get(raw_code)
            if category is None and raw_name:
                if "카페" in raw_name:
                    category = "CAFE"
                elif "음식점" in raw_name:
                    category = "RESTAURANT"
            if category:
                found.append((category, raw_name))
        for key, child in value.items():
            found.extend(
                _matched_kakao_categories(
                    child,
                    matched_context=context or key in _KAKAO_MATCH_CONTAINER_KEYS,
                )
            )
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for child in value:
            found.extend(_matched_kakao_categories(child, matched_context=matched_context))
    return found


def _unique_post_intent_counts(evidence: Mapping[str, Any]) -> dict[str, int]:
    configured = evidence.get("uniquePostCountsByIntent")
    if isinstance(configured, Mapping):
        counts = {"카페": 0, "맛집": 0}
        for raw_intent, raw_count in configured.items():
            intent = trend_intent_phrase({"intent": raw_intent})
            if intent is None:
                continue
            try:
                counts[intent] += max(0, int(raw_count))
            except (TypeError, ValueError):
                continue
        if any(counts.values()):
            return counts

    rows = evidence.get("evidence", [])
    if not isinstance(rows, Sequence) or isinstance(rows, (str, bytes)):
        return {}
    urls_by_intent: dict[str, set[str]] = {"카페": set(), "맛집": set()}
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        post_url = _text(_first_present(row, ("postUrl", "post_url", "link")))
        intent = trend_intent_phrase(row)
        if post_url and intent:
            urls_by_intent[intent].add(post_url)
    return {intent: len(urls) for intent, urls in urls_by_intent.items() if urls}


def classify_trend_place_category(evidence: Mapping[str, Any]) -> tuple[str | None, str | None]:
    """Classify a trend place conservatively as CAFE or RESTAURANT."""

    matched_categories = list(dict.fromkeys(_matched_kakao_categories(evidence)))
    matched_codes = {category for category, _raw_name in matched_categories}
    if len(matched_codes) > 1:
        return None, None
    if matched_categories:
        return matched_categories[0]

    direct_category = _text(evidence.get("categoryCode")).upper()
    if direct_category in KAKAO_CATEGORY_CODES.values():
        return direct_category, _optional_text(evidence.get("categoryName"))

    counts = _unique_post_intent_counts(evidence)
    cafe_count = counts.get("카페", 0)
    restaurant_count = counts.get("맛집", 0)
    if cafe_count == restaurant_count or max(cafe_count, restaurant_count) <= 0:
        return None, None
    return ("CAFE", None) if cafe_count > restaurant_count else ("RESTAURANT", None)


def _canonical_metadata(evidence: Mapping[str, Any]) -> Mapping[str, Any]:
    canonical_id = _text(evidence.get("canonicalPlaceId"))
    rows = evidence.get("evidence", [])
    candidates: list[Mapping[str, Any]] = []
    if isinstance(rows, Sequence) and not isinstance(rows, (str, bytes)):
        for row in rows:
            if (
                isinstance(row, Mapping)
                and _text(row.get("canonicalPlaceId")) == canonical_id
                and _text(row.get("canonicalPlaceName"))
            ):
                candidates.append(row)
    if not candidates:
        return evidence
    return max(
        candidates,
        key=lambda row: sum(row.get(field) not in (None, "") for field in CANONICAL_METADATA_FIELDS),
    )


def naver_map_place_dto_from_evidence(evidence: Mapping[str, Any]) -> PlaceDTO | None:
    metadata = _canonical_metadata(evidence)
    canonical_id = _text(evidence.get("canonicalPlaceId", metadata.get("canonicalPlaceId")))
    name = _text(evidence.get("canonicalPlaceName", metadata.get("canonicalPlaceName")))
    prefix = f"{NAVER_MAP_SOURCE}:"
    if not canonical_id.startswith(prefix) or not name:
        return None
    source_id = canonical_id[len(prefix) :]
    road_address = _optional_text(metadata.get("canonicalRoadAddress"))
    latitude = _optional_float(metadata.get("canonicalLatitude"))
    longitude = _optional_float(metadata.get("canonicalLongitude"))
    has_coordinates = is_valid_seoul_coordinate(latitude, longitude)
    if not has_coordinates:
        latitude = None
        longitude = None
    category_code, raw_category = classify_trend_place_category(evidence)
    return PlaceDTO(
        name=name,
        road_address=road_address,
        lot_address=None,
        latitude=latitude,
        longitude=longitude,
        phone=_optional_text(metadata.get("canonicalPhone")),
        raw_category=raw_category,
        description=None,
        source=NAVER_MAP_SOURCE,
        source_id=source_id,
        district=extract_district(road_address),
        normalized_name=normalize_place_name(name),
        category_code=category_code,
        tags=["BLOG_TREND"],
        has_coordinates=has_coordinates,
    )


def _resolve_place_id(connection: Any, evidence: Mapping[str, Any]) -> int:
    dto = naver_map_place_dto_from_evidence(evidence)
    if dto is None:
        raise BlogTrendPlaceResolutionError("canonical Naver map place metadata is missing")
    place_id = load_place(
        connection,
        dto,
        LoadStats(),
        allow_blog_trend_naver_map_without_coordinates=True,
        allow_blog_trend_naver_map_address_match=True,
        preserve_existing_category=True,
    )
    if place_id is None:
        raise BlogTrendPlaceResolutionError(
            f"canonical Naver map place could not be resolved: {dto.source_id}"
        )
    return place_id


def _upsert_observation(connection: Any, place_id: int, row: Mapping[str, Any]) -> None:
    params = {
        "place_id": place_id,
        "collection_date": _date_value(row.get("collectionDate")),
        "query": _text(row.get("query")),
        "post_url": _text(row.get("postUrl")),
        "author": _text(row.get("author")) or "unknown",
        "author_name": _optional_text(row.get("authorName")),
        "published_at": _date_value(row.get("publishedAt")),
        "collected_at": _datetime_value(row.get("collectedAt")),
        "region": _optional_text(row.get("region")),
        "intent": _optional_text(row.get("intent")),
        "intent_category": _optional_text(row.get("intentCategory")),
        "search_rank": _optional_int(row.get("searchRank")),
        "observed_place_name": _optional_text(row.get("observedPlaceName")),
        "is_ad_suspected": bool(row.get("isAdSuspected")),
        "ad_signals": _string_array(row.get("adSignals")),
    }
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO blog_trend_observation (
                place_id, collection_date, query, post_url, author, author_name,
                published_at, collected_at, region, intent, intent_category,
                search_rank, observed_place_name, is_ad_suspected, ad_signals
            ) VALUES (
                %(place_id)s, %(collection_date)s, %(query)s, %(post_url)s,
                %(author)s, %(author_name)s, %(published_at)s, %(collected_at)s,
                %(region)s, %(intent)s, %(intent_category)s, %(search_rank)s,
                %(observed_place_name)s, %(is_ad_suspected)s, %(ad_signals)s
            )
            ON CONFLICT (collection_date, query, post_url)
            DO UPDATE SET
                place_id = EXCLUDED.place_id,
                author = EXCLUDED.author,
                author_name = EXCLUDED.author_name,
                published_at = EXCLUDED.published_at,
                collected_at = EXCLUDED.collected_at,
                region = EXCLUDED.region,
                intent = EXCLUDED.intent,
                intent_category = EXCLUDED.intent_category,
                search_rank = EXCLUDED.search_rank,
                observed_place_name = EXCLUDED.observed_place_name,
                is_ad_suspected = EXCLUDED.is_ad_suspected,
                ad_signals = EXCLUDED.ad_signals,
                updated_at = now()
            """,
            params,
        )


def _upsert_snapshot(
    connection: Any,
    place_id: int,
    snapshot_date: date,
    semantics: str,
    evidence: Mapping[str, Any],
) -> int:
    classification = evidence.get("classification", {})
    trend = evidence.get("trend", {})
    windows = trend.get("windows", {})
    recent_window = windows.get("recent", {}) if isinstance(windows, Mapping) else {}
    previous_window = windows.get("previous14", {}) if isinstance(windows, Mapping) else {}
    baseline_window = windows.get("sixMonthBaseline", {}) if isinstance(windows, Mapping) else {}
    query_window = windows.get("query", {}) if isinstance(windows, Mapping) else {}
    monthly_baseline = windows.get("baselineMonths", []) if isinstance(windows, Mapping) else []
    first_monthly_baseline = monthly_baseline[0] if monthly_baseline else {}
    last_monthly_baseline = monthly_baseline[-1] if monthly_baseline else {}
    month_values = trend.get("monthValues", [])
    month_values_json = (
        json.dumps(month_values, ensure_ascii=False)
        if isinstance(month_values, Sequence) and not isinstance(month_values, (str, bytes))
        else "[]"
    )
    query_mention_rates = evidence.get("queryMentionRates", [])
    query_mention_rates_json = (
        json.dumps(query_mention_rates, ensure_ascii=False)
        if isinstance(query_mention_rates, Sequence)
        and not isinstance(query_mention_rates, (str, bytes))
        else "[]"
    )
    params = {
        "place_id": place_id,
        "snapshot_date": snapshot_date,
        "status": _text(classification.get("status")) or "INSUFFICIENT_EVIDENCE",
        "aliases": _string_array(evidence.get("aliases")),
        "unique_posts": int(evidence.get("uniquePosts", 0) or 0),
        "unique_authors": int(evidence.get("uniqueAuthors", 0) or 0),
        "unique_queries": int(evidence.get("uniqueQueries", 0) or 0),
        "unique_intent_categories": int(evidence.get("uniqueIntentCategories", 0) or 0),
        "relative_mention_rate": float(evidence.get("relativeMentionRate", 0) or 0),
        "sampled_mention_posts": int(evidence.get("sampledMentionPosts", 0) or 0),
        "sampled_author_count": int(evidence.get("sampledAuthorCount", 0) or 0),
        "sampled_query_count": int(evidence.get("sampledQueryCount", 0) or 0),
        "query_mention_rates": query_mention_rates_json,
        "collection_days": int(evidence.get("collectionDays", 0) or 0),
        "recent_observed_posts": int(evidence.get("recentObservedPosts", 0) or 0),
        "average_observed_rank": _optional_float(evidence.get("averageObservedRank")),
        "first_observed_at": _datetime_value(evidence.get("firstObservedAt")),
        "latest_observed_at": _datetime_value(evidence.get("latestObservedAt")),
        "ad_suspected_ratio": float(evidence.get("adSuspectedRatio", 0) or 0),
        "minimum_evidence_passed": bool(classification.get("minimumEvidencePassed")),
        "watch_signal_count": int(classification.get("watchSignalCount", 0) or 0),
        "trend_available": bool(trend.get("available")),
        "trend_rising": bool(trend.get("rising")),
        "trend_ratio": _optional_float(trend.get("trendRatio")),
        "recent_trend_value": _optional_float(trend.get("recentTrendValue")),
        "previous_trend_value": _optional_float(trend.get("previousTrendValue")),
        "recent_nonzero_observations": _optional_int(trend.get("recentNonzeroObservations")),
        "baseline_nonzero_observations": _optional_int(trend.get("baselineNonzeroObservations")),
        "trend_reason": _optional_text(trend.get("reason")),
        "trend_checked_at": _datetime_value(trend.get("trendCheckedAt")),
        "trend_status": _optional_text(trend.get("status")),
        "short_ratio": _optional_float(trend.get("shortRatio")),
        "six_month_ratio": _optional_float(trend.get("sixMonthRatio")),
        "recent_search_interest_average": _optional_float(
            trend.get("recentSearchInterestAverage")
        ),
        "previous_14d_search_interest_average": _optional_float(
            trend.get("previous14dSearchInterestAverage")
        ),
        "six_month_baseline_search_interest_average": _optional_float(
            trend.get("sixMonthBaselineSearchInterestAverage")
        ),
        "recent_valid_observation_days": _optional_int(trend.get("recentValidObservationDays")),
        "previous_valid_observation_days": _optional_int(trend.get("previousValidObservationDays")),
        "six_month_baseline_valid_observation_days": _optional_int(
            trend.get("sixMonthBaselineValidObservationDays")
        ),
        "trend_source": _optional_text(trend.get("source")) or SEARCH_TREND_SOURCE,
        "trend_recent_start": _date_value(recent_window.get("start", query_window.get("start"))),
        "trend_recent_end": _date_value(recent_window.get("end", query_window.get("end"))),
        "trend_previous_start": _date_value(previous_window.get("start")),
        "trend_previous_end": _date_value(previous_window.get("end")),
        "trend_baseline_start": _date_value(
            baseline_window.get("start", first_monthly_baseline.get("period"))
        ),
        "trend_baseline_end": _date_value(
            baseline_window.get("end", last_monthly_baseline.get("period"))
        ),
        "trend_time_unit": _optional_text(trend.get("timeUnit")),
        "trend_baseline_months": _optional_int(trend.get("baselineMonths")),
        "trend_comparison_label": _optional_text(trend.get("comparisonLabel")),
        "trend_current_month": _optional_text(trend.get("currentMonth")),
        "trend_current_month_ratio": _optional_float(trend.get("currentMonthRatio")),
        "trend_current_value": _optional_float(trend.get("current")),
        "trend_baseline_value": _optional_float(trend.get("baseline")),
        "monthly_ratio": _optional_float(trend.get("monthlyRatio", trend.get("ratio"))),
        "trend_partial_month_adjusted": bool(trend.get("partialMonthAdjusted")),
        "trend_partial_month_days_used": _optional_int(trend.get("partialMonthDaysUsed")),
        "trend_month_values": month_values_json,
        "trend_missing_months": _string_array(trend.get("missingMonths")),
        "semantics": semantics,
    }
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO place_trend_snapshot (
                place_id, snapshot_date, status, aliases, unique_posts,
                unique_authors, unique_queries, unique_intent_categories,
                relative_mention_rate, sampled_mention_posts, sampled_author_count,
                sampled_query_count,
                query_mention_rates,
                collection_days, recent_observed_posts, average_observed_rank,
                first_observed_at, latest_observed_at, ad_suspected_ratio,
                minimum_evidence_passed, watch_signal_count, trend_available,
                trend_rising, trend_ratio, recent_trend_value,
                previous_trend_value, recent_nonzero_observations,
                baseline_nonzero_observations, trend_reason, trend_checked_at,
                trend_status, short_ratio, six_month_ratio,
                recent_search_interest_average, previous_14d_search_interest_average,
                six_month_baseline_search_interest_average, recent_valid_observation_days,
                previous_valid_observation_days, six_month_baseline_valid_observation_days,
                trend_source, trend_recent_start, trend_recent_end,
                trend_previous_start, trend_previous_end, trend_baseline_start,
                trend_baseline_end,
                trend_time_unit, trend_baseline_months, trend_comparison_label,
                trend_current_month, trend_current_month_ratio, trend_current_value,
                trend_baseline_value, monthly_ratio, trend_partial_month_adjusted,
                trend_partial_month_days_used, trend_month_values, trend_missing_months,
                semantics
            ) VALUES (
                %(place_id)s, %(snapshot_date)s, %(status)s, %(aliases)s,
                %(unique_posts)s, %(unique_authors)s, %(unique_queries)s,
                %(unique_intent_categories)s, %(relative_mention_rate)s,
                %(sampled_mention_posts)s,
                %(sampled_author_count)s,
                %(sampled_query_count)s, %(query_mention_rates)s::jsonb,
                %(collection_days)s, %(recent_observed_posts)s, %(average_observed_rank)s,
                %(first_observed_at)s, %(latest_observed_at)s,
                %(ad_suspected_ratio)s, %(minimum_evidence_passed)s,
                %(watch_signal_count)s, %(trend_available)s, %(trend_rising)s,
                %(trend_ratio)s, %(recent_trend_value)s,
                %(previous_trend_value)s, %(recent_nonzero_observations)s,
                %(baseline_nonzero_observations)s, %(trend_reason)s,
                %(trend_checked_at)s,
                %(trend_status)s, %(short_ratio)s, %(six_month_ratio)s,
                %(recent_search_interest_average)s, %(previous_14d_search_interest_average)s,
                %(six_month_baseline_search_interest_average)s,
                %(recent_valid_observation_days)s, %(previous_valid_observation_days)s,
                %(six_month_baseline_valid_observation_days)s, %(trend_source)s,
                %(trend_recent_start)s, %(trend_recent_end)s,
                %(trend_previous_start)s, %(trend_previous_end)s,
                %(trend_baseline_start)s, %(trend_baseline_end)s,
                %(trend_time_unit)s, %(trend_baseline_months)s, %(trend_comparison_label)s,
                %(trend_current_month)s, %(trend_current_month_ratio)s, %(trend_current_value)s,
                %(trend_baseline_value)s, %(monthly_ratio)s, %(trend_partial_month_adjusted)s,
                %(trend_partial_month_days_used)s, %(trend_month_values)s::jsonb,
                %(trend_missing_months)s,
                %(semantics)s
            )
            ON CONFLICT (place_id, snapshot_date)
            DO UPDATE SET
                status = EXCLUDED.status,
                aliases = EXCLUDED.aliases,
                unique_posts = EXCLUDED.unique_posts,
                unique_authors = EXCLUDED.unique_authors,
                unique_queries = EXCLUDED.unique_queries,
                unique_intent_categories = EXCLUDED.unique_intent_categories,
                relative_mention_rate = EXCLUDED.relative_mention_rate,
                sampled_mention_posts = EXCLUDED.sampled_mention_posts,
                sampled_author_count = EXCLUDED.sampled_author_count,
                sampled_query_count = EXCLUDED.sampled_query_count,
                query_mention_rates = EXCLUDED.query_mention_rates,
                collection_days = EXCLUDED.collection_days,
                recent_observed_posts = EXCLUDED.recent_observed_posts,
                average_observed_rank = EXCLUDED.average_observed_rank,
                first_observed_at = EXCLUDED.first_observed_at,
                latest_observed_at = EXCLUDED.latest_observed_at,
                ad_suspected_ratio = EXCLUDED.ad_suspected_ratio,
                minimum_evidence_passed = EXCLUDED.minimum_evidence_passed,
                watch_signal_count = EXCLUDED.watch_signal_count,
                trend_available = EXCLUDED.trend_available,
                trend_rising = EXCLUDED.trend_rising,
                trend_ratio = EXCLUDED.trend_ratio,
                recent_trend_value = EXCLUDED.recent_trend_value,
                previous_trend_value = EXCLUDED.previous_trend_value,
                recent_nonzero_observations = EXCLUDED.recent_nonzero_observations,
                baseline_nonzero_observations = EXCLUDED.baseline_nonzero_observations,
                trend_reason = EXCLUDED.trend_reason,
                trend_checked_at = EXCLUDED.trend_checked_at,
                trend_status = EXCLUDED.trend_status,
                short_ratio = EXCLUDED.short_ratio,
                six_month_ratio = EXCLUDED.six_month_ratio,
                recent_search_interest_average = EXCLUDED.recent_search_interest_average,
                previous_14d_search_interest_average = EXCLUDED.previous_14d_search_interest_average,
                six_month_baseline_search_interest_average = EXCLUDED.six_month_baseline_search_interest_average,
                recent_valid_observation_days = EXCLUDED.recent_valid_observation_days,
                previous_valid_observation_days = EXCLUDED.previous_valid_observation_days,
                six_month_baseline_valid_observation_days = EXCLUDED.six_month_baseline_valid_observation_days,
                trend_source = EXCLUDED.trend_source,
                trend_recent_start = EXCLUDED.trend_recent_start,
                trend_recent_end = EXCLUDED.trend_recent_end,
                trend_previous_start = EXCLUDED.trend_previous_start,
                trend_previous_end = EXCLUDED.trend_previous_end,
                trend_baseline_start = EXCLUDED.trend_baseline_start,
                trend_baseline_end = EXCLUDED.trend_baseline_end,
                trend_time_unit = EXCLUDED.trend_time_unit,
                trend_baseline_months = EXCLUDED.trend_baseline_months,
                trend_comparison_label = EXCLUDED.trend_comparison_label,
                trend_current_month = EXCLUDED.trend_current_month,
                trend_current_month_ratio = EXCLUDED.trend_current_month_ratio,
                trend_current_value = EXCLUDED.trend_current_value,
                trend_baseline_value = EXCLUDED.trend_baseline_value,
                monthly_ratio = EXCLUDED.monthly_ratio,
                trend_partial_month_adjusted = EXCLUDED.trend_partial_month_adjusted,
                trend_partial_month_days_used = EXCLUDED.trend_partial_month_days_used,
                trend_month_values = EXCLUDED.trend_month_values,
                trend_missing_months = EXCLUDED.trend_missing_months,
                semantics = EXCLUDED.semantics,
                updated_at = now()
            RETURNING id
            """,
            params,
        )
        row = cursor.fetchone()
    if not row:
        raise RuntimeError("place trend snapshot upsert did not return an id")
    return int(row[0])


def persist_blog_trend_run(
    connection: Any,
    run_result: Mapping[str, Any],
    *,
    place_resolver: Callable[[Any, Mapping[str, Any]], int] = _resolve_place_id,
) -> BlogTrendLoadStats:
    ensure_search_trend_columns(connection)
    snapshot_date = _date_value(run_result.get("collectionDate"))
    if snapshot_date is None:
        raise ValueError("blog trend run collectionDate is invalid")
    semantics = _text(run_result.get("semantics"))
    if not semantics:
        raise ValueError("blog trend run semantics is required")
    evidence_rows = run_result.get("evidence", [])
    if not isinstance(evidence_rows, Sequence) or isinstance(evidence_rows, (str, bytes)):
        raise ValueError("blog trend run evidence must be a list")

    stats = BlogTrendLoadStats()
    for evidence in evidence_rows:
        if not isinstance(evidence, Mapping):
            continue
        try:
            place_id = place_resolver(connection, evidence)
        except BlogTrendPlaceResolutionError:
            place_id = None
        if not place_id:
            stats.places_skipped += 1
            continue
        stats.places_resolved += 1
        observations = evidence.get("evidence", [])
        if isinstance(observations, Sequence) and not isinstance(observations, (str, bytes)):
            for observation in observations:
                if not isinstance(observation, Mapping):
                    continue
                _upsert_observation(connection, place_id, observation)
                stats.observations_upserted += 1
        _upsert_snapshot(
            connection,
            place_id,
            snapshot_date,
            semantics,
            evidence,
        )
        stats.snapshots_upserted += 1
    return stats
