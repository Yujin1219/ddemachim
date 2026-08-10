from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from src.collectors.tour_api import PLACE_CONTENT_TYPE_IDS, collect_all
from src.db.connection import get_connection
from src.loaders.place_loader import LoadStats, load_place, write_review_report
from src.normalizers.tour_api import filter_jongno, normalize_record
from src.utils.logging import get_logger

logger = get_logger(__name__)


def main() -> int:
    parser = argparse.ArgumentParser(description="TourAPI 종로구 관광지/문화시설/쇼핑/음식점 수집/정제/적재")
    parser.add_argument("--dry-run", action="store_true", help="DB에 적재하지 않고 통계만 출력")
    parser.add_argument("--no-overview", action="store_true", help="detailCommon2 overview 조회 생략(속도용)")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.getenv("TOUR_API_KEY", "").strip()
    if not api_key:
        logger.error("TOUR_API_KEY가 .env에 없습니다.")
        return 2

    logger.info(f"TourAPI 수집 시작 (contentTypeIds={PLACE_CONTENT_TYPE_IDS})")

    if args.dry_run:
        result = collect_all(api_key, fetch_overviews=not args.no_overview)
    else:
        with get_connection() as raw_conn:
            result = collect_all(api_key, conn=raw_conn, fetch_overviews=not args.no_overview)

    raw_count = len(result.records)
    logger.info(f"원본 수집 완료: {raw_count}건")

    dtos = [normalize_record(r) for r in result.records]
    dtos = [d for d in dtos if d is not None]
    logger.info(f"정규화 완료: {len(dtos)}건")

    jongno_dtos = filter_jongno(dtos)
    logger.info(f"종로구 필터 후: {len(jongno_dtos)}건")

    coord_ok = sum(1 for d in jongno_dtos if d.has_coordinates)
    coord_bad = len(jongno_dtos) - coord_ok
    logger.info(f"좌표 정상: {coord_ok}건 / 좌표 오류: {coord_bad}건")

    if args.dry_run:
        logger.info("--dry-run: DB 적재 생략")
        return 0

    stats = LoadStats()
    with get_connection() as conn:
        for dto in jongno_dtos:
            load_place(conn, dto, stats)
        conn.commit()

    report_path = write_review_report(stats, source="TOURAPI")

    logger.info("=== 적재 결과 ===")
    logger.info(f"원본 건수: {raw_count}")
    logger.info(f"종로구 필터 후 건수: {len(jongno_dtos)}")
    logger.info(f"좌표 정상 건수: {coord_ok}")
    logger.info(f"좌표 오류 건수: {coord_bad}")
    logger.info(f"자동 병합 건수(AUTO_MATCH): {stats.auto_matched}")
    logger.info(f"검토 필요 건수(REVIEW_REQUIRED): {stats.review_required}")
    logger.info(f"DB 신규 insert 건수: {stats.inserted}")
    logger.info(f"DB update 건수: {stats.updated}")
    logger.info(f"좌표 없어 스킵된 건수: {stats.skipped_no_coordinates}")
    if report_path:
        logger.info(f"검토 필요 목록 저장: {report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
