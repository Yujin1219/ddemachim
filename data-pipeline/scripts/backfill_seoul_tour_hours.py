"""서울시 관광명소 CSV(이미 수집됨)에서 운영시간/휴무일/교통정보/태그/장애인편의시설을
place에 원문으로 채우고, 시간+요일이 명확한 경우 place_operating_hours에 구조화 저장한다.
추가 API 호출 없음 - 기존 CSV 재사용.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from src.collectors.seoul_tour import collect_all
from src.db.connection import get_connection
from src.normalizers.operating_hours import build_day_rows
from src.normalizers.seoul_tour import normalize_record
from src.utils.logging import get_logger

logger = get_logger(__name__)


def main() -> int:
    load_dotenv()
    rows = collect_all()
    dtos = [normalize_record(r) for r in rows]
    dtos = [d for d in dtos if d is not None]

    updated = 0
    structured = 0
    no_place = 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            for dto in dtos:
                cur.execute(
                    "SELECT place_id FROM place_source WHERE source='SEOUL_TOUR' AND source_id=%s",
                    (dto.source_id,),
                )
                row = cur.fetchone()
                if row is None:
                    no_place += 1
                    continue
                place_id = row[0]
                extra = dto.extra

                cur.execute(
                    """
                    UPDATE place SET
                        operating_hours_raw = COALESCE(operating_hours_raw, %s),
                        operating_days_raw = COALESCE(operating_days_raw, %s),
                        closed_days_raw = COALESCE(closed_days_raw, %s),
                        transit_info = COALESCE(transit_info, %s),
                        accessibility = COALESCE(accessibility, %s),
                        tags = COALESCE(tags, %s),
                        website = COALESCE(website, %s),
                        updated_at = now()
                    WHERE id = %s
                    """,
                    (
                        extra.get("operating_hours_raw"),
                        extra.get("operating_days_raw"),
                        extra.get("closed_days_raw"),
                        extra.get("transit_info"),
                        extra.get("accessibility"),
                        extra.get("tags") or None,
                        extra.get("website"),
                        place_id,
                    ),
                )
                updated += 1

                day_rows = build_day_rows(
                    extra.get("operating_hours_raw"),
                    extra.get("operating_days_raw"),
                    extra.get("closed_days_raw"),
                )
                if day_rows is not None:
                    for day, open_time, close_time, is_closed in day_rows:
                        cur.execute(
                            """
                            INSERT INTO place_operating_hours (place_id, day_of_week, open_time, close_time, is_closed)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (place_id, day_of_week)
                            DO UPDATE SET open_time = EXCLUDED.open_time,
                                          close_time = EXCLUDED.close_time,
                                          is_closed = EXCLUDED.is_closed
                            """,
                            (place_id, day, open_time, close_time, is_closed),
                        )
                    structured += 1
        conn.commit()

    logger.info(f"place 원문 컬럼 업데이트: {updated}건")
    logger.info(f"place_operating_hours 구조화 저장: {structured}건 (요일별 7행씩)")
    logger.info(f"place_source 매칭 안 됨(검토 대기 중이라 스킵): {no_place}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
