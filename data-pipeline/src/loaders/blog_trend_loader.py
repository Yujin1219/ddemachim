from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Callable, Mapping, Sequence

from src.cleaners.common import extract_district, is_valid_seoul_coordinate, normalize_place_name
from src.loaders.place_loader import LoadStats, load_place
from src.models.place_dto import PlaceDTO


NAVER_MAP_SOURCE = "NAVER_MAP"
KAKAO_CATEGORY_CODES = {"CE7": "CAFE", "FD6": "RESTAURANT"}
INTENT_CATEGORY_CODES = {"카페": "CAFE", "맛집": "RESTAURANT"}
TRENDING_SEARCH_STATUSES = frozenset({"SURGING", "NEWLY_EMERGING"})
NON_STORABLE_SEARCH_STATUSES = frozenset(
    {
        "FLAT",
        "FALLING",
        "DECREASING",
        "INSUFFICIENT",
        "INSUFFICIENT_DATA",
        "NO_BASELINE",
        "NO_DATA",
        "UNAVAILABLE",
    }
)
NON_STORABLE_SEARCH_REASONS = frozenset(
    {
        "baseline_missing",
        "insufficient_baseline_coverage",
        "insufficient_recent_coverage",
        "baseline_and_current_zero",
        "MISSING_RESPONSE",
        "API_ERROR",
    }
)
RESULT_TTL = timedelta(days=7)
CANONICAL_METADATA_FIELDS = (
    "canonicalSource",
    "canonicalRoadAddress",
    "canonicalLongitude",
    "canonicalLatitude",
    "canonicalPhone",
)


class BlogTrendPlaceResolutionError(RuntimeError):
    """A canonical blog-trend place cannot be safely linked to place."""


@dataclass
class BlogTrendLoadStats:
    runs_upserted: int = 0
    places_resolved: int = 0
    places_skipped: int = 0
    results_skipped: int = 0
    results_upserted: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "runsUpserted": self.runs_upserted,
            "placesResolved": self.places_resolved,
            "placesSkipped": self.places_skipped,
            "resultsSkipped": self.results_skipped,
            "resultsUpserted": self.results_upserted,
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


