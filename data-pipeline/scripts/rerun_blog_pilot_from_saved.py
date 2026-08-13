"""저장된 원본 JSON(results/blog_pilot/*.json)을 그대로 사용해 추출/집계/DB매칭만
다시 실행하는 스크립트. blog_trend_pilot.py의 fetch 로직을 재사용하지 않고,
이미 저장된 raw 응답을 읽어 API 쿼터를 절약한다.

blog_trend_pilot.py의 QUERIES 순서에 맞춰 results/blog_pilot/ 안의 최신 파일을
쿼리별로 하나씩 골라 사용한다.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import blog_trend_pilot as pilot  # noqa: E402


def find_latest_file_for_query(query: str) -> Path | None:
    safe_name = re.sub(r"\s+", "_", query.strip())
    safe_name = re.sub(r"[^0-9A-Za-z가-힣_]", "", safe_name)
    candidates = sorted(pilot.RESULTS_DIR.glob(f"{safe_name}_*.json"))
    return candidates[-1] if candidates else None


def main() -> int:
    query_summaries = []
    all_items_with_query: list[tuple[dict, str]] = []

    for query in pilot.QUERIES:
        path = find_latest_file_for_query(query)
        if path is None:
            print(f"오류: 저장된 raw 결과를 찾을 수 없습니다 (query={query})", file=sys.stderr)
            return 2
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("items", [])

        postdates = [pilot.parse_postdate(it.get("postdate", "")) for it in items]
        postdates = [d for d in postdates if d is not None]
        date_range = (min(postdates), max(postdates)) if postdates else (None, None)

        query_summaries.append(
            {
                "query": query,
                "items_fetched": len(items),
                "date_range": date_range,
                "loaded_from": str(path),
            }
        )
        for it in items:
            all_items_with_query.append((it, query))

        print(f"=== 로드: {query} ===")
        print(f"  items={len(items)}, date_range={date_range}, loaded_from={path}")

    aggregation: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"recent_count": 0, "prior_count": 0}
    )
    total_candidates_seen: set[tuple[str, str]] = set()

    for item, query in all_items_with_query:
        region = pilot.extract_region(query)
        postdate = pilot.parse_postdate(item.get("postdate", ""))
        candidates = pilot.extract_candidates(item)
        for candidate in candidates:
            key = (candidate, region)
            total_candidates_seen.add(key)
            aggregation[key]  # ensure entry exists for every candidate, even 0/0 recent+prior
            if postdate is None:
                continue
            if pilot.RECENT_START <= postdate <= pilot.TODAY:
                aggregation[key]["recent_count"] += 1
            elif pilot.PRIOR_START <= postdate < pilot.RECENT_START:
                aggregation[key]["prior_count"] += 1

    rows = []
    for (candidate, region), counts in aggregation.items():
        recent = counts["recent_count"]
        prior = counts["prior_count"]
        if prior > 0:
            growth = round((recent - prior) / prior * 100, 1)
        elif recent > 0:
            growth = "NEW"
        else:
            growth = None
        rows.append(
            {
                "candidate": candidate,
                "region": region,
                "recent_count": recent,
                "prior_count": prior,
                "growth": growth,
            }
        )

    rows.sort(key=lambda r: r["recent_count"], reverse=True)
    top_rows = rows

    db_reason = None
    matches: dict[str, list[dict]] = {}
    if top_rows:
        candidate_names = [r["candidate"] for r in top_rows]
        matches, db_reason = pilot.try_db_matches(candidate_names)

    print()
    print("=" * 80)
    print("파일럿 리포트 (저장된 raw 데이터 재사용, 재추출/재집계)")
    print("=" * 80)
    print()
    print("[검색어별 로드 결과]")
    for s in query_summaries:
        print(
            f"- {s['query']}: items={s['items_fetched']}, "
            f"date_range={s['date_range'][0]}~{s['date_range'][1]}"
        )

    print()
    print(f"[추출된 고유 후보 총 개수]: {len(total_candidates_seen)}")

    print()
    print(f"[전체 후보 (recent_count 내림차순, 총 {len(top_rows)}개)]")
    matched_count = 0
    unmatched_count = 0
    output_lines: list[str] = []
    for i, row in enumerate(top_rows, start=1):
        candidate = row["candidate"]
        found = matches.get(candidate, [])
        if found:
            matched_count += 1
            match_desc = "; ".join(f"{m['name']}({m['district']})" for m in found)
            status = f"matched -> {match_desc}"
        else:
            unmatched_count += 1
            status = "unmatched"
        growth_display = row["growth"] if row["growth"] is not None else "-"
        line = (
            f"{i:3d}. {candidate} [{row['region']}] recent={row['recent_count']} "
            f"prior={row['prior_count']} growth={growth_display} -> {status}"
        )
        print(line)
        output_lines.append(line)

    print()
    if db_reason:
        print(f"[DB 매칭 안내] {db_reason} (전체 후보를 unmatched로 처리)")
        unmatched_count = len(top_rows)
        matched_count = 0
    print(f"[매칭 결과 총계] matched={matched_count}, unmatched={unmatched_count}")

    output_path = pilot.RESULTS_DIR / "all_candidates_ranked.txt"
    with output_path.open("w", encoding="utf-8") as f:
        f.write("\n".join(output_lines) + "\n")
    print()
    print(f"[전체 후보 리스트 저장]: {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
