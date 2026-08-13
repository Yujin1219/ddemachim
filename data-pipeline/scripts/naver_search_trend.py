"""Naver DataLab Search Trend client with API-contract-safe batching."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Iterable, Mapping, Sequence

import requests


NAVER_SEARCH_TREND_URL = "https://openapi.naver.com/v1/datalab/search"
NAVER_API_HUB_SEARCH_TREND_URL = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search"
MAX_GROUPS_PER_REQUEST = 5
# The legacy DataLab integration keeps its existing 20-keyword request
# contract.  API HUB uses a separate, stricter per-group contract.
MAX_KEYWORDS_PER_REQUEST = 20
MAX_KEYWORDS_PER_API_HUB_GROUP = 5
# API HUB permits five groups per request, with at most five keywords in each
# group. Keep this separate from the legacy request-wide 20-keyword limit.
MAX_KEYWORDS_PER_API_HUB_REQUEST = MAX_GROUPS_PER_REQUEST * MAX_KEYWORDS_PER_API_HUB_GROUP
# Short alias for callers that only need to express the API HUB contract.
MAX_KEYWORDS_PER_GROUP = MAX_KEYWORDS_PER_API_HUB_GROUP
SCHEMA_VERSION = 1
LEGACY_SOURCE = "legacy"
API_HUB_SOURCE = "api_hub"
NAVER_LEGACY_SOURCE = LEGACY_SOURCE
NAVER_API_HUB_SOURCE = API_HUB_SOURCE
LEGACY_CLIENT_ID_ENV_NAMES = (
    "NAVER_SEARCH_TREND_CLIENT_ID",
    "NAVER_CLIENT_ID",
)
LEGACY_CLIENT_SECRET_ENV_NAMES = (
    "NAVER_SEARCH_TREND_CLIENT_SECRET",
    "NAVER_CLIENT_SECRET",
)
API_HUB_CLIENT_ID_ENV_NAME = "NAVER_API_HUB_CLIENT_ID"
API_HUB_CLIENT_SECRET_ENV_NAME = "NAVER_API_HUB_CLIENT_SECRET"


class MissingNaverTrendApiKeyError(RuntimeError):
    """Raised when Search Trend credentials are not in the process env."""


class NaverSearchTrendError(RuntimeError):
    """Raised for a request or response failure without credential details."""


@dataclass(frozen=True)
class NaverTrendCredentials:
    """Credentials plus the API source whose authentication contract they use."""

    client_id: str
    client_secret: str = field(repr=False)
    source: str = LEGACY_SOURCE

    @property
    def endpoint(self) -> str:
        if self.source == API_HUB_SOURCE:
            return NAVER_API_HUB_SEARCH_TREND_URL
        return NAVER_SEARCH_TREND_URL

    def __iter__(self):
        """Keep the pre-source-aware two-value unpacking contract working."""

        yield self.client_id
        yield self.client_secret


def _env_first(environ: Mapping[str, str], names: Sequence[str]) -> str:
    for name in names:
        value = str(environ.get(name, "") or "").strip()
        if value:
            return value
    return ""


def naver_trend_credentials_from_env(
    environ: Mapping[str, str] | None = None,
) -> NaverTrendCredentials:
    source = os.environ if environ is None else environ
    api_hub_id = _clean(source.get(API_HUB_CLIENT_ID_ENV_NAME))
    api_hub_secret = _clean(source.get(API_HUB_CLIENT_SECRET_ENV_NAME))
    if api_hub_id or api_hub_secret:
        if not api_hub_id or not api_hub_secret:
            raise MissingNaverTrendApiKeyError(
                "Both NAVER_API_HUB_CLIENT_ID and NAVER_API_HUB_CLIENT_SECRET are required "
                "when using NAVER API HUB."
            )
        return NaverTrendCredentials(api_hub_id, api_hub_secret, API_HUB_SOURCE)

    legacy_id = _env_first(source, LEGACY_CLIENT_ID_ENV_NAMES)
    legacy_secret = _env_first(source, LEGACY_CLIENT_SECRET_ENV_NAMES)
    if legacy_id and legacy_secret:
        return NaverTrendCredentials(legacy_id, legacy_secret, LEGACY_SOURCE)
    raise MissingNaverTrendApiKeyError(
        "A complete Naver Search Trend credential pair is required in the process environment; "
        "live trend validation is unavailable."
    )


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _unique(values: Iterable[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _clean(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


@dataclass(frozen=True)
class TrendKeywordGroup:
    group_name: str
    keywords: tuple[str, ...]
    kind: str = "place"
    kakao_place_id: str | None = None

    def to_payload(self) -> dict[str, Any]:
        return {"groupName": self.group_name, "keywords": list(self.keywords)}

    def to_dict(self) -> dict[str, Any]:
        return {
            "group_name": self.group_name,
            "keywords": list(self.keywords),
            "kind": self.kind,
            "kakao_place_id": self.kakao_place_id,
        }


def build_keyword_groups(
    candidate_places: Sequence[Mapping[str, Any]],
    topics_by_place: Mapping[str, Sequence[str]] | None = None,
    *,
    include_topics: bool = True,
) -> list[TrendKeywordGroup]:
    """Build place/alias and place+topic groups before API batching.

    The Search Trend API treats keywords in one group as alternatives.  A
    topic group therefore contains phrases such as ``place topic`` (and the
    corresponding aliases), while the place group contains the plain aliases.
    """

    topic_map = topics_by_place or {}
    groups: list[TrendKeywordGroup] = []
    for place in candidate_places:
        if not isinstance(place, Mapping):
            continue
        place_id = _clean(place.get("kakao_place_id", place.get("id", place.get("place_id")))) or None
        name = _clean(place.get("name", place.get("place_name")))
        aliases = place.get("aliases", [])
        if isinstance(aliases, str):
            aliases = [aliases]
        plain_keywords = _unique([name, *(aliases if isinstance(aliases, Sequence) else [])])
        if not plain_keywords:
            continue
        label_id = place_id or plain_keywords[0]
        groups.append(TrendKeywordGroup(f"place:{label_id}", tuple(plain_keywords), "place", place_id))
        if not include_topics:
            continue
        topics = topic_map.get(place_id or "", ())
        if isinstance(topics, str):
            topics = [topics]
        for topic in _unique(topics):
            phrase_keywords = _unique([f"{alias} {topic}" for alias in plain_keywords])
            if phrase_keywords:
                groups.append(
                    TrendKeywordGroup(
                        f"place_topic:{label_id}:{topic}",
                        tuple(phrase_keywords),
                        "place_topic",
                        place_id,
                    )
                )
    return groups


def batch_keyword_groups(
    groups: Sequence[TrendKeywordGroup],
    *,
    max_groups: int = MAX_GROUPS_PER_REQUEST,
    max_keywords: int | None = None,
    max_keywords_per_group: int | None = None,
    source: str = LEGACY_SOURCE,
) -> list[list[TrendKeywordGroup]]:
    """Batch groups without exceeding the selected source's contract.

    Legacy requests retain their existing 20-keyword total. API HUB requests
    use five keywords per group and five groups per request.
    """

    if source == API_HUB_SOURCE:
        if max_keywords is None:
            max_keywords = MAX_KEYWORDS_PER_API_HUB_REQUEST
        if max_keywords_per_group is None:
            max_keywords_per_group = MAX_KEYWORDS_PER_API_HUB_GROUP
    elif max_keywords is None:
        max_keywords = MAX_KEYWORDS_PER_REQUEST

    if max_groups <= 0 or max_keywords <= 0:
        raise ValueError("batch limits must be positive")
    if max_keywords_per_group is not None and max_keywords_per_group <= 0:
        raise ValueError("batch limits must be positive")
    batches: list[list[TrendKeywordGroup]] = []
    current: list[TrendKeywordGroup] = []
    keyword_count = 0
    for group in groups:
        group_keywords = len(group.keywords)
        if group_keywords > max_keywords:
            raise ValueError(f"keyword group exceeds max keyword limit: {group.group_name}")
        if max_keywords_per_group is not None and group_keywords > max_keywords_per_group:
            raise ValueError(f"keyword group exceeds max keywords per group: {group.group_name}")
        if current and (len(current) >= max_groups or keyword_count + group_keywords > max_keywords):
            batches.append(current)
            current = []
            keyword_count = 0
        current.append(group)
        keyword_count += group_keywords
    if current:
        batches.append(current)
    return batches


def _period_date(value: Any) -> date | None:
    raw = _clean(value)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        try:
            return datetime.strptime(raw, "%Y-%m").date().replace(day=1)
        except ValueError:
            return None


def _ratio(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result >= 0 else None


class NaverSearchTrendClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        session: Any = None,
        timeout: float = 8.0,
        endpoint: str | None = None,
        source: str = LEGACY_SOURCE,
    ) -> None:
        if not _clean(client_id) or not _clean(client_secret):
            raise MissingNaverTrendApiKeyError("Naver Search Trend credentials are required.")
        if source not in {LEGACY_SOURCE, API_HUB_SOURCE}:
            raise ValueError(f"unsupported Naver Search Trend source: {source}")
        self._client_id = _clean(client_id)
        self._client_secret = _clean(client_secret)
        self.session = session or requests.Session()
        self.timeout = timeout
        self.source = source
        self.endpoint = endpoint or (
            NAVER_API_HUB_SEARCH_TREND_URL if source == API_HUB_SOURCE else NAVER_SEARCH_TREND_URL
        )

    @classmethod
    def from_env(cls, *, session: Any = None, environ: Mapping[str, str] | None = None) -> "NaverSearchTrendClient":
        credentials = naver_trend_credentials_from_env(environ)
        return cls(
            credentials.client_id,
            credentials.client_secret,
            session=session,
            endpoint=credentials.endpoint,
            source=credentials.source,
        )

    def _headers(self) -> dict[str, str]:
        if self.source == API_HUB_SOURCE:
            return {
                "X-NCP-APIGW-API-KEY-ID": self._client_id,
                "X-NCP-APIGW-API-KEY": self._client_secret,
                "Content-Type": "application/json",
            }
        return {
            "X-Naver-Client-Id": self._client_id,
            "X-Naver-Client-Secret": self._client_secret,
            "Content-Type": "application/json",
        }

    def _request_batch(
        self,
        groups: Sequence[TrendKeywordGroup],
        *,
        start_date: date,
        end_date: date,
        time_unit: str,
    ) -> list[dict[str, Any]]:
        body = {
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "timeUnit": time_unit,
            "keywordGroups": [group.to_payload() for group in groups],
        }
        try:
            response = self.session.post(
                self.endpoint,
                headers=self._headers(),
                data=json.dumps(body, ensure_ascii=False),
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            raise NaverSearchTrendError(f"request failed ({type(exc).__name__})") from exc
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise NaverSearchTrendError(f"invalid response ({type(exc).__name__})") from exc
        except Exception as exc:  # noqa: BLE001 - injected test transports vary
            raise NaverSearchTrendError(f"request failed ({type(exc).__name__})") from exc
        raw_results = payload.get("results") if isinstance(payload, Mapping) else None
        if not isinstance(raw_results, list):
            raise NaverSearchTrendError("invalid response results")
        results: list[dict[str, Any]] = []
        for raw in raw_results:
            if not isinstance(raw, Mapping):
                continue
            data_rows = raw.get("data")
            normalized_rows: list[dict[str, Any]] = []
            if isinstance(data_rows, list):
                for row in data_rows:
                    if not isinstance(row, Mapping):
                        continue
                    value = _ratio(row.get("ratio"))
                    period = _clean(row.get("period"))
                    if value is not None and period:
                        normalized_rows.append({"period": period, "ratio": value})
            raw_keywords = raw.get("keywords", [])
            keywords = (
                _unique(raw_keywords)
                if isinstance(raw_keywords, Sequence) and not isinstance(raw_keywords, (str, bytes))
                else []
            )
            results.append(
                {
                    "schema_version": SCHEMA_VERSION,
                    "title": _clean(raw.get("title")),
                    "keywords": keywords,
                    "time_unit": time_unit,
                    "relative_ratio_only": True,
                    "absolute_volume_available": False,
                    "data": normalized_rows,
                }
            )
        return results

    def search(
        self,
        groups: Sequence[TrendKeywordGroup],
        *,
        start_date: date,
        end_date: date,
        time_unit: str = "date",
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        if self.source == API_HUB_SOURCE:
            for group in groups:
                if len(group.keywords) > MAX_KEYWORDS_PER_API_HUB_GROUP:
                    raise ValueError(
                        f"keyword group exceeds API HUB per-group limit: {group.group_name}"
                    )
        for batch in batch_keyword_groups(groups, source=self.source):
            results.extend(
                self._request_batch(batch, start_date=start_date, end_date=end_date, time_unit=time_unit)
            )
        return results


def summarize_trend_ratio(
    trend_result: Mapping[str, Any],
    *,
    recent_start: date,
    recent_end: date,
    baseline_start: date,
    baseline_end: date,
) -> dict[str, Any]:
    """Compare relative-ratio averages; never present them as volume."""

    recent_values: list[float] = []
    baseline_values: list[float] = []
    rows = trend_result.get("data")
    if isinstance(rows, Sequence) and not isinstance(rows, (str, bytes)):
        for row in rows:
            if not isinstance(row, Mapping):
                continue
            period = _period_date(row.get("period"))
            ratio = _ratio(row.get("ratio"))
            if period is None or ratio is None:
                continue
            if recent_start <= period <= recent_end:
                recent_values.append(ratio)
            if baseline_start <= period <= baseline_end:
                baseline_values.append(ratio)
    recent_average = sum(recent_values) / len(recent_values) if recent_values else 0.0
    baseline_average = sum(baseline_values) / len(baseline_values) if baseline_values else 0.0
    ratio_growth = None if baseline_average == 0 else recent_average / baseline_average
    if baseline_average == 0:
        state = "new_or_no_baseline" if recent_average > 0 else "no_baseline"
    elif ratio_growth > 1:
        state = "rising"
    elif ratio_growth < 1:
        state = "falling"
    else:
        state = "flat"
    return {
        "schema_version": SCHEMA_VERSION,
        "group_name": _clean(trend_result.get("title")),
        "recent_ratio_average": round(recent_average, 4),
        "baseline_ratio_average": round(baseline_average, 4),
        "ratio_growth": round(ratio_growth, 4) if ratio_growth is not None else None,
        "state": state,
        "recent_observations": len(recent_values),
        "baseline_observations": len(baseline_values),
        "relative_ratio_only": True,
        "absolute_volume_available": False,
        "windows": {
            "recent_start": recent_start.isoformat(),
            "recent_end": recent_end.isoformat(),
            "baseline_start": baseline_start.isoformat(),
            "baseline_end": baseline_end.isoformat(),
        },
    }