def _date_value(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
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
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    raw = _text(value)
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _first_present(mapping: Mapping[str, Any], keys: Sequence[str]) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return value
    return None


def trend_intent_phrase(row: Mapping[str, Any]) -> str | None:
    """Return the fixed query intent represented by one post observation."""

    values = (
        row.get("query"),
        row.get("intent"),
        row.get("intentCategory"),
        row.get("intent_category"),
    )
    for value in values:
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


def _iter_matched_kakao_mappings(value: Any, *, matched_context: bool = False) -> Sequence[Mapping[str, Any]]:
    found: list[Mapping[str, Any]] = []
    if isinstance(value, Mapping):
        direct_match = any(key in value for key in ("matched_place_id", "matchedPlaceId"))
        context = matched_context or direct_match
        if context and any(key in value for key in (*_KAKAO_CATEGORY_CODE_KEYS, *_KAKAO_CATEGORY_NAME_KEYS)):
            found.append(value)
        for key, child in value.items():
            child_context = context or key in _KAKAO_MATCH_CONTAINER_KEYS
            found.extend(_iter_matched_kakao_mappings(child, matched_context=child_context))
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for child in value:
            found.extend(_iter_matched_kakao_mappings(child, matched_context=matched_context))
    return found


def _kakao_category(mapping: Mapping[str, Any]) -> tuple[str, str | None] | None:
    raw_code = _text(_first_present(mapping, _KAKAO_CATEGORY_CODE_KEYS)).upper()
    raw_name = _optional_text(_first_present(mapping, _KAKAO_CATEGORY_NAME_KEYS))
    category = KAKAO_CATEGORY_CODES.get(raw_code)
    if category is None and raw_name:
        if "카페" in raw_name:
            category = "CAFE"
        elif "음식점" in raw_name:
            category = "RESTAURANT"
    return (category, raw_name) if category else None


def _unique_post_intent_counts(evidence: Mapping[str, Any]) -> dict[str, int]:
    configured_counts = evidence.get("uniquePostCountsByIntent")
    if isinstance(configured_counts, Mapping):
        counts = {"카페": 0, "맛집": 0}
        for raw_intent, raw_count in configured_counts.items():
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
    post_urls_by_intent: dict[str, set[str]] = {"카페": set(), "맛집": set()}
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        post_url = _text(_first_present(row, ("postUrl", "post_url", "link")))
        intent = trend_intent_phrase(row)
        if post_url and intent:
            post_urls_by_intent[intent].add(post_url)
    return {intent: len(urls) for intent, urls in post_urls_by_intent.items() if urls}


def _classify_trend_place_category_details(
    evidence: Mapping[str, Any],
) -> tuple[str | None, str | None]:
    """Classify a trend place conservatively as CAFE or RESTAURANT.

    A reliable matched Kakao category is authoritative.  Otherwise the
    distinct-post intent counts are used; ties and conflicting matches stay
    unclassified.
    """

    matched_categories: list[tuple[str, str | None]] = []
    for mapping in _iter_matched_kakao_mappings(evidence):
        category = _kakao_category(mapping)
        if category is not None and category not in matched_categories:
            matched_categories.append(category)
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


def classify_trend_place_category(evidence: Mapping[str, Any]) -> str | None:
    """Return the conservative internal category code for trend evidence."""

    category_code, _raw_category = _classify_trend_place_category_details(evidence)
    return category_code


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
    category_code, raw_category = _classify_trend_place_category_details(evidence)
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


def _run_week(run_result: Mapping[str, Any], collection_date: date) -> date:
    requested_week = _date_value(run_result.get("runWeek")) or collection_date
    return requested_week - timedelta(days=requested_week.weekday())


def _run_started_at(run_result: Mapping[str, Any], collection_date: date) -> datetime:
    value = _datetime_value(
        _first_present(run_result, ("startedAt", "started_at", "measuredAt", "measured_at"))
    )
    if value is not None:
        return value
    return datetime.combine(collection_date, time.min, tzinfo=timezone.utc)


def _run_finished_at(run_result: Mapping[str, Any]) -> datetime:
    value = _datetime_value(_first_present(run_result, ("finishedAt", "finished_at")))
    return value or datetime.now(timezone.utc)


def _upsert_run(connection: Any, run_week: date, started_at: datetime) -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO blog_trend_run (
                run_week, status, started_at, processed_place_count,
                result_count, failure_reason
            ) VALUES (
                %(run_week)s, 'RUNNING', %(started_at)s, 0, 0, NULL
            )
            ON CONFLICT (run_week)
            DO UPDATE SET
                status = 'RUNNING',
                started_at = EXCLUDED.started_at,
                finished_at = NULL,
                processed_place_count = 0,
                result_count = 0,
                failure_reason = NULL,
                updated_at = now()
            RETURNING id
            """,
            {"run_week": run_week, "started_at": started_at},
        )
        row = cursor.fetchone()
    if not row:
        raise RuntimeError("blog trend run upsert did not return an id")
    return int(row[0])


def _mark_run_success(
    connection: Any,
    *,
    run_id: int,
    finished_at: datetime,
    processed_place_count: int,
    result_count: int,
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE blog_trend_run
            SET status = 'SUCCESS',
                finished_at = %(finished_at)s,
                processed_place_count = %(processed_place_count)s,
                result_count = %(result_count)s,
                failure_reason = NULL,
                updated_at = now()
            WHERE id = %(run_id)s
            """,
            {
                "run_id": run_id,
                "finished_at": finished_at,
                "processed_place_count": processed_place_count,
                "result_count": result_count,
            },
        )


