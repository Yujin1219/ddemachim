from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import psycopg

from src.utils.logging import get_logger

logger = get_logger(__name__)

REVIEW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "processed"
CONTENT_TYPE_MAP = {
    "drama": "DRAMA",
    "show": "VARIETY",
    "movie": "MOVIE",
}


def map_content_type(media_type: str | None) -> str | None:
    if media_type is None:
        return None
    return CONTENT_TYPE_MAP.get(media_type.strip().lower())


@dataclass
class FilmingLoadStats:
    inserted: int = 0
    updated: int = 0
    skipped_no_place: int = 0
    media_pending_records: list[dict] = field(default_factory=list)


def upsert_filming_location(
    conn: psycopg.Connection,
    place_id: int,
    source: str,
    source_id: str,
    content_type: str | None = None,
    scene_description: str | None = None,
) -> None:
    """place x 작품 조합 1건을 filming_location에 idempotent하게 적재한다.

    media_content_id는 항상 NULL로 둔다 — 이번 단계는 TMDB 매칭을 하지 않는다
    (TMDB_API_KEY가 .env에 비어있어 시도하지 않음, 임의 매칭 금지). match_status는
    스키마 기본값과 동일하게 REVIEW_REQUIRED로 명시한다.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO filming_location (
                place_id, media_content_id, match_confidence, match_status,
                content_type, scene_description, source, source_id
            )
            VALUES (%s, NULL, NULL, 'REVIEW_REQUIRED', %s, %s, %s, %s)
            ON CONFLICT (source, source_id)
            DO UPDATE SET
                place_id = EXCLUDED.place_id,
                content_type = EXCLUDED.content_type,
                scene_description = COALESCE(EXCLUDED.scene_description, filming_location.scene_description)
            """,
            (place_id, content_type, scene_description, source, source_id),
        )


def write_media_pending_report(stats: FilmingLoadStats) -> Path | None:
    """TMDB 매칭 전 작품 정보(제목/미디어타입)를 별도 jsonl로 보존한다.

    media_content.tmdb_id가 NOT NULL이라(BE 소유 스키마, 임의로 DDL 변경하지 않음) 제목을
    DB 컬럼에 구조적으로 넣을 자리가 없다. 대신 source_raw_data에 원본이 이미 보존돼 있고,
    여기에 place_id까지 묶어 별도 정리해 나중에 TMDB 매칭 작업 시 그대로 쓸 수 있게 한다.
    """
    if not stats.media_pending_records:
        return None
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    path = REVIEW_DIR / "filming_location_media_pending.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for record in stats.media_pending_records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return path
