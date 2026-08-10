from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import os

from dotenv import load_dotenv

from src.cleaners.common import is_valid_seoul_coordinate
from src.collectors.geocoder import geocode_address
from src.collectors.seoul_tour import collect_all
from src.db.connection import get_connection
from src.loaders.place_loader import LoadStats, load_place, write_review_report
from src.normalizers.seoul_tour import filter_jongno, normalize_record
from src.utils.logging import get_logger

logger = get_logger(__name__)


def geocode_missing_coordinates(dtos, api_key, conn):
    """좌표 없는 dto에 한해 신주소(우선) 또는 지번주소로 지오코딩을 시도한다.

    이 소스는 원래 좌표를 안 주므로, 여기서 얻은 좌표는 카카오 주소검색 결과다.
    실패(주소 못 찾음)하면 좌표를 임의로 만들지 않고 None으로 남긴다.
    """
    geocoded = 0
    failed = 0
    for dto in dtos:
        if dto.has_coordinates:
            continue
        address = dto.road_address or dto.lot_address
        if not address:
            continue
        result = geocode_address(address, api_key, conn=conn)
        if result is None:
            failed += 1
            continue
        lat, lng = result
        if not is_valid_seoul_coordinate(lat, lng):
            failed += 1
            continue
        dto.latitude = lat
        dto.longitude = lng
        dto.has_coordinates = True
        geocoded += 1
    logger.info(f"지오코딩 결과: 성공 {geocoded}건 / 실패(주소 못 찾음) {failed}건")
    return dtos


def main() -> int:
    parser = argparse.ArgumentParser(description="서울시 관광명소 CSV 정제/매칭(enrichment-only, 신규 place 생성 안 함)")
    parser.add_argument("--dry-run", action="store_true", help="DB에 적재하지 않고 통계만 출력")
    args = parser.parse_args()

    load_dotenv()

    logger.info("서울시 관광명소 CSV 수집 시작")
    if args.dry_run:
        rows = collect_all()
    else:
        with get_connection() as raw_conn:
            rows = collect_all(conn=raw_conn)

    dtos = [normalize_record(r) for r in rows]
    dtos = [d for d in dtos if d is not None]
    logger.info(f"정규화 완료: {len(dtos)}건")

    jongno_dtos = filter_jongno(dtos)
    logger.info(f"종로구 필터 후: {len(jongno_dtos)}건")

    if args.dry_run:
        logger.info("--dry-run: DB 매칭/적재 생략")
        return 0

    kakao_key = os.getenv("KAKAO_REST_API_KEY", "").strip()
    if not kakao_key:
        logger.error("KAKAO_REST_API_KEY가 .env에 없습니다.")
        return 2

    stats = LoadStats()
    with get_connection() as conn:
        jongno_dtos = geocode_missing_coordinates(jongno_dtos, kakao_key, conn)
        conn.commit()
        for dto in jongno_dtos:
            load_place(conn, dto, stats)
        conn.commit()

    report_path = write_review_report(stats, source="SEOUL_TOUR")

    logger.info("=== 매칭 결과 ===")
    logger.info(f"종로구 필터 후 건수: {len(jongno_dtos)}")
    logger.info(f"자동 병합(AUTO_MATCH): {stats.auto_matched}")
    logger.info(f"신규 place 생성(지오코딩 성공 + 후보 없음): {stats.inserted}")
    logger.info(f"검토 필요(REVIEW_REQUIRED): {stats.review_required}")
    logger.info(f"여전히 좌표 없어 보류(지오코딩도 실패): {stats.skipped_no_coordinates}")
    logger.info(f"기존 소스 재동기화 update: {stats.updated}")
    if report_path:
        logger.info(f"검토 필요 목록(운영시간/태그 등 원문 포함) 저장: {report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
