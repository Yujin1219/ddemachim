"""Kakao Local keyword search based validation for blog map places.

The module deliberately keeps the Kakao credential at the HTTP boundary.  It
does not load ``.env`` files, print the credential, or persist response bodies.
All decision helpers are deterministic and can be exercised with a fake
session, so a live Kakao account is not required for tests.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, MutableMapping, Sequence

import requests


KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
TARGET_CATEGORY_CODES = frozenset({"CE7", "FD6"})
TARGET_DISTRICT = "종로구"
DEFAULT_RESULT_SIZE = 15
DEFAULT_TIMEOUT_SECONDS = 8.0
# A close pin is useful corroboration, but a whole-building radius is too
# broad for places that share an address.  Keep this deliberately tighter than
# the old proximity-only check; the name and district gates still apply.
COORDINATE_MATCH_METERS = 25.0
SCHEMA_VERSION = 1


# These are branch/location qualifiers that appear in the Jongno place names
# returned by Kakao.  They are removed only from the end of a name and only
# when a non-empty business-name prefix remains.  This avoids treating an
# arbitrary shared token (or a shared building) as a business-name match.
CORE_NAME_LOCATION_TOKENS = frozenset(
    {
        "광화문",
        "경복궁",
        "대학로",
        "동숭동",
        "북촌",
        "삼청",
        "삼청동",
        "서촌",
        "성균관대",
        "숭인동",
        "안국",
        "안국동",
        "익선동",
        "인사동",
        "종로",
        "종로1가",
        "종로2가",
        "종로3가",
        "종로4가",
        "종로5가",
        "종로6가",
        "창경궁",
        "창신동",
        "청와대",
        "혜화",
        "혜화동",
    }
)
CORE_NAME_BRANCH_TOKENS = frozenset({"구관", "본점", "별관", "신관", "직영점", "지점"})
CORE_NAME_LOCATION_SUFFIX_RE = re.compile(
    r"(?:"
    + "|".join(
        re.escape(token) for token in sorted(CORE_NAME_LOCATION_TOKENS, key=len, reverse=True)
    )
    + r")(?:[0-9]+호)?점?$"
)
CORE_NAME_NUMERIC_BRANCH_RE = re.compile(r"[0-9]+호점$")
BROAD_ADDRESS_TOKENS = frozenset({"서울", "서울특별시", TARGET_DISTRICT, "대한민국"})


class MissingKakaoApiKeyError(RuntimeError):
    """Raised when a live Kakao operation has no process environment key."""


class KakaoLocalError(RuntimeError):
    """Raised for a Kakao request or response failure without response data."""


def kakao_api_key_from_env(environ: Mapping[str, str] | None = None) -> str:
    """Return ``KAKAO_REST_API_KEY`` from the process environment only."""

    source = os.environ if environ is None else environ
    value = str(source.get("KAKAO_REST_API_KEY", "") or "").strip()
    if not value:
        raise MissingKakaoApiKeyError(
            "KAKAO_REST_API_KEY is required in the process environment; "
            "live Kakao validation is unavailable."
        )
    return value


def _text(value: Any) -> str:
    if value is None:
        return ""
    return unicodedata.normalize("NFKC", str(value)).strip()


def normalize_place_text(value: Any) -> str:
    """Normalize display text for exact/normalized comparison."""

    value = unicodedata.normalize("NFKC", _text(value)).casefold()
    return re.sub(r"[^0-9a-z가-힣]", "", value)


def _place_name_tokens(value: Any) -> list[str]:
    return [normalize_place_text(token) for token in re.findall(r"[0-9a-z가-힣]+", _text(value).casefold())]


def _is_core_name_variant_token(token: str) -> bool:
    if token in CORE_NAME_BRANCH_TOKENS or CORE_NAME_NUMERIC_BRANCH_RE.fullmatch(token):
        return True
    for location in CORE_NAME_LOCATION_TOKENS:
        if token == location or token == f"{location}점":
            return True
        if re.fullmatch(rf"{re.escape(location)}[0-9]+호점", token):
            return True
    return False


def _strip_compact_core_name_suffix(value: str) -> str:
    """Strip one known trailing location/branch qualifier from compact text."""

    for suffix_re in (CORE_NAME_LOCATION_SUFFIX_RE,):
        match = suffix_re.search(value)
        if match and match.start() >= 2:
            return value[: match.start()]
    numeric_branch = CORE_NAME_NUMERIC_BRANCH_RE.search(value)
    if numeric_branch and numeric_branch.start() >= 2:
        return value[: numeric_branch.start()]
    for branch in sorted(CORE_NAME_BRANCH_TOKENS, key=len, reverse=True):
        if value.endswith(branch) and len(value) - len(branch) >= 2:
            return value[: -len(branch)]
    return value


def _core_name_tokens(value: Any) -> tuple[str, ...]:
    tokens = _place_name_tokens(value)
    while len(tokens) > 1 and _is_core_name_variant_token(tokens[-1]):
        tokens.pop()
    compact = _strip_compact_core_name_suffix("".join(tokens))
    if compact != "".join(tokens):
        return (compact,)
    return tuple(tokens)


def normalize_core_place_name(value: Any) -> str:
    """Normalize a place name after removing one trailing branch/location qualifier.

    The comparison intentionally requires the resulting normalized business
    names to be equal.  A shared address or coordinate therefore cannot make
    two unrelated businesses match on its own.
    """

    return "".join(_core_name_tokens(value))


def _address_tokens(value: Any) -> set[str]:
    return {token for token in re.findall(r"[0-9a-z가-힣]+", _text(value).casefold()) if token}


def parse_coordinates(value: Any) -> tuple[float, float] | None:
    """Parse map ``latlng`` or an x/y mapping as ``(latitude, longitude)``."""

    if isinstance(value, Mapping):
        latitude = value.get("lat", value.get("latitude", value.get("y")))
        longitude = value.get("lng", value.get("longitude", value.get("x")))
        try:
            if latitude is not None and longitude is not None:
                return float(latitude), float(longitude)
        except (TypeError, ValueError):
            return None
        return None
    if isinstance(value, (tuple, list)) and len(value) >= 2:
        try:
            return float(value[0]), float(value[1])
        except (TypeError, ValueError):
            return None
    raw = _text(value)
    if not raw:
        return None
    parts = re.split(r"\s*,\s*|\s+", raw)
    if len(parts) < 2:
        return None
    try:
        return float(parts[0]), float(parts[1])
    except (TypeError, ValueError):
        return None


def haversine_distance_m(first: tuple[float, float], second: tuple[float, float]) -> float:
    """Return the great-circle distance between two ``(lat, lng)`` points."""

    lat1, lng1 = map(math.radians, first)
    lat2, lng2 = map(math.radians, second)
    d_lat = lat2 - lat1
    d_lng = lng2 - lng1
    a = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    return 6_371_000.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def build_kakao_query(name: Any, address: Any = "") -> str:
    """Build a disambiguating keyword query from the map place name/address."""

    parts = [_text(name), _text(address)]
    return " ".join(dict.fromkeys(part for part in parts if part))


@dataclass(frozen=True)
class KakaoPlace:
    id: str
    place_name: str
    category_group_code: str
    category_name: str
    address_name: str
    road_address_name: str
    x: float | None
    y: float | None
    phone: str = ""
    place_url: str = ""

    @classmethod
    def from_api(cls, raw: Mapping[str, Any]) -> "KakaoPlace | None":
        place_id = _text(raw.get("id"))
        place_name = _text(raw.get("place_name"))
        if not place_id or not place_name:
            return None
        try:
            x = float(raw["x"]) if raw.get("x") not in (None, "") else None
        except (TypeError, ValueError):
            x = None
        try:
            y = float(raw["y"]) if raw.get("y") not in (None, "") else None
        except (TypeError, ValueError):
            y = None
        return cls(
            id=place_id,
            place_name=place_name,
            category_group_code=_text(raw.get("category_group_code")).upper(),
            category_name=_text(raw.get("category_name")),
            address_name=_text(raw.get("address_name")),
            road_address_name=_text(raw.get("road_address_name")),
            x=x,
            y=y,
            phone=_text(raw.get("phone")),
            place_url=_text(raw.get("place_url")),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "place_name": self.place_name,
            "category_group_code": self.category_group_code,
            "category_name": self.category_name,
            "address_name": self.address_name,
            "road_address_name": self.road_address_name,
            "x": self.x,
            "y": self.y,
            "phone": self.phone,
            "place_url": self.place_url,
        }


class KakaoLocalClient:
    """Small injectable client for Kakao Local keyword search."""

    def __init__(
        self,
        api_key: str,
        *,
        session: Any = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        endpoint: str = KAKAO_KEYWORD_SEARCH_URL,
    ) -> None:
        if not _text(api_key):
            raise MissingKakaoApiKeyError(
                "KAKAO_REST_API_KEY is required for Kakao Local validation."
            )
        self._api_key = _text(api_key)
        self.session = session or requests.Session()
        self.timeout = timeout
        self.endpoint = endpoint

    @classmethod
    def from_env(cls, *, session: Any = None, environ: Mapping[str, str] | None = None) -> "KakaoLocalClient":
        return cls(kakao_api_key_from_env(environ), session=session)

    def search_keyword(
        self,
        name: Any,
        address: Any = "",
        *,
        page: int = 1,
        size: int = DEFAULT_RESULT_SIZE,
    ) -> list[KakaoPlace]:
        query = build_kakao_query(name, address)
        if not query:
            raise KakaoLocalError("representative place name/address is empty")
        try:
            response = self.session.get(
                self.endpoint,
                params={"query": query, "page": page, "size": max(1, min(int(size), 15))},
                headers={"Authorization": f"KakaoAK {self._api_key}"},
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            raise KakaoLocalError(f"request failed ({type(exc).__name__})") from exc
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise KakaoLocalError(f"invalid response ({type(exc).__name__})") from exc
        except Exception as exc:  # noqa: BLE001 - injected transports can fail differently
            raise KakaoLocalError(f"request failed ({type(exc).__name__})") from exc

        documents = payload.get("documents") if isinstance(payload, Mapping) else None
        if not isinstance(documents, list):
            raise KakaoLocalError("invalid response documents")
        places: list[KakaoPlace] = []
        for raw in documents:
            if isinstance(raw, Mapping):
                place = KakaoPlace.from_api(raw)
                if place is not None:
                    places.append(place)
        return places

    # Short alias useful to callers that already use the endpoint terminology.
    search = search_keyword


def _representative_coordinates(place: Mapping[str, Any]) -> tuple[float, float] | None:
    for key in ("latlng", "coordinates", "coordinate"):
        parsed = parse_coordinates(place.get(key))
        if parsed is not None:
            return parsed
    return parse_coordinates(place)


def _representative_name(place: Mapping[str, Any]) -> str:
    return _text(place.get("name", place.get("place_name", "")))


def _representative_address(place: Mapping[str, Any]) -> str:
    return _text(place.get("address", place.get("address_name", "")))


def _candidate_evidence(representative: Mapping[str, Any], candidate: KakaoPlace) -> dict[str, Any]:
    rep_name = _representative_name(representative)
    rep_address = _representative_address(representative)
    candidate_addresses = [candidate.address_name, candidate.road_address_name]
    raw_name_match = bool(rep_name and candidate.place_name.casefold().strip() == rep_name.casefold().strip())
    normalized_rep_name = normalize_place_text(rep_name)
    normalized_candidate_name = normalize_place_text(candidate.place_name)
    normalized_name_match = bool(
        normalized_rep_name and normalized_rep_name == normalized_candidate_name
    )
    normalized_name_containment_match = bool(
        normalized_rep_name
        and normalized_candidate_name
        and normalized_rep_name != normalized_candidate_name
        and normalized_rep_name in normalized_candidate_name
    )
    normalized_rep_core_name = normalize_core_place_name(rep_name)
    normalized_candidate_core_name = normalize_core_place_name(candidate.place_name)
    representative_core_tokens = _core_name_tokens(rep_name)
    candidate_core_tokens = _core_name_tokens(candidate.place_name)
    normalized_core_name_match = bool(
        normalized_rep_core_name
        and normalized_rep_core_name == normalized_candidate_core_name
        and representative_core_tokens == candidate_core_tokens
    )
    shared_core_name = bool(
        normalized_name_match
        or normalized_name_containment_match
        or normalized_core_name_match
    )
    rep_address_normalized = normalize_place_text(rep_address)
    address_exact_match = bool(
        rep_address_normalized
        and any(normalize_place_text(address) == rep_address_normalized for address in candidate_addresses if address)
    )
    road_address_match = bool(
        rep_address_normalized
        and candidate.road_address_name
        and normalize_place_text(candidate.road_address_name) == rep_address_normalized
    )
    rep_tokens = _address_tokens(rep_address)
    candidate_token_sets = [_address_tokens(address) for address in candidate_addresses if address]
    overlap_counts = [len(rep_tokens & tokens) for tokens in candidate_token_sets]
    address_token_overlap = max(overlap_counts, default=0)
    specific_address_overlap = max(
        (len((rep_tokens - BROAD_ADDRESS_TOKENS) & tokens) for tokens in candidate_token_sets),
        default=0,
    )
    jongno_address = any(TARGET_DISTRICT in address for address in candidate_addresses)
    rep_coordinates = _representative_coordinates(representative)
    candidate_coordinates = (candidate.y, candidate.x) if candidate.x is not None and candidate.y is not None else None
    distance_m = (
        haversine_distance_m(rep_coordinates, candidate_coordinates)
        if rep_coordinates is not None and candidate_coordinates is not None
        else None
    )
    distance_match = distance_m is not None and distance_m <= COORDINATE_MATCH_METERS
    strong_address_match = bool(
        address_exact_match
        or (address_token_overlap >= 3 and specific_address_overlap >= 2)
    )
    address_match = (
        address_exact_match
        or (address_token_overlap >= 2 and specific_address_overlap >= 1)
        or distance_match
    )
    location_confirmed = strong_address_match or distance_match
    name_match = raw_name_match or shared_core_name
    category_match = candidate.category_group_code in TARGET_CATEGORY_CODES
    score = 0
    if raw_name_match:
        score += 100
    elif normalized_name_match:
        score += 90
    elif normalized_name_containment_match:
        score += 80
    elif normalized_core_name_match:
        score += 75
    if address_exact_match:
        score += 45
    elif address_token_overlap >= 2:
        score += min(30, address_token_overlap * 8)
    if distance_match:
        score += 35 if distance_m is not None and distance_m <= 100 else 20
    if jongno_address:
        score += 10
    if category_match:
        score += 5
    return {
        "raw_name_match": raw_name_match,
        "normalized_name_match": normalized_name_match,
        "normalized_name_containment_match": normalized_name_containment_match,
        "representative_core_name": normalized_rep_core_name,
        "candidate_core_name": normalized_candidate_core_name,
        "representative_core_tokens": list(representative_core_tokens),
        "candidate_core_tokens": list(candidate_core_tokens),
        "normalized_core_name_match": normalized_core_name_match,
        "shared_core_name": shared_core_name,
        "name_match": name_match,
        "address_exact_match": address_exact_match,
        "road_address_match": road_address_match,
        "address_token_overlap": address_token_overlap,
        "specific_address_overlap": specific_address_overlap,
        "strong_address_match": strong_address_match,
        "address_match": address_match,
        "jongno_address": jongno_address,
        "coordinate_match": distance_match,
        "distance_m": round(distance_m, 2) if distance_m is not None else None,
        "location_confirmed": location_confirmed,
        "category_match": category_match,
        "score": score,
    }


def _candidate_record(candidate: KakaoPlace, evidence: Mapping[str, Any]) -> dict[str, Any]:
    return {**candidate.to_dict(), "match_evidence": dict(evidence)}


def validate_representative_place(
    representative: Mapping[str, Any],
    client: KakaoLocalClient,
    *,
    source_key: str | None = None,
) -> dict[str, Any]:
    """Validate one map representative and return a JSON-safe decision record."""

    name = _representative_name(representative)
    address = _representative_address(representative)
    base: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "source_key": source_key,
        "query": build_kakao_query(name),
        "representative_place": {
            "placeId": _text(representative.get("placeId")) or None,
            "name": name or None,
            "address": address or None,
            "latlng": _text(representative.get("latlng")) or None,
        },
        "status": "error",
        "reasons": [],
        "candidates": [],
        "matched_place": None,
    }
    if not name:
        base["reasons"] = ["representative_name_missing"]
        return base
    try:
        candidates = client.search_keyword(name, "")
    except (KakaoLocalError, MissingKakaoApiKeyError) as exc:
        base["status"] = "error"
        base["reasons"] = [f"{type(exc).__name__}"]
        return base

    if not candidates:
        try:
            candidates = client.search_keyword(name, TARGET_DISTRICT)
            base["query"] = build_kakao_query(name, TARGET_DISTRICT)
        except (KakaoLocalError, MissingKakaoApiKeyError) as exc:
            base["status"] = "error"
            base["reasons"] = [f"{type(exc).__name__}"]
            return base

    scored = [(candidate, _candidate_evidence(representative, candidate)) for candidate in candidates]
    base["candidates"] = [_candidate_record(candidate, evidence) for candidate, evidence in scored]
    if not scored:
        base["status"] = "not_found"
        base["reasons"] = ["no_kakao_keyword_results"]
        return base

    category_candidates = [(candidate, evidence) for candidate, evidence in scored if evidence["category_match"]]
    name_candidates = [(candidate, evidence) for candidate, evidence in scored if evidence["name_match"]]
    if not category_candidates:
        base["status"] = "category_mismatch"
        base["reasons"] = ["no_cafe_or_restaurant_category"]
        return base

    target_candidates = [
        (candidate, evidence)
        for candidate, evidence in category_candidates
        if evidence["jongno_address"]
    ]
    if not target_candidates:
        base["status"] = "location_mismatch"
        base["reasons"] = ["no_jongno_address"]
        return base

    strong_candidates = [
        (candidate, evidence)
        for candidate, evidence in target_candidates
        if evidence["shared_core_name"] and evidence["location_confirmed"]
    ]
    if not strong_candidates:
        if name_candidates:
            base["status"] = "location_mismatch"
            base["reasons"] = ["name_match_without_address_or_coordinate_match"]
        else:
            base["status"] = "not_found"
            base["reasons"] = ["no_name_and_location_match"]
        return base

    ordered = sorted(strong_candidates, key=lambda item: (-int(item[1]["score"]), item[0].id))
    winner, winner_evidence = ordered[0]
    if len(ordered) > 1:
        second_score = int(ordered[1][1]["score"])
        if int(winner_evidence["score"]) == second_score or int(winner_evidence["score"]) - second_score < 10:
            base["status"] = "ambiguous"
            base["reasons"] = ["multiple_equally_plausible_matches"]
            return base

    base["status"] = "matched"
    base["matched_place"] = _candidate_record(winner, winner_evidence)
    base["matched_place_id"] = winner.id
    base["reasons"] = [
        "category_allowed",
        "jongno_address",
        (
            "name_exact"
            if winner_evidence["raw_name_match"]
            else "name_normalized"
            if winner_evidence["normalized_name_match"]
            else "name_normalized_containment"
            if winner_evidence["normalized_name_containment_match"]
            else "name_core_shared"
        ),
        "strong_address_or_coordinate_match",
    ]
    return base


def place_source_key(place: Mapping[str, Any]) -> str:
    """Stable key for joining validation records back to extracted posts."""

    place_id = _text(place.get("placeId", place.get("place_id", "")))
    if place_id:
        return f"map:{place_id}"
    return "name_address:{}|{}".format(
        normalize_place_text(place.get("name", place.get("place_name", ""))),
        normalize_place_text(place.get("address", place.get("address_name", ""))),
    )


def validate_representatives(
    representatives: Iterable[tuple[str, Mapping[str, Any]]],
    client: KakaoLocalClient,
) -> list[dict[str, Any]]:
    """Validate unique representatives while preserving deterministic order."""

    seen: set[str] = set()
    results: list[dict[str, Any]] = []
    for source_key, representative in representatives:
        key = source_key or place_source_key(representative)
        if key in seen:
            continue
        seen.add(key)
        results.append(validate_representative_place(representative, client, source_key=key))
    return results


def summarize_validation(records: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    counts: MutableMapping[str, int] = {status: 0 for status in (
        "matched", "category_mismatch", "location_mismatch", "ambiguous", "not_found", "error"
    )}
    for record in records:
        status = _text(record.get("status"))
        if status in counts:
            counts[status] += 1
    return dict(counts)


def load_representatives_from_artifact(payload: Mapping[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Read strict representatives from an extracted-place artifact.

    Review/no-map posts are not silently promoted.  For hand-built artifacts
    that have no per-post representatives, the aggregate ``places`` list is a
    conservative fallback.
    """

    representatives: list[tuple[str, dict[str, Any]]] = []
    extracted_posts = payload.get("extracted_posts")
    if isinstance(extracted_posts, list):
        for post in extracted_posts:
            if not isinstance(post, Mapping):
                continue
            representative = post.get("representative_place")
            if not isinstance(representative, Mapping):
                continue
            status = _text(post.get("representative_status"))
            if status not in {"auto_confirmed", "matched"}:
                continue
            place = dict(representative)
            representatives.append((place_source_key(place), place))
    if representatives:
        return representatives
    places = payload.get("places")
    if isinstance(places, list):
        for place in places:
            if isinstance(place, Mapping):
                item = dict(place)
                representatives.append((place_source_key(item), item))
    return representatives


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _load_json(path: Path) -> Mapping[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, Mapping):
        raise ValueError("input artifact must be a JSON object")
    return value


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate v2_map representatives with Kakao Local keyword search")
    parser.add_argument("--input", type=Path, required=True, help="extracted-places JSON artifact")
    parser.add_argument("--output", type=Path, required=True, help="validation JSON output")
    parser.add_argument("--dry-run", action="store_true", help="plan only; no key lookup or network request")
    args = parser.parse_args(argv)
    try:
        payload = _load_json(args.input)
        representatives = load_representatives_from_artifact(payload)
        unique_representative_count = len(
            {source_key or place_source_key(place) for source_key, place in representatives}
        )
        representative_mention_count = len(representatives)
        if args.dry_run:
            result = {
                "schema_version": SCHEMA_VERSION,
                "status": "dry_run",
                "representative_count": unique_representative_count,
                "unique_representative_count": unique_representative_count,
                "representative_mention_count": representative_mention_count,
                "validation": [],
                "constraints": {
                    "category_group_codes": sorted(TARGET_CATEGORY_CODES),
                    "target_district": TARGET_DISTRICT,
                    "network": False,
                },
            }
        else:
            client = KakaoLocalClient.from_env()
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
        write_json(args.output, result)
        counts = result.get("counts", {})
        print(
            "Kakao validation {}: representatives={} matched={} error={}".format(
                result["status"],
                result["representative_count"],
                counts.get("matched", 0),
                counts.get("error", 0),
            )
        )
        return 0
    except MissingKakaoApiKeyError as exc:
        print(f"Kakao validation unavailable: {exc}")
        return 2
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Kakao validation failed ({type(exc).__name__})")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
