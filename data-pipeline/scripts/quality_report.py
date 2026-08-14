from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.connection import get_connection
from src.utils.logging import get_logger

logger = get_logger(__name__)

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"


def fetch_one(conn, sql: str, params: tuple = ()) -> int:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()[0]


def fetch_group_counts(conn, sql: str) -> dict[str, int]:
    with conn.cursor() as cur:
        cur.execute(sql)
        return {row[0] or "(null)": row[1] for row in cur.fetchall()}


def build_report(conn) -> dict:
    total = fetch_one(conn, "SELECT count(*) FROM place")

    by_source = fetch_group_counts(
        conn,
        "SELECT source, count(DISTINCT place_id) FROM place_source GROUP BY source ORDER BY 2 DESC",
    )
    by_category = fetch_group_counts(
        conn,
        """
        SELECT c.code, count(*)
        FROM place p LEFT JOIN place_category c ON c.id = p.category_id
        GROUP BY c.code ORDER BY 2 DESC
        """,
    )
    by_district = fetch_group_counts(
        conn, "SELECT district, count(*) FROM place GROUP BY district ORDER BY 2 DESC"
    )

    no_coordinates = fetch_one(conn, "SELECT count(*) FROM place WHERE location IS NULL")
    no_address = fetch_one(
        conn, "SELECT count(*) FROM place WHERE road_address IS NULL AND lot_address IS NULL"
    )
    no_name = fetch_one(conn, "SELECT count(*) FROM place WHERE name IS NULL OR trim(name) = ''")
    no_operating_hours = fetch_one(
        conn,
        "SELECT count(*) FROM place p WHERE NOT EXISTS (SELECT 1 FROM place_operating_hours h WHERE h.place_id = p.id)",
    )
    no_image = fetch_one(
        conn,
        "SELECT count(*) FROM place WHERE image_url IS NULL",
    )
    no_phone = fetch_one(conn, "SELECT count(*) FROM place WHERE phone IS NULL")

    review_required_files = sorted((Path(__file__).resolve().parent.parent / "data" / "processed").glob("*_review_required.jsonl"))
    review_required_counts = {}
    for path in review_required_files:
        source = path.name.replace("_review_required.jsonl", "").upper()
        with path.open(encoding="utf-8") as f:
            review_required_counts[source] = sum(1 for _ in f)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_places": total,
        "by_source": by_source,
        "by_category": by_category,
        "by_district": by_district,
        "quality_issues": {
            "no_coordinates": no_coordinates,
            "no_address": no_address,
            "no_name": no_name,
            "no_operating_hours": no_operating_hours,
            "no_image": no_image,
            "no_phone": no_phone,
        },
        "review_required_pending": review_required_counts,
    }


def main() -> int:
    with get_connection() as conn:
        report = build_report(conn)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"quality_report_{timestamp}.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    logger.info(f"=== 데이터 품질 리포트 ({path.name}) ===")
    logger.info(f"총 장소 수: {report['total_places']}")
    logger.info(f"source별: {report['by_source']}")
    logger.info(f"category별: {report['by_category']}")
    logger.info(f"district별: {report['by_district']}")
    for key, value in report["quality_issues"].items():
        logger.info(f"{key}: {value}")
    logger.info(f"검토 대기 중(REVIEW_REQUIRED): {report['review_required_pending']}")
    logger.info(f"저장: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
