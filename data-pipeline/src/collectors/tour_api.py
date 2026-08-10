from __future__ import annotations

import json
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

BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
RAW_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "tourapi"

SEOUL_AREA_CODE = 1
JONGNO_SIGUNGU_CODE = 23  # areaCode2(areaCode=1) 실호출로 확인된 종로구 코드

# 실호출로 확인된 값(종로구 기준 totalCount, 2026-08-10):
# 12 관광지=73, 14 문화시설=59, 15 축제공연행사=13(장소가 아니라 이벤트라 별도 처리),
# 38 쇼핑=24, 39 음식점=75. 25 여행코스=0, 28 레포츠=1, 32 숙박=58은 1차 범위 밖.
PLACE_CONTENT_TYPE_IDS = [12, 14, 38, 39]
EVENT_CONTENT_TYPE_ID = 15  # 축제/공연/행사 — place가 아니라 event 테이블용


def _base_params(api_key: str) -> dict[str, Any]:
    return {
        "serviceKey": api_key,
        "MobileOS": "ETC",
        "MobileApp": "ddemachim",
        "_type": "json",
    }


@dataclass
class CollectResult:
    records: list[dict[str, Any]]  # areaBasedList2 item + overview 병합된 원본


def _save_raw(operation: str, page_no: int, content_type_id: int, requested_at: datetime, payload: dict) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{requested_at.strftime('%Y%m%dT%H%M%SZ')}_{operation}_ct{content_type_id}_page{page_no:04d}.json"
    (RAW_DIR / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_area_based_list(
    api_key: str,
    content_type_id: int,
    conn: psycopg.Connection | None = None,
    request_delay: float = 0.2,
) -> list[dict[str, Any]]:
    """areaBasedList2로 종로구+contentTypeId 조합의 항목을 전량 수집한다."""
    items: list[dict[str, Any]] = []
    page_no = 1
    num_of_rows = 100

    while True:
        requested_at = datetime.now(timezone.utc)
        params = {
            **_base_params(api_key),
            "areaCode": SEOUL_AREA_CODE,
            "sigunguCode": JONGNO_SIGUNGU_CODE,
            "contentTypeId": content_type_id,
            "numOfRows": num_of_rows,
            "pageNo": page_no,
        }
        response = get_with_retry(f"{BASE_URL}/areaBasedList2", params=params)
        payload = response.json()

        result_code = payload.get("response", {}).get("header", {}).get("resultCode")
        if result_code != "0000":
            logger.warning(f"areaBasedList2 오류 응답(contentTypeId={content_type_id}): {payload}")
            break

        body = payload.get("response", {}).get("body", {})
        total_count = body.get("totalCount", 0)
        page_items = body.get("items", {}).get("item", []) if total_count else []
        if isinstance(page_items, dict):  # 1건일 때 item이 dict로 오는 경우 대응
            page_items = [page_items]

        _save_raw(
            "areaBasedList2",
            page_no,
            content_type_id,
            requested_at,
            {"query": params, "response": payload},
        )
        if conn is not None:
            insert_source_raw_data(
                conn,
                source="TOURAPI",
                endpoint=f"{BASE_URL}/areaBasedList2",
                requested_at=requested_at,
                query_condition={"contentTypeId": content_type_id, "pageNo": page_no},
                page=page_no,
                raw_payload=payload,
            )
            conn.commit()

        items.extend(page_items)
        logger.info(f"TourAPI areaBasedList2 contentTypeId={content_type_id} page {page_no} ({len(page_items)}건, 누적 {len(items)}/{total_count})")

        if not page_items or len(items) >= total_count:
            break

        if request_delay:
            time.sleep(request_delay)
        page_no += 1

    return items


def fetch_overview(api_key: str, content_id: str, conn: psycopg.Connection | None = None, request_delay: float = 0.15) -> str | None:
    """detailCommon2로 개별 항목의 overview(설명)를 가져온다. contentId만 필요(다른 YN 플래그는 오류남)."""
    requested_at = datetime.now(timezone.utc)
    params = {**_base_params(api_key), "contentId": content_id}
    response = get_with_retry(f"{BASE_URL}/detailCommon2", params=params)
    payload = response.json()

    if request_delay:
        time.sleep(request_delay)

    result_code = payload.get("response", {}).get("header", {}).get("resultCode")
    if result_code != "0000":
        return None

    if conn is not None:
        insert_source_raw_data(
            conn,
            source="TOURAPI",
            endpoint=f"{BASE_URL}/detailCommon2",
            requested_at=requested_at,
            query_condition={"contentId": content_id},
            page=None,
            raw_payload=payload,
        )
        conn.commit()

    items = payload.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]
    if not items:
        return None
    return items[0].get("overview")


# contentTypeId별로 운영시간/휴무일 필드명이 다르다(실호출로 확인, 2026-08-10).
INTRO_HOURS_FIELDS: dict[int, tuple[str, str]] = {
    12: ("usetime", "restdate"),
    14: ("usetimeculture", "restdateculture"),
    38: ("opentime", "restdateshopping"),
    39: ("opentimefood", "restdatefood"),
}


def fetch_intro(
    api_key: str,
    content_id: str,
    content_type_id: int,
    conn: psycopg.Connection | None = None,
    request_delay: float = 0.15,
) -> dict[str, Any] | None:
    """detailIntro2로 운영시간/휴무일 등 contentTypeId별 소개정보를 가져온다."""
    requested_at = datetime.now(timezone.utc)
    params = {**_base_params(api_key), "contentId": content_id, "contentTypeId": content_type_id}
    response = get_with_retry(f"{BASE_URL}/detailIntro2", params=params)
    payload = response.json()

    if request_delay:
        time.sleep(request_delay)

    result_code = payload.get("response", {}).get("header", {}).get("resultCode")
    if result_code != "0000":
        return None

    if conn is not None:
        insert_source_raw_data(
            conn,
            source="TOURAPI",
            endpoint=f"{BASE_URL}/detailIntro2",
            requested_at=requested_at,
            query_condition={"contentId": content_id, "contentTypeId": content_type_id},
            page=None,
            raw_payload=payload,
        )
        conn.commit()

    items = payload.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]
    if not items:
        return None
    return items[0]


def collect_events(
    api_key: str,
    conn: psycopg.Connection | None = None,
) -> list[dict[str, Any]]:
    """종로구 축제/공연/행사(contentTypeId=15) areaBasedList2 + detailIntro2(eventstartdate/eventenddate 등) 병합."""
    items = collect_area_based_list(api_key, EVENT_CONTENT_TYPE_ID, conn=conn)

    for item in items:
        content_id = item.get("contentid")
        if not content_id:
            continue
        intro = fetch_intro(api_key, content_id, EVENT_CONTENT_TYPE_ID, conn=conn)
        if intro:
            item.update(intro)

    return items


def collect_all(
    api_key: str,
    content_type_ids: list[int] | None = None,
    conn: psycopg.Connection | None = None,
    fetch_overviews: bool = True,
) -> CollectResult:
    content_type_ids = content_type_ids or PLACE_CONTENT_TYPE_IDS
    all_items: list[dict[str, Any]] = []

    for content_type_id in content_type_ids:
        items = collect_area_based_list(api_key, content_type_id, conn=conn)
        all_items.extend(items)

    if fetch_overviews:
        for item in all_items:
            content_id = item.get("contentid")
            if not content_id:
                continue
            item["overview"] = fetch_overview(api_key, content_id, conn=conn)

    return CollectResult(records=all_items)
