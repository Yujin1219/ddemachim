"""이미 수집된 TourAPI raw 파일(areaBasedList2)에서 대표 이미지를 꺼내
place에 채운다. 추가 API 호출 없음 - 기존 raw 데이터 재사용.
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

    updated = 0
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
                if not urls:
                    continue
                cur.execute(
                    """
                    UPDATE place
                    SET image_url = %s,
                        image_source = %s,
                        image_attribution = %s
                    WHERE id = %s
                      AND image_url IS NULL
                    """,
                    (urls[0], "TOURAPI", "한국관광공사 TourAPI", place_id),
                )
                if cur.rowcount:
                    updated += 1
        conn.commit()

    logger.info(f"place 대표 이미지 update: {updated}건, place_source 매칭 안 됨(스킵): {no_place}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
