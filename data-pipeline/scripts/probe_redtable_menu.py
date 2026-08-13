"""RedTable 메뉴/사진/운영/품질 API 실제 응답 구조를 1회 호출로 확인하는 일회성 점검 스크립트.

/api/rstr에서 종로구 식당 1건의 RSTR_ID를 뽑아, 그 ID로
메뉴/메뉴사진/메뉴설명/운영정보/품질정보 API를 호출해 응답 구조를 찍어본다.

서비스키는 .env에서만 읽고 절대 로그/출력에 노출하지 않는다.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

BASE = "https://seoul.openapi.redtable.global"
RSTR_LIST_URL = f"{BASE}/api/rstr"

ENDPOINTS = {
    "메뉴(한국어)": f"{BASE}/api/menu/korean",
    "메뉴설명(한국어)": f"{BASE}/api/menu-dscrn/korean",
    "음식이미지": f"{BASE}/api/food/img",
    "식당이미지": f"{BASE}/api/rstr/img",
    "식당운영정보": f"{BASE}/api/rstr/oprt",
    "식당품질정보": f"{BASE}/api/rstr/qlt",
}

# RSTR_ID를 넘길 때 쓸 파라미터명 후보 (문서에 명시 안 돼 있어 순서대로 시도)
ID_PARAM_CANDIDATES = ["rstrId", "RSTR_ID", "rstr_id", "rstrID"]


def call(url: str, api_key: str, extra_params: dict) -> dict:
    params = {"serviceKey": api_key, **extra_params}
    try:
        resp = requests.get(url, params=params, timeout=15)
    except requests.RequestException as exc:
        return {"error": str(exc)}
    try:
        return {"status": resp.status_code, "json": resp.json()}
    except ValueError:
        return {"status": resp.status_code, "text": resp.text[:500]}


def main() -> int:
    api_key = os.getenv("REDTABLE_API_KEY", "").strip()
    if not api_key:
        print("오류: REDTABLE_API_KEY가 .env에 없습니다.", file=sys.stderr)
        return 2

    # 1) 종로구 식당 1건의 RSTR_ID 확보
    list_resp = call(RSTR_LIST_URL, api_key, {"pageNo": 1})
    body = list_resp.get("json", {}).get("body", [])
    target = None
    for row in body:
        addr = (row.get("RSTR_RDNMADR") or "") + (row.get("RSTR_LNNO_ADRES") or "")
        if "종로구" in addr:
            target = row
            break
    if target is None and body:
        target = body[0]

    if target is None:
        print("식당 목록을 가져오지 못했습니다.")
        print(json.dumps(list_resp, ensure_ascii=False, indent=2)[:1000])
        return 1

    rstr_id = target.get("RSTR_ID")
    print(f"대상 식당: {target.get('RSTR_NM')} (RSTR_ID={rstr_id})")
    print(f"기본정보 필드 목록: {sorted(target.keys())}")
    print("-" * 80)

    # 2) 각 엔드포인트에 대해 파라미터명 후보를 순서대로 시도
    for label, url in ENDPOINTS.items():
        print(f"### {label} ({url})")
        success = False
        for id_param in ID_PARAM_CANDIDATES:
            result = call(url, api_key, {id_param: rstr_id, "pageNo": 1})
            body = result.get("json", {}).get("body") if isinstance(result.get("json"), dict) else None
            header = result.get("json", {}).get("header") if isinstance(result.get("json"), dict) else None
            if body:
                print(f"  성공 (파라미터명={id_param}) status={result.get('status')}")
                print(f"  header: {json.dumps(header, ensure_ascii=False)}")
                first = body[0] if isinstance(body, list) else body
                print(f"  첫 레코드 필드: {sorted(first.keys()) if isinstance(first, dict) else type(first)}")
                print(f"  첫 레코드 내용:\n{json.dumps(first, ensure_ascii=False, indent=2)}")
                success = True
                break
            elif result.get("status") == 200 and header is not None:
                # 200이지만 body가 비어있는 경우 - 파라미터명은 맞을 수 있음, 기록만 하고 계속 시도
                print(f"  파라미터명={id_param}: status=200이나 body 비어있음, header={json.dumps(header, ensure_ascii=False)}")
        if not success:
            print("  모든 파라미터명 후보 실패 또는 데이터 없음")
        print("-" * 80)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
