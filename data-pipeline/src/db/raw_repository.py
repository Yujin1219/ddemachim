from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import psycopg


def insert_source_raw_data(
    conn: psycopg.Connection,
    source: str,
    endpoint: str,
    requested_at: datetime,
    query_condition: dict[str, Any],
    page: int | None,
    raw_payload: dict[str, Any],
) -> int:
    """원본 응답 1페이지 분량을 그대로 보존한다. place_source_id는 페이지 단위라 항상 NULL —
    한 페이지에 여러 place가 섞여 있어 특정 place_source 1건에 귀속시킬 수 없다."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO source_raw_data (source, endpoint, requested_at, query_condition, page, raw_payload)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                source,
                endpoint,
                requested_at,
                json.dumps(query_condition, ensure_ascii=False),
                page,
                json.dumps(raw_payload, ensure_ascii=False),
            ),
        )
        (row_id,) = cur.fetchone()
    return row_id
