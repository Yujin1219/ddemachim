from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from src.collectors.seoul_culture_event import collect_all
from src.db.connection import get_connection
from src.loaders.event_loader import EventLoadStats, load_culture_event
from src.normalizers.seoul_culture_event import filter_jongno, filter_ongoing_or_upcoming, normalize_record
from src.utils.logging import get_logger

logger = get_logger(__name__)


def main() -> int:
    parser = argparse.ArgumentParser(description="서울시 문화행사 정보(OA-15486) 종로구 진행중/예정 행사 수집/정제/적재")
    parser.add_argument("--dry-run", action="store_true", help="DB에 적재하지 않고 통계만 출력")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.getenv("SEOUL_OPENAPI_KEY", "").strip()
    if not api_key:
        logger.error("SEOUL_OPENAPI_KEY가 .env에 없습니다.")
        return 2

    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    logger.info(f"서울시 문화행사 정보 수집 시작 (기준일 {today})")

    if args.dry_run:
        raw_items = collect_all(api_key)
    else:
        with get_connection() as raw_conn:
            raw_items = collect_all(api_key, conn=raw_conn)

    logger.info(f"원본 수집 완료: {len(raw_items)}건")

    dtos = [normalize_record(r) for r in raw_items]
    dtos = [d for d in dtos if d is not None]
    logger.info(f"정규화 완료: {len(dtos)}건")

    jongno_dtos = filter_jongno(dtos)
    logger.info(f"종로구 필터 후: {len(jongno_dtos)}건")

    active_dtos = filter_ongoing_or_upcoming(jongno_dtos, today)
    logger.info(f"진행중/예정 필터 후({today} 기준): {len(active_dtos)}건")

    if args.dry_run:
        logger.info("--dry-run: DB 적재 생략")
        for d in active_dtos:
            logger.info(f"  {d.title} | {d.start_date} ~ {d.end_date} | {d.venue_name}")
        return 0

    stats = EventLoadStats()
    with get_connection() as conn:
        for dto in active_dtos:
            load_culture_event(conn, dto, stats)
        conn.commit()

    logger.info("=== 서울시 문화행사 적재 결과 ===")
    logger.info(f"원본 건수(서울 전체): {len(raw_items)}")
    logger.info(f"종로구 필터 후 건수: {len(jongno_dtos)}")
    logger.info(f"진행중/예정 건수: {len(active_dtos)}")
    logger.info(f"DB 신규 insert: {stats.inserted}")
    logger.info(f"DB update: {stats.updated}")
    logger.info(f"place 매칭됨: {stats.place_matched}")
    logger.info(f"place 매칭 안 됨(place_id NULL): {stats.place_unmatched}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
