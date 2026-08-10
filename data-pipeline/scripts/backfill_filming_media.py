from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import json
import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

from src.collectors.tmdb import TmdbAuthError, TmdbClient
from src.db.connection import get_connection
from src.matchers.media_matcher import AUTO_MATCH_THRESHOLD, MatchCandidate, best_match, is_auto_match
from src.utils.logging import get_logger

logger = get_logger(__name__)

PENDING_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "filming_location_media_pending.jsonl"
SOURCE = "FILMING_LOCATION"

# media_type(CSV) -> TMDB 검색 종류. artist는 작품이 아니라 인물이라 대상에서 제외.
MEDIA_TYPE_TO_TMDB_KIND: dict[str, str] = {
    "drama": "tv",
    "show": "tv",  # 예능/버라이어티도 TMDB에서는 tv로 취급
    "movie": "movie",
}


@dataclass
class BackfillStats:
    total: int = 0
    artist_skipped: int = 0
    cache_hits: int = 0
    api_calls: int = 0
    auto_match: int = 0
    review_no_result: int = 0
    review_low_confidence: int = 0
    media_content_reused: int = 0
    media_content_created: int = 0
    errors: list[str] = field(default_factory=list)


def _load_pending(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _get_or_create_media_content(conn, candidate: MatchCandidate, stats: BackfillStats) -> int:
    """(tmdb_id, media_type) UNIQUE 제약을 활용해 이미 있으면 재사용, 없으면 insert."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM media_content WHERE tmdb_id = %s AND media_type = %s",
            (candidate.tmdb_id, candidate.media_type),
        )
        row = cur.fetchone()
        if row:
            stats.media_content_reused += 1
            return row[0]

        release_date = candidate.release_date or None
        cur.execute(
            """
            INSERT INTO media_content (tmdb_id, media_type, title, original_title, poster_path, overview, release_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (tmdb_id, media_type) DO UPDATE SET title = EXCLUDED.title
            RETURNING id
            """,
            (
                candidate.tmdb_id,
                candidate.media_type,
                candidate.title,
                candidate.original_title,
                candidate.poster_path,
                candidate.overview,
                release_date,
            ),
        )
        media_content_id = cur.fetchone()[0]
        stats.media_content_created += 1
        return media_content_id


def _apply_auto_match(conn, source_id: str, media_content_id: int, confidence: float) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE filming_location
            SET media_content_id = %s, match_confidence = %s, match_status = 'AUTO_MATCH'
            WHERE source = %s AND source_id = %s
            """,
            (media_content_id, round(confidence, 3), SOURCE, source_id),
        )


def _record_review_confidence(conn, source_id: str, confidence: float) -> None:
    """확신은 없지만(threshold 미만) 계산된 유사도를 참고용으로 남긴다.

    media_content_id는 NULL 그대로, match_status도 REVIEW_REQUIRED 그대로 유지한다
    (원칙 4) — 나중에 사람이 검토할 때 참고할 수 있도록 confidence만 채운다.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE filming_location
            SET match_confidence = %s
            WHERE source = %s AND source_id = %s AND media_content_id IS NULL
            """,
            (round(confidence, 3), SOURCE, source_id),
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="촬영지-작품(TMDB) 매칭 백필")
    parser.add_argument("--dry-run", action="store_true", help="DB에 쓰지 않고 통계만 출력")
    parser.add_argument("--limit", type=int, default=None, help="테스트용: 앞에서 N건만 처리")
    args = parser.parse_args()

    load_dotenv()

    tmdb_key = os.getenv("TMDB_API_KEY", "").strip()
    if not tmdb_key:
        logger.error(".env에 TMDB_API_KEY가 비어있습니다. 작업을 중단합니다.")
        return 1

    if not PENDING_PATH.exists():
        logger.error(f"대기 목록 파일을 찾을 수 없습니다: {PENDING_PATH}")
        return 1

    rows = _load_pending(PENDING_PATH)
    if args.limit:
        rows = rows[: args.limit]
    logger.info(f"대기 목록 로드: {len(rows)}건 (AUTO_MATCH_THRESHOLD={AUTO_MATCH_THRESHOLD})")

    client = TmdbClient(tmdb_key)
    stats = BackfillStats(total=len(rows))

    # 제목별 검색 캐시: (title, kind) -> TMDB search results (원 리스트)
    search_cache: dict[tuple[str, str], list[dict]] = {}

    conn = None if args.dry_run else get_connection()

    try:
        for i, row in enumerate(rows, start=1):
            source_id = row["source_id"]
            title = (row.get("title") or "").strip()
            media_type = row.get("media_type")

            if media_type == "artist":
                stats.artist_skipped += 1
                continue

            kind = MEDIA_TYPE_TO_TMDB_KIND.get(media_type)
            if kind is None:
                stats.errors.append(f"source_id={source_id}: 알 수 없는 media_type={media_type!r}")
                continue

            if not title:
                stats.errors.append(f"source_id={source_id}: title이 비어있음")
                continue

            cache_key = (title, kind)
            if cache_key in search_cache:
                stats.cache_hits += 1
                results = search_cache[cache_key]
            else:
                try:
                    if kind == "movie":
                        results = client.search_movie(title)
                    else:
                        results = client.search_tv(title)
                except TmdbAuthError as exc:
                    logger.error(f"TMDB 인증 실패, 중단합니다: {exc}")
                    raise
                except Exception as exc:  # noqa: BLE001
                    logger.warning(f"TMDB 검색 실패(title={title!r}, kind={kind}): {exc}")
                    results = []
                stats.api_calls += 1
                search_cache[cache_key] = results

            candidate = best_match(title, kind, results)

            if candidate is None:
                stats.review_no_result += 1
                continue

            if is_auto_match(candidate.confidence):
                if conn is not None:
                    media_content_id = _get_or_create_media_content(conn, candidate, stats)
                    _apply_auto_match(conn, source_id, media_content_id, candidate.confidence)
                stats.auto_match += 1
                logger.info(
                    f"AUTO_MATCH source_id={source_id} title={title!r} -> tmdb_id={candidate.tmdb_id} "
                    f"({candidate.title!r}, confidence={candidate.confidence:.3f})"
                )
            else:
                stats.review_low_confidence += 1
                if conn is not None:
                    _record_review_confidence(conn, source_id, candidate.confidence)
                logger.info(
                    f"REVIEW_REQUIRED(낮은 신뢰도) source_id={source_id} title={title!r} "
                    f"best={candidate.title!r} confidence={candidate.confidence:.3f}"
                )

            if conn is not None and i % 50 == 0:
                conn.commit()
                logger.info(f"진행 {i}/{len(rows)} (중간 commit)")

        if conn is not None:
            conn.commit()
    finally:
        if conn is not None:
            conn.close()

    logger.info("=== 백필 결과 ===")
    logger.info(f"전체 대상: {stats.total}")
    logger.info(f"artist 스킵(매칭 시도 안 함): {stats.artist_skipped}")
    logger.info(f"제목 캐시 히트: {stats.cache_hits}")
    logger.info(f"TMDB API 호출: {stats.api_calls}")
    logger.info(f"AUTO_MATCH(자동 확정): {stats.auto_match}")
    logger.info(f"REVIEW_REQUIRED(검색 결과 없음): {stats.review_no_result}")
    logger.info(f"REVIEW_REQUIRED(신뢰도 낮음): {stats.review_low_confidence}")
    logger.info(f"media_content 신규 생성: {stats.media_content_created}")
    logger.info(f"media_content 재사용: {stats.media_content_reused}")
    if stats.errors:
        logger.warning(f"처리 중 오류 {len(stats.errors)}건:")
        for err in stats.errors[:20]:
            logger.warning(f"  - {err}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
