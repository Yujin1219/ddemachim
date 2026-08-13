"""현재 media_content에 있는 작품(318건)의 TMDB /credits(출연진/감독)를 가져와 person, media_credit에 채운다.

- CAST: 전체 출연진(character_name, cast_order 포함)
- CREW: job='Director'인 사람만(감독) — 그 외 crew job(음악/스태프 등)은 사용자가 요청한 범위가 아니라 저장하지 않는다
- person은 tmdb_person_id로 중복 방지 upsert
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

import psycopg

from src.collectors.tmdb import TmdbClient
from src.utils.logging import get_logger

logger = get_logger(__name__)

MIGRATION_PATH = Path(__file__).resolve().parent.parent / "src" / "db" / "add_media_credits.sql"


@dataclass
class Stats:
    media_processed: int = 0
    media_failed: int = 0
    person_created: int = 0
    person_reused: int = 0
    cast_rows: int = 0
    director_rows: int = 0
    failed_titles: list[str] = field(default_factory=list)


def _ensure_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(MIGRATION_PATH.read_text(encoding="utf-8"))
    conn.commit()


def _upsert_person(conn: psycopg.Connection, tmdb_person_id: int, name: str, profile_path: str | None, stats: Stats) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM person WHERE tmdb_person_id = %s", (tmdb_person_id,))
        row = cur.fetchone()
        if row:
            stats.person_reused += 1
            return row[0]

        cur.execute(
            """
            INSERT INTO person (tmdb_person_id, name, profile_path)
            VALUES (%s, %s, %s)
            ON CONFLICT (tmdb_person_id) DO UPDATE
            SET name = EXCLUDED.name, profile_path = EXCLUDED.profile_path
            RETURNING id
            """,
            (tmdb_person_id, name, profile_path),
        )
        person_id = cur.fetchone()[0]
        stats.person_created += 1
        return person_id


def _upsert_credit(
    conn: psycopg.Connection,
    media_content_id: int,
    person_id: int,
    role: str,
    character_name: str | None,
    cast_order: int | None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO media_credit (media_content_id, person_id, role, character_name, cast_order)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (media_content_id, person_id, role)
            DO UPDATE SET character_name = EXCLUDED.character_name, cast_order = EXCLUDED.cast_order
            """,
            (media_content_id, person_id, role, character_name, cast_order),
        )


def main() -> None:
    key = os.getenv("TMDB_API_KEY", "").strip()
    if not key:
        logger.error("TMDB_API_KEY가 .env에 비어있습니다.")
        return

    client = TmdbClient(key)
    conn = psycopg.connect("dbname=ddemachim user=postgres password=0000 host=localhost")
    _ensure_schema(conn)
    stats = Stats()

    with conn.cursor() as cur:
        cur.execute("SELECT id, tmdb_id, media_type, title FROM media_content ORDER BY id")
        media_rows = cur.fetchall()

    logger.info(f"media_content {len(media_rows)}건에 대해 /credits 조회 시작")

    for media_content_id, tmdb_id, media_type, title in media_rows:
        try:
            data = client.get_credits(media_type, tmdb_id)
        except Exception as exc:
            logger.warning(f"credits 조회 실패 title={title!r} tmdb_id={tmdb_id}: {exc}")
            stats.media_failed += 1
            stats.failed_titles.append(title)
            continue

        for c in data.get("cast", []):
            person_id = _upsert_person(conn, c["id"], c.get("name") or c.get("original_name") or "", c.get("profile_path"), stats)
            _upsert_credit(conn, media_content_id, person_id, "CAST", c.get("character"), c.get("order"))
            stats.cast_rows += 1

        for c in data.get("crew", []):
            if c.get("job") != "Director":
                continue
            person_id = _upsert_person(conn, c["id"], c.get("name") or c.get("original_name") or "", c.get("profile_path"), stats)
            _upsert_credit(conn, media_content_id, person_id, "DIRECTOR", None, None)
            stats.director_rows += 1

        conn.commit()
        stats.media_processed += 1

    logger.info("=== 배우/감독 백필 결과 ===")
    logger.info(f"처리된 작품: {stats.media_processed} / 실패: {stats.media_failed}")
    logger.info(f"person 신규: {stats.person_created} / 재사용: {stats.person_reused}")
    logger.info(f"CAST 행: {stats.cast_rows} / DIRECTOR 행: {stats.director_rows}")
    if stats.failed_titles:
        logger.info(f"실패한 작품 목록: {stats.failed_titles}")

    conn.close()


if __name__ == "__main__":
    main()
