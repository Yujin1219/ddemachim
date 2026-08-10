from __future__ import annotations

import csv
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg

from src.db.raw_repository import insert_source_raw_data
from src.utils.logging import get_logger

logger = get_logger(__name__)

RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "filming_location"

# 데이터 출처: 공공데이터포털(data.go.kr) "한국문화정보원_미디어콘텐츠 영상 촬영지 데이터_20221125"
# https://www.data.go.kr/data/15111405/fileData.do
# 이 데이터셋은 fileData(정적 CSV) 방식으로만 제공되고(openapi 버전 없음), 페이지 안내대로
# 로그인 없이 다운로드된다. 실호출로 다운로드 URL을 확인함:
#   https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003000299&fileDetailSn=1&insertDataPrcus=N
# 파일 자체는 수시 갱신되는 API가 아니라 1회성 정적 데이터라, seoul_tour.py와 동일하게
# 로컬에 내려받은 CSV 파일 경로를 .env(FILMING_LOCATION_CSV_PATH)로 받는 방식을 쓴다.
# 인코딩은 실제로 열어 확인한 결과 CP949였다(UTF-8 디코드 실패 확인).


def collect_all(csv_path: str | None = None, conn: psycopg.Connection | None = None) -> list[dict[str, Any]]:
    """한국문화정보원 미디어콘텐츠 영상 촬영지 CSV(CP949)를 읽어 전체 행을 반환한다.

    이 데이터는 "촬영지(장소) + 어떤 작품에서 촬영했는지"가 한 행에 같이 들어있다
    (연번 단위 = 장소x작품 조합 1건). 정적 파일이라 페이지네이션이 없다 — 기존 seoul_tour.py와
    동일하게 UTF-8 재저장 사본을 남기고 source_raw_data에도 1건 기록한다.
    """
    path = Path(csv_path or os.getenv("FILMING_LOCATION_CSV_PATH", "")).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"FILMING_LOCATION_CSV_PATH 파일을 찾을 수 없습니다: {path}")

    requested_at = datetime.now(timezone.utc)
    raw_bytes = path.read_bytes()
    text = raw_bytes.decode("cp949")
    reader = csv.DictReader(io.StringIO(text))
    all_rows = list(reader)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    utf8_copy_path = RAW_DIR / f"{requested_at.strftime('%Y%m%dT%H%M%SZ')}_filming_location_utf8.json"
    utf8_copy_path.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding="utf-8")

    if conn is not None:
        insert_source_raw_data(
            conn,
            source="FILMING_LOCATION",
            endpoint=str(path),
            requested_at=requested_at,
            query_condition={"file": path.name, "encoding": "cp949"},
            page=None,
            raw_payload={"row_count": len(all_rows), "rows": all_rows},
        )
        conn.commit()

    logger.info(f"한국문화정보원 촬영지 CSV 읽음: 전체 {len(all_rows)}행")
    return all_rows
