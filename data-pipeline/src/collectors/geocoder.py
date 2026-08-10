from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import psycopg
import requests

from src.db.raw_repository import insert_source_raw_data
from src.utils.logging import get_logger

logger = get_logger(__name__)

BASE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


def geocode_address(
    address: str,
    api_key: str,
    conn: psycopg.Connection | None = None,
    request_delay: float = 0.1,
) -> tuple[float, float] | None:
    """카카오 주소검색 API로 도로명/지번 주소를 좌표로 변환한다. x=경도, y=위도(실호출로 확인됨).

    좌표를 자체 제공하지 않는 소스(서울시 관광명소 등)의 정확한 주소만 지오코딩 대상으로 삼는다.
    검색 결과가 없으면 None — 주소를 임의 보정하거나 좌표를 추정하지 않는다.
    """
    requested_at = datetime.now(timezone.utc)
    try:
        response = requests.get(
            BASE_URL,
            params={"query": address},
            headers={"Authorization": f"KakaoAK {api_key}"},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning(f"지오코딩 요청 실패({address}): {exc}")
        return None

    payload = response.json()

    if conn is not None:
        insert_source_raw_data(
            conn,
            source="KAKAO_GEOCODE",
            endpoint=BASE_URL,
            requested_at=requested_at,
            query_condition={"query": address},
            page=None,
            raw_payload=payload,
        )
        conn.commit()

    if request_delay:
        time.sleep(request_delay)

    documents = payload.get("documents", [])
    if not documents:
        return None

    doc = documents[0]
    try:
        lat = float(doc["y"])
        lng = float(doc["x"])
    except (KeyError, ValueError, TypeError):
        return None
    return lat, lng
