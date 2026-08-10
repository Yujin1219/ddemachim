from __future__ import annotations

import csv
import io
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg

from src.db.raw_repository import insert_source_raw_data
from src.utils.logging import get_logger

logger = get_logger(__name__)

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "seoul_tour"


def collect_all(csv_path: str | None = None, conn: psycopg.Connection | None = None) -> list[dict[str, Any]]:
    """서울시 관광 명소 CSV(CP949)를 읽어 언어='ko' 행만 반환한다.

    이 데이터는 정적 파일이라 페이지네이션이 없다. API 소스와 동일한 흐름을 맞추기 위해
    UTF-8로 재저장한 raw 사본을 남기고 source_raw_data에도 1건 기록한다.
    """
    path = Path(csv_path or os.getenv("SEOUL_TOUR_CSV_PATH", "")).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"SEOUL_TOUR_CSV_PATH 파일을 찾을 수 없습니다: {path}")

    requested_at = datetime.now(timezone.utc)
    raw_bytes = path.read_bytes()
    text = raw_bytes.decode("cp949")
    reader = csv.DictReader(io.StringIO(text))
    all_rows = list(reader)
    ko_rows = [row for row in all_rows if row.get("언어") == "ko"]

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    utf8_copy_path = RAW_DIR / f"{requested_at.strftime('%Y%m%dT%H%M%SZ')}_seoul_tour_utf8.json"
    import json

    utf8_copy_path.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")

    if conn is not None:
        insert_source_raw_data(
            conn,
            source="SEOUL_TOUR",
            endpoint=str(path),
            requested_at=requested_at,
            query_condition={"file": path.name, "encoding": "cp949"},
            page=None,
            raw_payload={"row_count": len(all_rows), "ko_row_count": len(ko_rows), "rows": all_rows},
        )
        conn.commit()

    logger.info(f"서울시 관광명소 CSV 읽음: 전체 {len(all_rows)}행, 언어=ko {len(ko_rows)}행")
    return ko_rows
