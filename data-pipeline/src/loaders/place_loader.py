from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import psycopg

from src.matchers.place_matcher import MatchStatus, find_match
from src.models.place_dto import PlaceDTO
from src.utils.logging import get_logger

logger = get_logger(__name__)

REVIEW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "processed"


@dataclass
class LoadStats:
    inserted: int = 0
    updated: int = 0
    auto_matched: int = 0
    review_required: int = 0
    skipped_no_coordinates: int = 0
    review_records: list[dict] = field(default_factory=list)


def _get_category_id(conn: psycopg.Connection, code: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM place_category WHERE code = %s", (code,))
        row = cur.fetchone()
    return row[0] if row else None


def _dto_tags(dto: PlaceDTO) -> list[str] | None:
    cleaned = []
    for tag in dto.tags:
        if isinstance(tag, str):
            normalized = tag.strip()
            if normalized and normalized not in cleaned:
                cleaned.append(normalized)
    return cleaned or None


def _find_existing_source(conn: psycopg.Connection, source: str, source_id: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT place_id FROM place_source WHERE source = %s AND source_id = %s",
            (source, source_id),
        )
        row = cur.fetchone()
    return row[0] if row else None


def _insert_place(conn: psycopg.Connection, dto: PlaceDTO) -> int:
    category_id = _get_category_id(conn, dto.category_code) if dto.category_code else None
    tags = _dto_tags(dto)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO place (
                name, normalized_name, category_id, road_address, lot_address,
                district, location, phone, description, tags
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                CASE WHEN %s IS NOT NULL AND %s IS NOT NULL
                     THEN ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                     ELSE NULL END,
                %s, %s, %s
            )
            RETURNING id
            """,
            (
                dto.name, dto.normalized_name, category_id, dto.road_address, dto.lot_address,
                dto.district,
                dto.longitude, dto.latitude, dto.longitude, dto.latitude,
                dto.phone, dto.description, tags,
            ),
        )
        (place_id,) = cur.fetchone()
    return place_id


def _update_place(conn: psycopg.Connection, place_id: int, dto: PlaceDTO, refresh_category: bool = False) -> None:
    """기존 값이 비어있는 필드만 채우는 보수적 업데이트(다른 소스가 이미 채운 값을 덮어쓰지 않음).

    category_id는 refresh_category=True(같은 소스 재동기화)일 때만 최신 매핑으로 덮어쓴다.
    AUTO_MATCH(다른 소스가 준 값으로 병합)일 때는 다른 소스의 분류를 함부로 덮어쓰지 않기 위해
    COALESCE로만 채운다.
    """
    category_id = _get_category_id(conn, dto.category_code) if dto.category_code else None
    tags = _dto_tags(dto)
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE place SET
                phone = COALESCE(phone, %s),
                road_address = COALESCE(road_address, %s),
                lot_address = COALESCE(lot_address, %s),
                description = COALESCE(description, %s),
                category_id = CASE WHEN %s THEN COALESCE(%s, category_id) ELSE COALESCE(category_id, %s) END,
                tags = CASE
                    WHEN %s::text[] IS NULL THEN tags
                    ELSE ARRAY(
                        SELECT DISTINCT merged.tag
                        FROM unnest(COALESCE(tags, ARRAY[]::text[]) || %s::text[]) AS merged(tag)
                        ORDER BY merged.tag
                    )
                END,
                updated_at = now()
            WHERE id = %s
            """,
            (
                dto.phone, dto.road_address, dto.lot_address, dto.description,
                refresh_category, category_id, category_id,
                tags, tags,
                place_id,
            ),
        )


def _upsert_place_source(conn: psycopg.Connection, place_id: int, dto: PlaceDTO) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO place_source (place_id, source, source_id, has_coordinates, last_synced_at)
            VALUES (%s, %s, %s, %s, now())
            ON CONFLICT (source, source_id)
            DO UPDATE SET place_id = EXCLUDED.place_id,
                          has_coordinates = EXCLUDED.has_coordinates,
                          last_synced_at = now()
            """,
            (place_id, dto.source, dto.source_id, dto.has_coordinates),
        )


_TRAILING_ADDRESS_PARENTHETICAL = re.compile(r"[（(][^（）()]*[）)]$")


def _normalize_road_address(value: str | None) -> str:
    normalized = re.sub(r"\s+", "", str(value or "").strip())
    while True:
        without_suffix = _TRAILING_ADDRESS_PARENTHETICAL.sub("", normalized)
        if without_suffix == normalized:
            return normalized
        normalized = without_suffix


def _find_single_blog_trend_address_match(
    conn: psycopg.Connection,
    dto: PlaceDTO,
) -> int | None:
    incoming_address = _normalize_road_address(dto.road_address)
    if not incoming_address:
        return None

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, road_address
            FROM place
            WHERE normalized_name = %s AND district = %s
            """,
            (dto.normalized_name, dto.district),
        )
        candidates = cur.fetchall()

    if len(candidates) != 1:
        return None
    place_id, existing_address = candidates[0]
    if not _normalize_road_address(existing_address):
        return None
    if _normalize_road_address(existing_address) != incoming_address:
        return None
    return place_id


