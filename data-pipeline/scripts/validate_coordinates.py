"""place 테이블 좌표가 실제 주소와 일치하는지 카카오 역지오코딩으로 표본 검증하는 일회성 점검 스크립트."""
from __future__ import annotations

import os
import random
import time

import psycopg
import requests
from dotenv import load_dotenv

load_dotenv(".env")

SAMPLE_SIZE = 150


def main() -> int:
    kakao_key = os.getenv("KAKAO_REST_API_KEY", "").strip()
    conn = psycopg.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, name, road_address, lot_address, district,
               ST_X(location::geometry), ST_Y(location::geometry)
        FROM place
        WHERE location IS NOT NULL
        ORDER BY random()
        LIMIT %s
        """,
        (SAMPLE_SIZE,),
    )
    rows = cur.fetchall()

    mismatches = []
    matched = 0
    checked = 0

    for place_id, name, road_addr, lot_addr, district, lng, lat in rows:
        try:
            resp = requests.get(
                "https://dapi.kakao.com/v2/local/geo/coord2address.json",
                params={"x": lng, "y": lat},
                headers={"Authorization": f"KakaoAK {kakao_key}"},
                timeout=10,
            )
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            print(f"  요청 실패 (id={place_id}): {exc}")
            continue

        docs = data.get("documents", [])
        if not docs:
            mismatches.append((place_id, name, road_addr, "역지오코딩 결과 없음"))
            checked += 1
            continue

        doc = docs[0]
        road = doc.get("road_address") or {}
        addr = doc.get("address") or {}
        kakao_gu = road.get("region_2depth_name") or addr.get("region_2depth_name")
        kakao_dong = addr.get("region_3depth_name")

        checked += 1
        # 구 단위 일치 여부로 판정 (가장 기본적인 정확도 지표)
        if kakao_gu and district and kakao_gu == district:
            matched += 1
        elif kakao_gu and district and kakao_gu != district:
            mismatches.append((place_id, name, f"저장된 구={district}", f"실제 구={kakao_gu} ({kakao_dong})"))
        else:
            mismatches.append((place_id, name, f"district={district}", f"kakao_gu={kakao_gu}"))

        time.sleep(0.05)

    print(f"\n검증 완료: {checked}건 중 구(district) 일치 {matched}건 ({matched/checked*100:.1f}%)")
    print(f"불일치 {len(mismatches)}건:")
    for pid, name, a, b in mismatches[:30]:
        print(f"  [id={pid}] {name}: {a} vs {b}")

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
