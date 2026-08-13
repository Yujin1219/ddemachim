"""한국 작품에 참여한 로마자 표기 인물의 TMDB 한글 별칭을 저장한다.

원본 person.name과 media_credit.character_name은 변경하지 않는다.
TMDB에 한글 별칭이 없는 경우에는 추측하지 않고 name_ko를 비워 둔다.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

import psycopg

from src.collectors.tmdb import TmdbClient
from src.utils.logging import get_logger

logger = get_logger(__name__)

HANGUL_PATTERN = re.compile(r"[가-힣]")
LATIN_PATTERN = re.compile(r"[A-Za-z]")
MIGRATION_PATH = Path(__file__).resolve().parent.parent / "src" / "db" / "add_person_korean_name.sql"


def select_korean_alias(payload: dict) -> str | None:
    aliases = payload.get("also_known_as") or []
    candidates = []
    for alias in aliases:
        normalized = " ".join(str(alias).split())
        if normalized and HANGUL_PATTERN.search(normalized) and not LATIN_PATTERN.search(normalized):
            half = len(normalized) // 2
            if len(normalized) % 2 == 0 and normalized[:half] == normalized[half:]:
                normalized = normalized[:half]
            candidates.append(normalized)
    if not candidates:
        return None
    return min(candidates, key=lambda value: (len(value.replace(" ", "")), value))


def main() -> None:
    key = os.getenv("TMDB_API_KEY", "").strip()
    if not key:
        logger.error("TMDB_API_KEY가 .env에 비어있습니다.")
        return

    conn = psycopg.connect("dbname=ddemachim user=postgres password=0000 host=localhost")
    with conn.cursor() as cur:
        cur.execute(MIGRATION_PATH.read_text(encoding="utf-8"))
        cur.execute(
            """
            UPDATE person
            SET name_ko = left(name_ko, char_length(name_ko) / 2)
            WHERE name_ko IS NOT NULL
              AND mod(char_length(name_ko), 2) = 0
              AND left(name_ko, char_length(name_ko) / 2)
                  = right(name_ko, char_length(name_ko) / 2)
            """
        )
        cur.execute(
            """
            SELECT DISTINCT p.id, p.tmdb_person_id, p.name
            FROM person p
            JOIN media_credit mc ON mc.person_id = p.id
            JOIN media_content m ON m.id = mc.media_content_id
            WHERE p.name_ko IS NULL
              AND p.name ~ '[A-Za-z]'
              AND p.name !~ '[가-힣]'
              AND m.original_title ~ '[가-힣]'
            ORDER BY p.id
            """
        )
        people = cur.fetchall()
    conn.commit()

    client = TmdbClient(key)
    updated = 0
    skipped = 0
    failed = 0
    logger.info(f"한글 별칭 확인 대상: {len(people)}명")

    for person_id, tmdb_person_id, original_name in people:
        try:
            alias = select_korean_alias(client.get_person_details(tmdb_person_id))
        except Exception as exc:
            logger.warning(f"인물 별칭 조회 실패 person_id={person_id}: {exc}")
            failed += 1
            continue

        if not alias:
            skipped += 1
            continue

        with conn.cursor() as cur:
            cur.execute("UPDATE person SET name_ko = %s WHERE id = %s", (alias, person_id))
        conn.commit()
        updated += 1
        logger.info(f"한글 이름 저장: {original_name} -> {alias}")

    logger.info(f"완료: 저장 {updated} / 별칭 없음 {skipped} / 실패 {failed}")
    conn.close()


if __name__ == "__main__":
    main()
