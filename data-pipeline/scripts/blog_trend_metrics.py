"""Windowed metrics for locally validated blog places.

This module never treats a text candidate as a place.  A post contributes only
when its representative has a ``matched`` Kakao validation with a concrete
Kakao place id.  Counts are based on unique public blog links and normalized
blogger identities, not raw mention frequency.
"""
from __future__ import annotations

import html
import re
import unicodedata
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Iterable, Mapping, MutableMapping, Sequence
from urllib.parse import urlparse, urlunparse


SCHEMA_VERSION = 1
DEFAULT_RECENT_DAYS = 7
DEFAULT_PRIOR_DAYS = 28
ADVERTISEMENT_TERMS = (
    "협찬",
    "광고",
    "체험단",
    "제공받아",
    "제공받은",
    "지원받아",
    "지원받은",
    "원고료",
    "소정의",
    "파트너스",
    "애드포스트",
    "affiliate",
)
_BLOG_HOSTS = {"blog.naver.com"}


def _text(value: Any) -> str:
    if value is None:
        return ""
    return html.unescape(unicodedata.normalize("NFKC", str(value))).strip()


def _normalize_component(value: Any) -> str:
    return re.sub(r"[^0-9a-z가-힣]", "", _text(value).casefold())


def normalize_blog_link(value: Any) -> str | None:
    raw = _text(value)
    if not raw:
        return None
    try:
        parsed = urlparse(raw)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme.lower() not in {"http", "https"} or host not in _BLOG_HOSTS:
        return None
    if parsed.username is not None or parsed.password is not None:
        return None
    return urlunparse((parsed.scheme.lower(), host, "/" + parsed.path.strip("/") if parsed.path else "/", "", parsed.query, ""))


def normalize_blogger_identity(value: Any) -> str | None:
    normalized = normalize_blog_link(value)
    if normalized is None:
        return None
    parsed = urlparse(normalized)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", "", ""))


def parse_post_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    raw = _text(value)
    for fmt in ("%Y%m%d", "%Y-%m-%d", "%Y.%m.%d"):
        try:
            from datetime import datetime

            return datetime.strptime(raw, fmt).date()
        except (TypeError, ValueError):
            continue
    return None


def _parse_date(value: Any) -> date | None:
    # Kept separate from the public helper so date subclasses and ISO strings
    # are handled without depending on datetime implementation details.
    if isinstance(value, date):
        return value
    raw = _text(value)
    if not raw:
        return None
    if len(raw) == 8 and raw.isdigit():
        try:
            return date(int(raw[:4]), int(raw[4:6]), int(raw[6:8]))
        except ValueError:
            return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def place_record_key(place: Mapping[str, Any]) -> str:
    place_id = _text(place.get("placeId", place.get("place_id", "")))
    if place_id:
        return f"map:{place_id}"
    return "name_address:{}|{}".format(
        _normalize_component(place.get("name", place.get("place_name", ""))),
        _normalize_component(place.get("address", place.get("address_name", ""))),
    )


def _validation_index(validation_records: Any) -> dict[str, Mapping[str, Any]]:
    if isinstance(validation_records, Mapping):
        values: Iterable[Any] = validation_records.values()
    elif isinstance(validation_records, Sequence) and not isinstance(validation_records, (str, bytes)):
        values = validation_records
    else:
        values = ()
    index: dict[str, Mapping[str, Any]] = {}
    for record in values:
        if not isinstance(record, Mapping):
            continue
        source_key = _text(record.get("source_key"))
        if source_key:
            index[source_key] = record
        representative = record.get("representative_place")
        if isinstance(representative, Mapping):
            index[place_record_key(representative)] = record
        matched = record.get("matched_place")
        if isinstance(matched, Mapping):
            matched_id = _text(matched.get("id"))
            if matched_id:
                index[f"kakao:{matched_id}"] = record
        matched_id = _text(record.get("matched_place_id"))
        if matched_id:
            index[f"kakao:{matched_id}"] = record
    return index


def _post_validation(post: Mapping[str, Any], index: Mapping[str, Mapping[str, Any]]) -> Mapping[str, Any] | None:
    for key in ("local_validation", "kakao_validation", "validation"):
        value = post.get(key)
        if isinstance(value, Mapping):
            return value
    representative = post.get("representative_place")
    if isinstance(representative, Mapping):
        value = index.get(place_record_key(representative))
        if value is not None:
            return value
    return None


def _ad_signals(post: Mapping[str, Any]) -> tuple[str, ...]:
    text = f"{_text(post.get('title'))} {_text(post.get('description'))}".casefold()
    return tuple(term for term in ADVERTISEMENT_TERMS if term.casefold() in text)


def _empty_group(place_id: str) -> dict[str, Any]:
    return {
        "kakao_place_id": place_id,
        "recent_links": set(),
        "prior_links": set(),
        "recent_bloggers": set(),
        "prior_bloggers": set(),
        "recent_queries": set(),
        "prior_queries": set(),
        "recent_records": 0,
        "prior_records": 0,
        "ad_links": set(),
        "ad_terms": set(),
        "ad_records": 0,
    }


def _round(value: float | None, digits: int = 4) -> float | None:
    return None if value is None else round(float(value), digits)


