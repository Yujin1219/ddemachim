from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import psycopg

from src.db.raw_repository import insert_source_raw_data
from src.utils.http import get_with_retry
from src.utils.logging import get_logger

logger = get_logger(__name__)

BASE_URL = "https://seoul.openapi.redtable.global/api/rstr/img"


def collect_all(api_key: str, conn: psycopg.Connection | None = None, request_delay: float = 0.3) -> list[dict[str, Any]]:
    """RedTable /api/rstr/img을 전량 수집한다. /api/rstr과 동일하게 구 단위 필터 파라미터가 없어
    전국을 받아 클라이언트에서 AREA_NM으로 종로구만 거른다(실호출로 AREA_NM='서울특별시 종로구' 형식 확인됨)."""
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
            logger.info(f"RedTable 이미지 전체 건수: {total_count}")

        if conn is not None:
            insert_source_raw_data(
                conn,
                source="REDTABLE_IMG",
                endpoint=BASE_URL,
                requested_at=requested_at,
                query_condition={"pageNo": page_no},
                page=page_no,
                raw_payload={"header": header, "body": body},
            )
            conn.commit()

        records.extend(body)
        logger.info(f"RedTable 이미지 page {page_no} ({len(body)}건, 누적 {len(records)}/{total_count})")

        if not body or len(records) >= total_count:
            break
        if request_delay:
            time.sleep(request_delay)
        page_no += 1

    return records
