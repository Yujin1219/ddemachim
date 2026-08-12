"""우리 DB에 있는 REDTABLE 식당들(RSTR_ID) 기준으로,
RedTable 메뉴/사진/운영/품질 API에 실제로 데이터가 얼마나 있는지 커버리지를 확인하는 일회성 점검 스크립트.

전체 페이지를 순회하며 우리 RSTR_ID 집합과 매칭되는 레코드만 집계한다.
"""
from __future__ import annotations

import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

BASE = "https://seoul.openapi.redtable.global"
ENDPOINTS = {
    "menu_korean": f"{BASE}/api/menu/korean",
    "menu_dscrn_korean": f"{BASE}/api/menu-dscrn/korean",
    "food_img": f"{BASE}/api/food/img",
    "rstr_img": f"{BASE}/api/rstr/img",
    "rstr_oprt": f"{BASE}/api/rstr/oprt",
    "rstr_qlt": f"{BASE}/api/rstr/qlt",
}


def load_our_ids() -> set[str]:
    with open("/tmp/our_rstr_ids.txt") as f:
        return {line.strip() for line in f if line.strip()}


def scan_endpoint(name: str, url: str, api_key: str, our_ids: set[str]) -> dict:
    matched_ids = set()
    matched_records = 0
    total_records = 0
    page_no = 1
    total_count = None

    while True:
        try:
            resp = requests.get(url, params={"serviceKey": api_key, "pageNo": page_no}, timeout=20)
            payload = resp.json()
        except (requests.RequestException, ValueError) as exc:
            print(f"[{name}] page {page_no} 요청 실패: {exc}", flush=True)
            time.sleep(1)
            continue

        header = payload.get("header", {})
        body = payload.get("body", [])
        if total_count is None:
            total_count = header.get("totalCount", 0)
            print(f"[{name}] 전체 {total_count}건, 시작", flush=True)

        if not body:
            break

        for row in body:
            rid = str(row.get("RSTR_ID"))
            total_records += 1
            if rid in our_ids:
                matched_ids.add(rid)
                matched_records += 1

        if page_no % 50 == 0 or page_no == 1:
            print(f"[{name}] page {page_no} 처리중... 누적매칭식당={len(matched_ids)}, 누적매칭레코드={matched_records}", flush=True)

        if total_count is not None and total_records >= total_count:
            break
        page_no += 1
        time.sleep(0.15)

    return {
        "endpoint": name,
        "total_records": total_records,
        "matched_records": matched_records,
        "matched_restaurants": len(matched_ids),
        "matched_ids": matched_ids,
    }


def main() -> int:
    api_key = os.getenv("REDTABLE_API_KEY", "").strip()
    if not api_key:
        print("오류: REDTABLE_API_KEY가 .env에 없습니다.", file=sys.stderr)
        return 2

    our_ids = load_our_ids()
    print(f"우리 DB 식당 수: {len(our_ids)}", flush=True)

    results = {}
    for name, url in ENDPOINTS.items():
        result = scan_endpoint(name, url, api_key, our_ids)
        results[name] = result
        print(
            f"=== [{name}] 완료: 전체 {result['total_records']}건 중 우리 식당 매칭 "
            f"{result['matched_restaurants']}/{len(our_ids)}개 식당, {result['matched_records']}개 레코드 ===",
            flush=True,
        )

    print("\n\n===== 최종 요약 =====", flush=True)
    for name, result in results.items():
        pct = result["matched_restaurants"] / len(our_ids) * 100
        print(f"{name:20s}: {result['matched_restaurants']:5d}/{len(our_ids)}개 식당 ({pct:.1f}%), 레코드 {result['matched_records']}건", flush=True)

    out_path = Path("/tmp/redtable_coverage_result.json")
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(
            {name: {k: v for k, v in r.items() if k != "matched_ids"} for name, r in results.items()},
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"\n결과 저장: {out_path}", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
