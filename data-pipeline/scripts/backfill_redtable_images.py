from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from src.collectors.redtable_images import collect_all
from src.db.connection import get_connection
from src.utils.logging import get_logger

logger = get_logger(__name__)


def main() -> int:
    load_dotenv()
    api_key = os.getenv("REDTABLE_API_KEY", "").strip()
    if not api_key:
        logger.error("REDTABLE_API_KEY가 .env에 없습니다.")
        return 2

    with get_connection() as conn:
        records = collect_all(api_key, conn=conn)

        jongno_records = [r for r in records if "종로구" in (r.get("AREA_NM") or "")]
        logger.info(f"종로구 이미지 레코드: {len(jongno_records)} / 전체 {len(records)}")

        updated = 0
        no_place = 0
        with conn.cursor() as cur:
            for record in jongno_records:
                rstr_id = str(record.get("RSTR_ID"))
                url = (record.get("RSTR_IMG_URL") or "").strip()
                if not url:
                    continue
                cur.execute(
                    "SELECT place_id FROM place_source WHERE source='REDTABLE' AND source_id=%s",
                    (rstr_id,),
                )
                row = cur.fetchone()
                if row is None:
                    no_place += 1
                    continue
                place_id = row[0]
                cur.execute(
                    """
                    UPDATE place
                    SET image_url = %s,
                        image_source = %s,
                        image_attribution = %s
                    WHERE id = %s
                      AND image_url IS NULL
                    """,
                    (url, "REDTABLE", "서울 음식관광 OpenAPI(RedTable)", place_id),
                )
                if cur.rowcount:
                    updated += 1
        conn.commit()

    logger.info(f"place 대표 이미지 update: {updated}건, place_source 매칭 안 됨(스킵): {no_place}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
