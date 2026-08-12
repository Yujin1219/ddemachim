"""한국 작품의 로마자 한국식 배역명만 한글로 변환한다.

일반 영어 역할 문구와 원본 character_name은 변경하지 않는다.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg
from icukit import transliterate

from src.utils.logging import get_logger

logger = get_logger(__name__)

MIGRATION_PATH = Path(__file__).resolve().parent.parent / "src" / "db" / "add_credit_korean_character_name.sql"
ROMAN_TOKEN_PATTERN = re.compile(r"[A-Za-z]+")
HANGUL_PATTERN = re.compile(r"[가-힣]")
LATIN_PATTERN = re.compile(r"[A-Za-z]")
GENERAL_ROLE_WORDS = {
    "chief", "secretary", "director", "emperor", "squad", "mr", "mrs", "ms",
    "officer", "manager", "president", "chairman", "teacher", "doctor", "nurse",
    "detective", "prosecutor", "judge", "mother", "father", "child",
    "voice", "self", "host", "guest", "employee", "staff", "customer", "reporter",
}
# TMDB의 관용·여권식 표기를 ICU의 가역 로마자 표기로 정규화한다.
# 이후 실제 자모 조합은 ICU Latin-Hangul에 맡긴다.
ICU_ROMANIZATION_ALIASES = {
    "kim": "Gim", "lee": "I", "park": "Bag", "choi": "Choe",
    "oh": "O", "koo": "Gu", "goo": "Gu", "yoo": "Yu", "yoon": "Yun",
    "jung": "Jeong", "kang": "Gang", "lim": "Im", "ryu": "Lyu",
    "woo": "U", "ri": "li", "bok": "Bog", "rae": "lae",
    "ryeon": "Lyeon", "ryung": "Lyeong", "joong": "Jung", "woong": "ung",
    "sung": "Seong", "young": "Yeong", "soo": "Su", "shik": "sig", "doo": "du",
    "hyung": "hyeong", "hee": "hui", "deok": "deog", "noh": "No",
    "gook": "gug", "guk": "gug", "byun": "Byeon",
    "gil": "gil", "gwi": "gwi", "nyeo": "nyeo", "jae": "jae",
}
KOREAN_SURNAMES = {
    "ahn", "baek", "bae", "bang", "byun", "cha", "cho", "choi", "go", "gong", "goo",
    "han", "heo", "hong", "hwang", "im", "jang", "jeon", "jeong", "jo", "jung", "kang",
    "ji", "kim", "ko", "koo", "kwon", "lee", "lim", "maeng", "moon", "nam", "namgung", "no", "noh",
    "oh", "park", "ryu", "seo", "shin", "sim", "son", "song", "woo", "yoo", "yoon", "yu",
}


def _normalize_for_icu(part: str) -> str:
    return ROMAN_TOKEN_PATTERN.sub(
        lambda match: ICU_ROMANIZATION_ALIASES.get(match.group(0).lower(), match.group(0)),
        part,
    )


def transliterate_korean_character_name(character_name: str) -> str | None:
    converted_parts = []
    changed = False
    for part in re.split(r"\s*/\s*", character_name):
        tokens = [token.lower() for token in ROMAN_TOKEN_PATTERN.findall(part)]
        if not tokens or any(token in GENERAL_ROLE_WORDS for token in tokens):
            converted_parts.append(part.strip())
            continue
        looks_korean = tokens[0] in KOREAN_SURNAMES
        if looks_korean:
            converted = transliterate(_normalize_for_icu(part), "Latin-Hangul")
            converted = re.sub(r"[\s\-'’]+", "", converted)
            if converted and HANGUL_PATTERN.search(converted) and not LATIN_PATTERN.search(converted):
                converted_parts.append(converted)
                changed = True
                continue
        converted_parts.append(part.strip())

    if not changed:
        return None
    return " / ".join(converted_parts)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="기존 한글 배역명도 ICU 결과로 다시 계산")
    args = parser.parse_args()

    conn = psycopg.connect("dbname=ddemachim user=postgres password=0000 host=localhost")
    with conn.cursor() as cur:
        cur.execute(MIGRATION_PATH.read_text(encoding="utf-8"))
        if args.refresh:
            cur.execute("UPDATE media_credit SET character_name_ko = NULL")
        cur.execute(
            """
            SELECT DISTINCT mc.id, mc.character_name
            FROM media_credit mc
            JOIN media_content m ON m.id = mc.media_content_id
            WHERE mc.character_name_ko IS NULL
              AND mc.character_name ~ '[A-Za-z]'
              AND m.original_title ~ '[가-힣]'
            ORDER BY mc.id
            """
        )
        credits = cur.fetchall()
    conn.commit()

    updated = 0
    for credit_id, character_name in credits:
        korean_name = transliterate_korean_character_name(character_name)
        if not korean_name:
            continue
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE media_credit SET character_name_ko = %s WHERE id = %s",
                (korean_name, credit_id),
            )
        updated += 1
    conn.commit()
    logger.info(f"검토 대상 {len(credits)}건 / 한국식 로마자 배역 한글화 {updated}건")
    conn.close()


if __name__ == "__main__":
    main()
