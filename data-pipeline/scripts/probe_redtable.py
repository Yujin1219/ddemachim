"""RedTable /api/rstr 실제 응답 구조를 1회 호출로 확인하는 일회성 점검 스크립트.

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

BASE_URL = "https://seoul.openapi.redtable.global/api/rstr"


def main() -> int:
    api_key = os.getenv("REDTABLE_API_KEY", "").strip()
    if not api_key:
        print("오류: REDTABLE_API_KEY가 .env에 없습니다.", file=sys.stderr)
        return 2

    params = {"serviceKey": api_key, "pageNo": 1}
    try:
        response = requests.get(BASE_URL, params=params, timeout=15)
    except requests.RequestException as exc:
        print(f"요청 실패: {exc}", file=sys.stderr)
        return 1

    print(f"HTTP status: {response.status_code}")
    print(f"요청 URL(키 제외): {BASE_URL}?pageNo=1&serviceKey=****")

    try:
        payload = response.json()
    except ValueError:
        print("JSON 파싱 실패. 응답 본문(앞 500자):")
        print(response.text[:500])
        return 1

    header = payload.get("header", {})
    body = payload.get("body", [])
    print(f"header: {json.dumps(header, ensure_ascii=False)}")
    print(f"body 건수(이번 응답): {len(body)}")

    if body:
        first = body[0]
        print(f"첫 번째 레코드 필드 목록: {sorted(first.keys())}")
        print(f"첫 번째 레코드 내용: {json.dumps(first, ensure_ascii=False, indent=2)}")

        area_values = {row.get("RSTR_AREA_CLSF_NM") for row in body}
        print(f"이번 페이지 RSTR_AREA_CLSF_NM 값 집합: {area_values}")

        addr_has_jongno = sum(
            1
            for row in body
            if "종로구" in (row.get("RSTR_RDNMADR") or "") or "종로구" in (row.get("RSTR_LNNO_ADRES") or "")
        )
        print(f"이번 페이지 중 주소에 '종로구' 포함된 건수: {addr_has_jongno} / {len(body)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