def _is_blog_trend_naver_map_dto(dto: PlaceDTO) -> bool:
    return (
        dto.source == "NAVER_MAP"
        and bool(dto.source_id.strip())
        and dto.district == "종로구"
        and "BLOG_TREND" in dto.tags
    )


def _allows_blog_trend_naver_map_without_coordinates(
    dto: PlaceDTO,
    requested: bool,
) -> bool:
    return requested and _is_blog_trend_naver_map_dto(dto)


def _allows_blog_trend_naver_map_address_match(
    dto: PlaceDTO,
    requested: bool,
) -> bool:
    return requested and _is_blog_trend_naver_map_dto(dto)


def load_place(
    conn: psycopg.Connection,
    dto: PlaceDTO,
    stats: LoadStats,
    *,
    allow_blog_trend_naver_map_without_coordinates: bool = False,
    allow_blog_trend_naver_map_address_match: bool = False,
) -> int | None:
    """DTO 1건을 idempotent하게 적재한다. 같은 (source, source_id) 재실행 시 update만 한다.

    반환값: 실제로 place row가 확정된 경우(update/auto_match/insert) 그 place_id, 그렇지 않으면
    (REVIEW_REQUIRED/NO_MATCH_NO_COORDS로 빠져 place가 없는 경우) None. 호출부가 place_id에
    의존하는 후속 처리(예: 촬영지-작품 조인 테이블 적재)를 할 수 있도록 노출한다.
    """
    existing_place_id = _find_existing_source(conn, dto.source, dto.source_id)
    if existing_place_id is not None:
        _update_place(conn, existing_place_id, dto, refresh_category=True)
        _upsert_place_source(conn, existing_place_id, dto)
        stats.updated += 1
        return existing_place_id

    match = find_match(conn, dto)

    if match.status == MatchStatus.AUTO_MATCH and match.place_id is not None:
        _update_place(conn, match.place_id, dto)
        _upsert_place_source(conn, match.place_id, dto)
        stats.auto_matched += 1
        return match.place_id

    if match.status == MatchStatus.REVIEW_REQUIRED:
        if _allows_blog_trend_naver_map_address_match(
            dto,
            allow_blog_trend_naver_map_address_match,
        ):
            address_match_place_id = _find_single_blog_trend_address_match(conn, dto)
            if address_match_place_id is not None:
                _update_place(conn, address_match_place_id, dto)
                _upsert_place_source(conn, address_match_place_id, dto)
                stats.auto_matched += 1
                return address_match_place_id
        stats.review_required += 1
        stats.review_records.append(
            {
                "reason": "AMBIGUOUS_OR_UNVERIFIED",
                "source": dto.source,
                "source_id": dto.source_id,
                "name": dto.name,
                "district": dto.district,
                "candidate_place_id": match.place_id,
                "road_address": dto.road_address,
                "tags": dto.tags,
                "extra": dto.extra,
            }
        )
        return None

    # NO_MATCH: 좌표 없는 소스는 신규 place를 만들 수 없다(좌표 임의 생성 금지) — 조용히 버리지
    # 않고 review 큐에 남겨서, 나중에 좌표 있는 소스가 같은 장소를 만들면 재매칭 대상이 되게 한다.
    # 단, 반복 블로그 트렌드 수집은 네이버 지도에서 종로구 주소가 확인된 장소의
    # source-id를 보존해야 하므로, 호출부가 명시적으로 요청한 정확한 경우만 예외로 둔다.
    if not dto.has_coordinates and not _allows_blog_trend_naver_map_without_coordinates(
        dto,
        allow_blog_trend_naver_map_without_coordinates,
    ):
        stats.skipped_no_coordinates += 1
        stats.review_records.append(
            {
                "reason": "NO_MATCH_NO_COORDS",
                "source": dto.source,
                "source_id": dto.source_id,
                "name": dto.name,
                "district": dto.district,
                "candidate_place_id": None,
                "road_address": dto.road_address,
                "tags": dto.tags,
                "extra": dto.extra,
            }
        )
        return None

    place_id = _insert_place(conn, dto)
    _upsert_place_source(conn, place_id, dto)
    stats.inserted += 1
    return place_id


def write_review_report(stats: LoadStats, source: str) -> Path | None:
    if not stats.review_records:
        return None
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    path = REVIEW_DIR / f"{source.lower()}_review_required.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for record in stats.review_records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return path