def aggregate_verified_place_mentions(
    posts: Sequence[Mapping[str, Any]],
    validation_records: Any = None,
    *,
    as_of: date,
    recent_days: int = DEFAULT_RECENT_DAYS,
    prior_days: int = DEFAULT_PRIOR_DAYS,
) -> list[dict[str, Any]]:
    """Aggregate recent 7-day and preceding 28-day windows by Kakao id."""

    if recent_days <= 0 or prior_days <= 0:
        raise ValueError("recent_days and prior_days must be positive")
    index = _validation_index(validation_records)
    recent_start = as_of - timedelta(days=recent_days - 1)
    prior_end = recent_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=prior_days - 1)
    groups: MutableMapping[str, dict[str, Any]] = {}

    for post in posts:
        if not isinstance(post, Mapping):
            continue
        validation = _post_validation(post, index)
        if not isinstance(validation, Mapping) or _text(validation.get("status")) != "matched":
            continue
        matched = validation.get("matched_place")
        place_id = _text(validation.get("matched_place_id"))
        if not place_id and isinstance(matched, Mapping):
            place_id = _text(matched.get("id"))
        if not place_id:
            continue
        post_date = _parse_date(post.get("postdate"))
        if post_date is None or post_date < prior_start or post_date > as_of:
            continue
        link = normalize_blog_link(post.get("link"))
        if link is None:
            continue
        blogger = normalize_blogger_identity(post.get("bloggerlink"))
        query = _text(post.get("query"))
        signals = _ad_signals(post)
        group = groups.setdefault(place_id, _empty_group(place_id))
        is_recent = post_date >= recent_start
        prefix = "recent" if is_recent else "prior"
        group[f"{prefix}_records"] += 1
        group[f"{prefix}_links"].add(link)
        if blogger:
            group[f"{prefix}_bloggers"].add(blogger)
        if query:
            group[f"{prefix}_queries"].add(query)
        if signals:
            group["ad_links"].add(link)
            group["ad_records"] += 1
            group["ad_terms"].update(signals)

    recent_weeks = recent_days / 7
    prior_weeks = prior_days / 7
    output: list[dict[str, Any]] = []
    for place_id in sorted(groups):
        group = groups[place_id]
        recent_links = len(group["recent_links"])
        prior_links = len(group["prior_links"])
        recent_bloggers = len(group["recent_bloggers"])
        prior_bloggers = len(group["prior_bloggers"])
        recent_weekly_average = recent_links / recent_weeks
        prior_weekly_average = prior_links / prior_weeks
        prior_zero = prior_links == 0
        growth_ratio = None if prior_weekly_average == 0 else recent_weekly_average / prior_weekly_average
        trend_state = "new" if prior_zero and recent_links > 0 else "no_mentions" if not recent_links else "existing"
        minimum_conditions = {
            "recent_unique_links_at_least_3": recent_links >= 3,
            "recent_unique_bloggers_at_least_3": recent_bloggers >= 3,
            "recent_has_query": bool(group["recent_queries"]),
        }
        output.append(
            {
                "schema_version": SCHEMA_VERSION,
                "kakao_place_id": place_id,
                "window": {
                    "as_of": as_of.isoformat(),
                    "recent_start": recent_start.isoformat(),
                    "recent_end": as_of.isoformat(),
                    "prior_start": prior_start.isoformat(),
                    "prior_end": prior_end.isoformat(),
                    "recent_days": recent_days,
                    "prior_days": prior_days,
                },
                "recent_unique_links": recent_links,
                "prior_unique_links": prior_links,
                "recent_unique_bloggers": recent_bloggers,
                "prior_unique_bloggers": prior_bloggers,
                "recent_query_diversity": len(group["recent_queries"]),
                "prior_query_diversity": len(group["prior_queries"]),
                "recent_weekly_average": _round(recent_weekly_average),
                "prior_weekly_average": _round(prior_weekly_average),
                "growth_ratio": _round(growth_ratio),
                "absolute_delta": _round(recent_weekly_average - prior_weekly_average),
                "trend_state": trend_state,
                "prior_zero_new": prior_zero and recent_links > 0,
                "minimum_data_conditions": minimum_conditions,
                "minimum_data_met": all(minimum_conditions.values()),
                "growth_threshold_met": bool(growth_ratio is not None and growth_ratio >= 2),
                "absolute_delta_threshold_met": recent_weekly_average - prior_weekly_average >= 2,
                "advertising_signal": {
                    "ad_suspected": bool(group["ad_links"]),
                    "flag_only": True,
                    "signal_terms": sorted(group["ad_terms"]),
                    "suspected_link_count": len(group["ad_links"]),
                    "suspected_record_count": group["ad_records"],
                    "penalty": min(3, len(group["ad_terms"])),
                },
                # Compatibility aliases make the compact metrics easy to use
                # in a report without changing the window-specific fields.
                "unique_link_count": recent_links,
                "unique_blogger_count": recent_bloggers,
            }
        )
    return output


def metrics_by_place(metrics: Sequence[Mapping[str, Any]]) -> dict[str, Mapping[str, Any]]:
    return {
        _text(metric.get("kakao_place_id")): metric
        for metric in metrics
        if isinstance(metric, Mapping) and _text(metric.get("kakao_place_id"))
    }
