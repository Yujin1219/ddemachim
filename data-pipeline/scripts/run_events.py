from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from src.collectors.tour_api import collect_events
from src.db.connection import get_connection
from src.loaders.event_loader import EventLoadStats, load_event
from src.normalizers.event import filter_jongno, filter_ongoing_or_upcoming, normalize_record
from src.utils.logging import get_logger

logger = get_logger(__name__)


def main() -> int:
    parser = argparse.ArgumentParser(description="TourAPI 종로구 축제/공연/행사(contentTypeId=15) 수집/정제/적재")
    parser.add_argument("--dry-run", action="store_true", help="DB에 적재하지 않고 통계만 출력")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.getenv("TOUR_API_KEY", "").strip()
    if not api_key:
        logger.error("TOUR_API_KEY가 .env에 없습니다.")
        return 2

    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    logger.info(f"TourAPI 이벤트(contentTypeId=15) 수집 시작 (기준일 {today})")

    if args.dry_run:
        raw_items = collect_events(api_key)
    else:
        with get_connection() as raw_conn:
            raw_items = collect_events(api_key, conn=raw_conn)

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
            load_event(conn, dto, stats)
        conn.commit()

    logger.info("=== event 적재 결과 ===")
    logger.info(f"원본 건수: {len(raw_items)}")
    logger.info(f"종로구 필터 후 건수: {len(jongno_dtos)}")
    logger.info(f"진행중/예정 건수: {len(active_dtos)}")
    logger.info(f"DB 신규 insert: {stats.inserted}")
    logger.info(f"DB update: {stats.updated}")
    logger.info(f"place 매칭됨: {stats.place_matched}")
    logger.info(f"place 매칭 안 됨(place_id NULL): {stats.place_unmatched}")
    if stats.unmatched_venues:
        logger.info(f"매칭 안 된 장소명: {stats.unmatched_venues}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
