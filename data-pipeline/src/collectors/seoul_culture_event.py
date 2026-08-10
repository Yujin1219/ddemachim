from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg

from src.db.raw_repository import insert_source_raw_data
from src.utils.http import get_with_retry
from src.utils.logging import get_logger

logger = get_logger(__name__)

# 서울 열린데이터광장 "서울시 문화행사 정보"(OA-15486). 실호출로 확인(2026-08-10):
# http://openapi.seoul.go.kr:8088/{KEY}/json/culturalEventInfo/{시작}/{끝}/
# 필터 파라미터(GUNAME 등) 위치 지정 방식은 확인 안 됨 -> 전체를 페이지네이션으로 받고
# GUNAME='종로구'는 클라이언트에서 필터링한다(추측성 파라미터 사용 안 함).
BASE_URL = "http://openapi.seoul.go.kr:8088"
SERVICE = "culturalEventInfo"
PAGE_SIZE = 1000  # 실호출로 확인: sample키는 최대 5, 정식키 한도는 1000으로 시도(초과시 서버가 에러로 알려줌)
RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "seoul_culture_event"


def _save_raw(page_no: int, requested_at: datetime, payload: dict) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{requested_at.strftime('%Y%m%dT%H%M%SZ')}_page{page_no:04d}.json"
    (RAW_DIR / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_all(
    api_key: str,
    conn: psycopg.Connection | None = None,
    request_delay: float = 0.2,
) -> list[dict[str, Any]]:
    """culturalEventInfo 전체(서울 전역)를 페이지네이션으로 수집한다. 자치구 필터는 normalizer에서."""
    items: list[dict[str, Any]] = []
    start = 1
    page_no = 1

    while True:
        end = start + PAGE_SIZE - 1
        url = f"{BASE_URL}/{api_key}/json/{SERVICE}/{start}/{end}/"
        requested_at = datetime.now(timezone.utc)
        response = get_with_retry(url, params={})
        payload = response.json()

        body = payload.get(SERVICE, {})
        # 정상 응답은 {"culturalEventInfo": {"RESULT": {...}, "row": [...]}} 구조지만,
        # 에러 응답(인증 실패, 요청 범위 초과 등)은 최상위에 바로 {"RESULT": {...}}로 온다(실호출로 확인).
        result = body.get("RESULT") or payload.get("RESULT", {})
        result_code = result.get("CODE")
        if result_code != "INFO-000":
            logger.warning(f"culturalEventInfo 오류/종료 응답(page {page_no}): {result_code} {result.get('MESSAGE')}")
            break

        total_count = body.get("list_total_count", 0)
        page_items = body.get("row", [])

        _save_raw(page_no, requested_at, payload)
        if conn is not None:
            insert_source_raw_data(
                conn,
                source="SEOUL_CULTURE_EVENT",
                endpoint=url.replace(api_key, "****"),
                requested_at=requested_at,
                query_condition={"start": start, "end": end},
                page=page_no,
                raw_payload=payload,
            )
            conn.commit()

        items.extend(page_items)
        logger.info(f"culturalEventInfo page {page_no} ({len(page_items)}건, 누적 {len(items)}/{total_count})")

        if not page_items or len(items) >= total_count:
            break

        if request_delay:
            time.sleep(request_delay)
        start += PAGE_SIZE
        page_no += 1

    return items
