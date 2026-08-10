from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import os

from dotenv import load_dotenv

from src.collectors.filming_location import collect_all
from src.db.connection import get_connection
from src.loaders.filming_location_loader import (
    FilmingLoadStats,
    upsert_filming_location,
    write_media_pending_report,
)
from src.loaders.place_loader import LoadStats, load_place, write_review_report
from src.normalizers.filming_location import filter_jongno, normalize_record
from src.utils.logging import get_logger

logger = get_logger(__name__)

SOURCE = "FILMING_LOCATION"


def main() -> int:
    parser = argparse.ArgumentParser(description="한국문화정보원 미디어콘텐츠 영상 촬영지 종로구 데이터 수집/정제/적재")
    parser.add_argument("--dry-run", action="store_true", help="DB에 적재하지 않고 통계만 출력")
    args = parser.parse_args()

    load_dotenv()

    tmdb_key = os.getenv("TMDB_API_KEY", "").strip()
    if not tmdb_key:
        logger.warning(
            "TMDB_API_KEY가 .env에 비어있습니다 — 이번 실행은 TMDB 매칭을 시도하지 않습니다. "
            "filming_location.media_content_id는 전부 NULL, match_status='REVIEW_REQUIRED'로 저장됩니다. "
            "작품 제목/미디어타입은 data/processed/filming_location_media_pending.jsonl에 별도 보존됩니다."
        )

    logger.info("한국문화정보원 촬영지 CSV 수집 시작")
    if args.dry_run:
        rows = collect_all()
    else:
        with get_connection() as raw_conn:
            rows = collect_all(conn=raw_conn)

    raw_count = len(rows)
    logger.info(f"원본 수집 완료: {raw_count}행 (전국)")

    dtos = [normalize_record(r) for r in rows]
    dtos = [d for d in dtos if d is not None]
    logger.info(f"정규화 완료(장소명/연번 없는 행 제외): {len(dtos)}건")

    jongno_dtos = filter_jongno(dtos)
    logger.info(f"종로구 필터 후: {len(jongno_dtos)}건")

    coord_ok = sum(1 for d in jongno_dtos if d.has_coordinates)
    coord_bad = len(jongno_dtos) - coord_ok
    logger.info(f"좌표 정상: {coord_ok}건 / 좌표 오류(범위 밖·파싱 실패): {coord_bad}건")

    if args.dry_run:
        logger.info("--dry-run: DB 매칭/적재 생략")
        return 0

    stats = LoadStats()
    filming_stats = FilmingLoadStats()
    with get_connection() as conn:
        for dto in jongno_dtos:
            place_id = load_place(conn, dto, stats)
            if place_id is None:
                # 검토 큐로 빠져 place가 확정되지 않은 행은 촬영지-작품 조인도 만들 수 없다
                # (place_id가 NOT NULL FK라 임의 값을 넣을 수 없음).
                filming_stats.skipped_no_place += 1
                continue
            upsert_filming_location(conn, place_id, source=SOURCE, source_id=dto.source_id)
            filming_stats.inserted += 1
            filming_stats.media_pending_records.append(
                {
                    "source_id": dto.source_id,
                    "place_id": place_id,
                    "place_name": dto.name,
                    "title": dto.extra.get("title"),
                    "media_type": dto.extra.get("media_type"),
                }
            )
        conn.commit()

    report_path = write_review_report(stats, source=SOURCE)
    media_pending_path = write_media_pending_report(filming_stats)

    logger.info("=== place 매칭 결과 ===")
    logger.info(f"원본 건수(전국): {raw_count}")
    logger.info(f"종로구 필터 후 건수: {len(jongno_dtos)}")
    logger.info(f"좌표 정상 건수: {coord_ok}")
    logger.info(f"좌표 오류 건수: {coord_bad}")
    logger.info(f"자동 병합(AUTO_MATCH): {stats.auto_matched}")
    logger.info(f"신규 place insert: {stats.inserted}")
    logger.info(f"검토 필요(REVIEW_REQUIRED): {stats.review_required}")
    logger.info(f"좌표 없어 보류(skipped_no_coordinates): {stats.skipped_no_coordinates}")
    logger.info(f"기존 소스 재동기화 update: {stats.updated}")
    if report_path:
        logger.info(f"place 검토 필요 목록 저장: {report_path}")

    logger.info("=== filming_location(촬영지-작품 조인) 결과 ===")
    logger.info(f"filming_location upsert 건수: {filming_stats.inserted}")
    logger.info(f"place 미확정으로 건너뛴 행: {filming_stats.skipped_no_place}")
    logger.info("TMDB 매칭: 미시도(TMDB_API_KEY 없음) — media_content_id 전부 NULL")
    if media_pending_path:
        logger.info(f"TMDB 매칭 대기 작품 목록 저장: {media_pending_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