def _mark_run_failed(
    connection: Any,
    *,
    run_week: date,
    started_at: datetime,
    processed_place_count: int,
    result_count: int,
    failure_reason: str,
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO blog_trend_run (
                run_week, status, started_at, finished_at,
                processed_place_count, result_count, failure_reason
            ) VALUES (
                %(run_week)s, 'FAILED', %(started_at)s, now(),
                %(processed_place_count)s, %(result_count)s, %(failure_reason)s
            )
            ON CONFLICT (run_week)
            DO UPDATE SET
                status = 'FAILED',
                started_at = EXCLUDED.started_at,
                finished_at = EXCLUDED.finished_at,
                processed_place_count = EXCLUDED.processed_place_count,
                result_count = EXCLUDED.result_count,
                failure_reason = EXCLUDED.failure_reason,
                updated_at = now()
            """,
            {
                "run_week": run_week,
                "started_at": started_at,
                "processed_place_count": processed_place_count,
                "result_count": result_count,
                "failure_reason": failure_reason,
            },
        )


def _clear_run_results(connection: Any, run_id: int) -> None:
    """Remove stale rows when a weekly run is reprocessed in the same transaction."""

    with connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM place_trend_result WHERE run_id = %(run_id)s",
            {"run_id": run_id},
        )


def _interest_values(trend: Mapping[str, Any]) -> tuple[float | None, float | None, float | None]:
    recent = _optional_float(
        _first_present(
            trend,
            (
                "recentInterestAverage",
                "recent_interest_average",
                "recentSearchInterestAverage",
                "recent_ratio_average",
                "recentRatioAverage",
                "recentTrendValue",
                "recent_trend_value",
                "current",
            ),
        )
    )
    previous = _optional_float(
        _first_present(
            trend,
            (
                "previousInterestAverage",
                "previous_interest_average",
                "previous14dSearchInterestAverage",
                "baseline_ratio_average",
                "baselineInterestAverage",
                "previousTrendValue",
                "previous_trend_value",
                "baseline",
            ),
        )
    )
    change = _optional_float(
        _first_present(
            trend,
            ("interestChangePercent", "interest_change_percent"),
        )
    )
    if change is None and recent is not None and previous not in (None, 0):
        change = ((recent - previous) / previous) * 100.0
    return recent, previous, change


def _search_trend_status(trend: Mapping[str, Any]) -> str | None:
    """Map monthly Search Trend evidence to the stored display status."""

    status = _text(trend.get("status")).upper()
    if status in TRENDING_SEARCH_STATUSES:
        return "TRENDING"
    if status in NON_STORABLE_SEARCH_STATUSES:
        return None

    reason = _text(trend.get("reason"))
    if reason in NON_STORABLE_SEARCH_REASONS:
        return None
    if trend.get("available") is not True:
        return None

    recent, previous, _change = _interest_values(trend)
    ratio = _optional_float(
        _first_present(trend, ("ratio", "trendRatio", "monthlyRatio", "shortRatio"))
    )
    if recent is not None and previous is not None:
        if previous <= 0:
            return "TRENDING" if recent > 0 else None
        if recent <= previous:
            return None
        if ratio is None:
            ratio = recent / previous
        return "TRENDING" if ratio >= 2.0 else "WATCH"
    return "TRENDING" if ratio is not None and ratio >= 2.0 else None


def _measured_at(
    run_result: Mapping[str, Any], evidence: Mapping[str, Any], trend: Mapping[str, Any], collection_date: date
) -> datetime:
    keys = (
        "measuredAt",
        "measured_at",
        "trendCheckedAt",
        "trend_checked_at",
        "collectedAt",
        "collected_at",
    )
    for source in (trend, evidence, run_result):
        value = _datetime_value(_first_present(source, keys))
        if value is not None:
            return value
    return datetime.combine(collection_date, time.min, tzinfo=timezone.utc)


def _expires_at(
    run_result: Mapping[str, Any], evidence: Mapping[str, Any], trend: Mapping[str, Any], measured_at: datetime
) -> datetime:
    keys = ("expiresAt", "expires_at")
    for source in (trend, evidence, run_result):
        value = _datetime_value(_first_present(source, keys))
        if value is not None:
            return value
    return measured_at + RESULT_TTL


def _upsert_place_result(
    connection: Any,
    *,
    run_id: int,
    place_id: int,
    status: str,
    recent_interest_average: float | None,
    previous_interest_average: float | None,
    interest_change_percent: float | None,
    measured_at: datetime,
    expires_at: datetime,
) -> None:
    params = {
        "run_id": run_id,
        "place_id": place_id,
        "status": status,
        "recent_interest_average": recent_interest_average,
        "previous_interest_average": previous_interest_average,
        "interest_change_percent": interest_change_percent,
        "measured_at": measured_at,
        "expires_at": expires_at,
    }
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO place_trend_result (
                run_id, place_id, status, recent_interest_average,
                previous_interest_average, interest_change_percent,
                measured_at, expires_at
            ) VALUES (
                %(run_id)s, %(place_id)s, %(status)s,
                %(recent_interest_average)s, %(previous_interest_average)s,
                %(interest_change_percent)s, %(measured_at)s, %(expires_at)s
            )
            ON CONFLICT (run_id, place_id)
            DO UPDATE SET
                status = EXCLUDED.status,
                recent_interest_average = EXCLUDED.recent_interest_average,
                previous_interest_average = EXCLUDED.previous_interest_average,
                interest_change_percent = EXCLUDED.interest_change_percent,
                measured_at = EXCLUDED.measured_at,
                expires_at = EXCLUDED.expires_at,
                updated_at = now()
            """,
            params,
        )


