from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg

from src.db.raw_repository import insert_source_raw_data
from src.utils.http import get_with_retry
from src.utils.logging import get_logger

logger = get_logger(__name__)

BASE_URL = "https://seoul.openapi.redtable.global/api/rstr"
RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "redtable"


@dataclass
class CollectResult:
    records: list[dict[str, Any]]
    total_count: int
    pages_fetched: int


def collect_all(
    api_key: str,
    max_pages: int | None = None,
    request_delay: float = 0.3,
    conn: psycopg.Connection | None = None,
) -> CollectResult:
    """RedTable /api/rstr을 totalCount에 도달할 때까지 pageNo를 늘려가며 전량 수집한다.

    페이지당 실제 반환 건수는 응답 header.numOfRows로 서버가 정하며(요청 파라미터로 제어 불가,
    실제 호출 결과 1000건/페이지로 확인됨), 클라이언트는 pageNo만 증가시킨다.
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    page_no = 1
    total_count: int | None = None

    while True:
        requested_at = datetime.now(timezone.utc)
        response = get_with_retry(BASE_URL, params={"serviceKey": api_key, "pageNo": page_no})
        payload = response.json()

        header = payload.get("header", {})
        body = payload.get("body", [])
        if total_count is None:
            total_count = header.get("totalCount", 0)
            logger.info(f"RedTable 전체 건수: {total_count}")

        _save_raw_page(page_no, requested_at, header, body)

        if conn is not None:
            insert_source_raw_data(
                conn,
                source="REDTABLE",
                endpoint=BASE_URL,
                requested_at=requested_at,
                query_condition={"pageNo": page_no},
                page=page_no,
                raw_payload={"header": header, "body": body},
            )
            conn.commit()

        records.extend(body)
        logger.info(f"RedTable page {page_no} collected ({len(body)}건, 누적 {len(records)}건)")

        if not body:
            break
        if total_count is not None and len(records) >= total_count:
            break
        if max_pages is not None and page_no >= max_pages:
            logger.info(f"max_pages={max_pages} 도달, 수집 중단")
            break

        if request_delay:
            time.sleep(request_delay)
        page_no += 1

    return CollectResult(records=records, total_count=total_count or 0, pages_fetched=page_no)


def _save_raw_page(page_no: int, requested_at: datetime, header: dict[str, Any], body: list[dict[str, Any]]) -> Path:
    filename = f"{requested_at.strftime('%Y%m%dT%H%M%SZ')}_page{page_no:04d}.json"
    path = RAW_DIR / filename
    raw_record = {
        "source": "REDTABLE",
        "endpoint": BASE_URL,
        "requested_at": requested_at.isoformat(),
        "query_condition": {"pageNo": page_no},
        "page": page_no,
        "header": header,
        "body": body,
    }
    path.write_text(json.dumps(raw_record, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
