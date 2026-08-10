"""이미 수집된 TourAPI raw 파일(areaBasedList2)에서 firstimage/firstimage2를 꺼내
place_image에 채운다. 추가 API 호출 없음 - 기존 raw 데이터 재사용.
"""
from __future__ import annotations

import glob
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.connection import get_connection
from src.utils.logging import get_logger

logger = get_logger(__name__)

RAW_GLOB = str(Path(__file__).resolve().parent.parent / "data" / "raw" / "tourapi" / "*areaBasedList2*.json")


def collect_images() -> dict[str, list[str]]:
    """contentid -> [firstimage, firstimage2] (빈 문자열/중복 제외)"""
    images: dict[str, list[str]] = {}
    for path in glob.glob(RAW_GLOB):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        items = data["response"]["response"]["body"]["items"]["item"]
        if isinstance(items, dict):
            items = [items]
        for item in items:
            content_id = item.get("contentid")
            if not content_id:
                continue
            urls = images.setdefault(content_id, [])
            for key in ("firstimage", "firstimage2"):
                url = (item.get(key) or "").strip()
                if url and url not in urls:
                    urls.append(url)
    return images


def main() -> int:
    images_by_content_id = collect_images()
    logger.info(f"raw 파일에서 이미지 있는 contentid {len(images_by_content_id)}건 확인")

    inserted = 0
    no_place = 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            for content_id, urls in images_by_content_id.items():
                cur.execute(
                    "SELECT place_id FROM place_source WHERE source='TOURAPI' AND source_id=%s",
                    (content_id,),
                )
                row = cur.fetchone()
                if row is None:
                    no_place += 1
                    continue
                place_id = row[0]
                for url in urls:
                    cur.execute(
                        """
                        INSERT INTO place_image (place_id, source, source_url, attribution)
                        SELECT %s, 'TOURAPI', %s, '한국관광공사 TourAPI'
                        WHERE NOT EXISTS (
                            SELECT 1 FROM place_image WHERE place_id=%s AND source_url=%s
                        )
                        """,
                        (place_id, url, place_id, url),
                    )
                    if cur.rowcount:
                        inserted += 1
        conn.commit()

    logger.info(f"place_image 신규 insert: {inserted}건, place_source 매칭 안 됨(스킵): {no_place}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