def persist_blog_trend_run(
    connection: Any,
    run_result: Mapping[str, Any],
    *,
    place_resolver: Callable[[Any, Mapping[str, Any]], int] = _resolve_place_id,
) -> BlogTrendLoadStats:
    """Persist one weekly run and its frontend-ready place trend results."""

    collection_date = _date_value(run_result.get("collectionDate"))
    if collection_date is None:
        raise ValueError("blog trend run collectionDate is invalid")
    evidence_rows = run_result.get("evidence", [])
    if not isinstance(evidence_rows, Sequence) or isinstance(evidence_rows, (str, bytes)):
        raise ValueError("blog trend run evidence must be a list")

    run_week = _run_week(run_result, collection_date)
    started_at = _run_started_at(run_result, collection_date)
    run_id = _upsert_run(connection, run_week, started_at)
    stats = BlogTrendLoadStats(runs_upserted=1)
    processed_place_count = 0
    try:
        _clear_run_results(connection, run_id)
        for evidence in evidence_rows:
            if not isinstance(evidence, Mapping):
                continue
            processed_place_count += 1
            trend = evidence.get("trend")
            trend = trend if isinstance(trend, Mapping) else {}
            status = _search_trend_status(trend)
            if status is None:
                stats.results_skipped += 1
                continue
            try:
                place_id = place_resolver(connection, evidence)
            except BlogTrendPlaceResolutionError:
                place_id = None
            if not place_id:
                stats.places_skipped += 1
                continue
            stats.places_resolved += 1
            recent, previous, change = _interest_values(trend)
            measured_at = _measured_at(run_result, evidence, trend, collection_date)
            expires_at = _expires_at(run_result, evidence, trend, measured_at)
            _upsert_place_result(
                connection,
                run_id=run_id,
                place_id=place_id,
                status=status,
                recent_interest_average=recent,
                previous_interest_average=previous,
                interest_change_percent=change,
                measured_at=measured_at,
                expires_at=expires_at,
            )
            stats.results_upserted += 1
        _mark_run_success(
            connection,
            run_id=run_id,
            finished_at=_run_finished_at(run_result),
            processed_place_count=processed_place_count,
            result_count=stats.results_upserted,
        )
    except Exception as exc:
        try:
            # Restore the prior successful result set before recording the
            # failed attempt. The caller commits only this failure row.
            connection.rollback()
            _mark_run_failed(
                connection,
                run_week=run_week,
                started_at=started_at,
                processed_place_count=processed_place_count,
                result_count=stats.results_upserted,
                failure_reason=type(exc).__name__,
            )
        except Exception:
            pass
        raise
    return stats
