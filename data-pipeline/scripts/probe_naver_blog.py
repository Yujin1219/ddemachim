"""네이버 블로그 검색 API로 특정 장소에 대한 실제 블로그 언급 데이터를 1회 호출로 확인하는 점검 스크립트.

'요즘 뜨는 장소' 큐레이션 설계 전, 실제 응답 구조(title, description, bloggername,
postdate, link)와 최신 언급 빈도를 먼저 확인한다.

서비스 키는 .env에서만 읽고 절대 로그/출력에 노출하지 않는다.
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

BLOG_SEARCH_URL = "https://naverapihub.apigw.ntruss.com/search/v1/blog"

# DB에서 뽑은 실제 장소명 샘플
QUERIES = ["어부가 종로구", "커핀그루나루 청와대정문점"]


def search_blog(client_id: str, client_secret: str, query: str, display: int = 10, sort: str = "date") -> dict:
    headers = {
        "X-NCP-APIGW-API-KEY-ID": client_id,
        "X-NCP-APIGW-API-KEY": client_secret,
    }
    resp = requests.get(
        BLOG_SEARCH_URL,
        params={"query": query, "display": display, "sort": sort},
        headers=headers,
        timeout=10,
    )
    return {"status": resp.status_code, "json": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text}


def main() -> int:
    client_id = os.getenv("NAVER_API_HUB_CLIENT_ID", "").strip()
    client_secret = os.getenv("NAVER_API_HUB_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        print("오류: NAVER_API_HUB_CLIENT_ID/SECRET이 .env에 없습니다.", file=sys.stderr)
        return 2

    for query in QUERIES:
        print(f"=== 검색어: {query} ===")
        result = search_blog(client_id, client_secret, query)
        print(f"status={result['status']}")
        body = result["json"]
        if isinstance(body, dict):
            print(f"total={body.get('total')}, display={body.get('display')}")
            items = body.get("items", [])
            print(f"필드 목록(첫 항목): {sorted(items[0].keys()) if items else 'N/A'}")
            print(json.dumps(items[:3], ensure_ascii=False, indent=2))
        else:
            print(body[:500])
        print("-" * 80)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
