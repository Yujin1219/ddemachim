"""TourAPI(KorService2) 실제 응답 구조를 확인하는 일회성 점검 스크립트.

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

BASE_URL = "https://apis.data.go.kr/B551011/KorService2"


def call(operation: str, extra_params: dict) -> dict:
    api_key = os.getenv("TOUR_API_KEY", "").strip()
    params = {
        "serviceKey": api_key,
        "MobileOS": "ETC",
        "MobileApp": "ddemachim",
        "_type": "json",
        **extra_params,
    }
    response = requests.get(f"{BASE_URL}/{operation}", params=params, timeout=15)
    print(f"\n=== {operation} ===")
    print(f"HTTP status: {response.status_code}")
    try:
        payload = response.json()
    except ValueError:
        print("JSON 파싱 실패, 응답 앞 500자:")
        print(response.text[:500])
        return {}
    print(json.dumps(payload, ensure_ascii=False, indent=2)[:2000])
    return payload


def main() -> int:
    if not os.getenv("TOUR_API_KEY", "").strip():
        print("오류: TOUR_API_KEY가 .env에 없습니다.", file=sys.stderr)
        return 2

    # 1) areaCode2로 서울(1) 하위 시군구 코드 목록 -> 종로구 코드 확인
    call("areaCode2", {"areaCode": 1, "numOfRows": 30, "pageNo": 1})

    # 2) areaBasedList2로 서울 지역 관광지 1건만 시험 조회 (sigunguCode 없이 우선)
    call("areaBasedList2", {"areaCode": 1, "numOfRows": 3, "pageNo": 1, "contentTypeId": 12})

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
