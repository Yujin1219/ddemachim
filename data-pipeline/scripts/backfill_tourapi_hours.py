"""TourAPI detailIntro2로 관광지/문화시설/쇼핑/음식점 운영시간·휴무일을 채운다.
place.operating_hours_raw 등은 COALESCE라 이미 관광명소로 채워진 곳은 안 덮어쓴다.
"""
from __future__ import annotations

import html
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from src.collectors.tour_api import INTRO_HOURS_FIELDS, fetch_intro
from src.db.connection import get_connection
from src.normalizers.operating_hours import parse_explicit_closed_days, parse_single_time_range
from src.utils.logging import get_logger

logger = get_logger(__name__)

BR_PATTERN = re.compile(r"<br\s*/?>", re.IGNORECASE)
TAG_PATTERN = re.compile(r"<[^>]+>")


def clean_html_text(value: str | None) -> str | None:
    if not value:
        return None
    text = BR_PATTERN.sub(" / ", value)
    text = TAG_PATTERN.sub("", text)
    text = html.unescape(text).strip()
    return text or None


def main() -> int:
    load_dotenv()
    api_key = os.getenv("TOUR_API_KEY", "").strip()
    if not api_key:
        logger.error("TOUR_API_KEY가 .env에 없습니다.")
        return 2

    updated = 0
    structured = 0
    no_intro = 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT place_id, source_id FROM place_source WHERE source='TOURAPI'")
            rows = cur.fetchall()

        logger.info(f"TourAPI place_source {len(rows)}건 처리 시작")

        # contentId -> contentTypeId 매핑을 raw 파일에서 미리 구성(불필요한 추측/중복호출 방지)
        import glob
        import json

        content_type_by_id: dict[str, int] = {}
        for path in glob.glob(str(Path(__file__).resolve().parent.parent / "data" / "raw" / "tourapi" / "*areaBasedList2*.json")):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            items = data["response"]["response"]["body"]["items"]["item"]
            if isinstance(items, dict):
                items = [items]
            for item in items:
                content_type_by_id[item["contentid"]] = int(item["contenttypeid"])

        with conn.cursor() as cur:
            for idx, (place_id, content_id) in enumerate(rows, start=1):
                content_type_id = content_type_by_id.get(content_id)
                if content_type_id not in INTRO_HOURS_FIELDS:
                    no_intro += 1
                    continue

                item = fetch_intro(api_key, content_id, content_type_id, conn=conn)
                if item is None:
                    no_intro += 1
                    continue

                hours_field, restdate_field = INTRO_HOURS_FIELDS[content_type_id]
                hours_raw = clean_html_text(item.get(hours_field))
                restdate_raw = clean_html_text(item.get(restdate_field))

                if not hours_raw and not restdate_raw:
                    no_intro += 1
                    continue

                cur.execute(
                    """
                    UPDATE place SET
                        operating_hours_raw = COALESCE(operating_hours_raw, %s),
                        closed_days_raw = COALESCE(closed_days_raw, %s),
                        updated_at = now()
                    WHERE id = %s
                    """,
                    (hours_raw, restdate_raw, place_id),
                )
                updated += 1

                # 단순 케이스만 구조화: 시간 범위가 정확히 1개고(계절별로 안 나뉨),
                # 열린 요일 목록이 따로 없으니 매일 오픈에서 restdate의 명시적 요일만 휴무 처리
                time_range = parse_single_time_range(hours_raw)
                if time_range and "/" not in (hours_raw or ""):
                    open_time, close_time = time_range
                    closed_days = parse_explicit_closed_days(restdate_raw)
                    cur.execute(
                        "SELECT 1 FROM place_operating_hours WHERE place_id=%s LIMIT 1", (place_id,)
                    )
                    already_has = cur.fetchone() is not None
                    if not already_has:
                        for day in range(7):
                            is_closed = day in closed_days
                            cur.execute(
                                """
                                INSERT INTO place_operating_hours (place_id, day_of_week, open_time, close_time, is_closed)
                                VALUES (%s, %s, %s, %s, %s)
                                ON CONFLICT (place_id, day_of_week) DO NOTHING
                                """,
                                (place_id, day, None if is_closed else open_time, None if is_closed else close_time, is_closed),
                            )
                        structured += 1

                if idx % 50 == 0:
                    conn.commit()
                    logger.info(f"진행 {idx}/{len(rows)}")

        conn.commit()

    logger.info(f"place 원문 컬럼 업데이트: {updated}건")
    logger.info(f"place_operating_hours 신규 구조화: {structured}건")
    logger.info(f"정보 없음/스킵: {no_intro}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
