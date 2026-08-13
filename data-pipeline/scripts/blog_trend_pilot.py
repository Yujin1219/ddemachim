"""네이버 블로그 검색 API로 '요즘 뜨는 장소' 후보를 뽑아내는 파일럿 스크립트.

5개 검색어에 대해 adaptive pagination으로 블로그 글을 수집 → 장소명 후보를 정규식으로
추출 → 최근 30일 vs 이전 30일 언급 증가율을 집계 → DB(place)와 매칭해 신규/기존을 구분한다.

DB는 READ-ONLY(SELECT만 사용)이며, 원본 응답은 로컬 JSON 파일로만 저장한다.
서비스 키/DATABASE_URL 값은 절대 로그/출력에 노출하지 않는다.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Sequence

import requests
from dotenv import load_dotenv

from blog_place_pipeline import BlogBodyFetcher, run_blog_place_pipeline

ROOT = Path(__file__).resolve().parent.parent

BLOG_SEARCH_URL = "https://naverapihub.apigw.ntruss.com/search/v1/blog"
RESULTS_DIR = ROOT / "results" / "blog_pilot"

TODAY = date(2026, 8, 12)
RECENT_START = TODAY - timedelta(days=30)
PRIOR_START = TODAY - timedelta(days=60)

QUERIES = [
    "안국 신상 카페",
    "익선동 웨이팅",
    "서촌 핫플 카페",
    "북촌 오픈런",
    "삼청동 요즘 뜨는 맛집",
]

REGION_WORDS = ["안국", "익선동", "서촌", "북촌", "삼청동"]

# 후보의 접두어가 이 8개 지역어와 완전히 같거나 이 지역어로 "시작"하면 기각한다.
# "서촌카페" 같은 후보는 실제 상호명이 아니라 "서촌 지역의 카페"가 공백만 빠진
# 일반 문구이기 때문이다. (요구사항 4 - 프로토타입에는 없는, 이 파이프라인 전용 규칙)
KNOWN_REGION_PREFIXES = ["안국", "익선동", "인사동", "북촌", "삼청동", "서촌", "광화문", "대학로"]

# 순서 중요(프로토타입 원칙 포팅): 더 길고 구체적인 접미사를 짧은 접미사보다
# 먼저 검사해야 substring으로 잘못 잘리는 걸 막는다. 현재 목록에는 서로
# substring 관계인 접미사가 없지만(예: "스토어"/"팝업" 미포함), 추후 접미사를
# 추가할 때는 이 순서 규칙(구체적인 것 먼저)을 유지해야 한다.
PLACE_SUFFIXES = [
    "베이커리", "레스토랑", "로스터리", "미술관", "박물관", "전시관",
    "카페", "브런치", "식당", "맛집", "갤러리", "공원", "스튜디오", "서점", "바", "펍", "다이닝",
]
SUFFIX_PATTERN = "|".join(PLACE_SUFFIXES)
CANDIDATE_RE = re.compile(rf"([가-힣A-Za-z0-9]{{1,12}}(?:{SUFFIX_PATTERN}))")
TAG_RE = re.compile(r"<[^>]+>")
JOSA_SUFFIXES = ["에서", "만큼", "은", "는", "이", "가", "을", "를", "에", "의", "와", "과", "도", "만"]
JOSA_SUFFIX_PATTERN = re.compile(r"(?:을|를|은|는|이|가|에서|으로|와|과|도|로|에|나|부터|까지|마다)$")

# 상호명이 아닌 지시어/일반 수식어 (예: "이 카페", "근처 카페", "한옥카페", "팝업스토어").
# ttaemachim-naver-blog-test-main/app.py의 PLACE_GENERIC_MODIFIERS를 포팅.
PLACE_GENERIC_MODIFIERS = (
    "이", "그", "저", "여기", "저기", "근처", "신상", "핫한", "요즘", "최근",
    "인기", "유명한", "힙한", "핫플", "한옥", "거리", "동네", "골목", "일대",
    "인근", "로컬", "경복궁", "추천", "후기", "공간", "맛집", "핫플레이스",
    "가성비", "감성", "팝업", "이번", "신규", "새로",
)
# 상호명 뒤에 조사/어미만 남은 경우 (예: "카페인데", "카페였는데")
PLACE_LEFTOVER_PARTICLES = (
    "인데", "이라", "라서", "인가", "였는데", "이었는데", "다는", "라는",
    "이었다", "였다", "이고", "이지만", "인지", "은데", "네요", "예요", "이에요",
    "라고", "이라고", "하고",
)

MAX_TOTAL_START = 1000
CUTOFF_DAYS = 60


def extract_region(query: str) -> str:
    for word in REGION_WORDS:
        if word in query:
            return word
    return "기타"


def search_blog_page(client_id: str, client_secret: str, query: str, start: int, display: int = 100) -> dict:
    headers = {
        "X-NCP-APIGW-API-KEY-ID": client_id,
        "X-NCP-APIGW-API-KEY": client_secret,
    }
    resp = requests.get(
        BLOG_SEARCH_URL,
        params={"query": query, "display": display, "sort": "date", "start": start},
        headers=headers,
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def parse_postdate(postdate: str) -> date | None:
    try:
        return datetime.strptime(postdate, "%Y%m%d").date()
    except (ValueError, TypeError):
        return None


def fetch_query(client_id: str, client_secret: str, query: str) -> tuple[list[dict], int]:
    items: list[dict] = []
    start = 1
    pages = 0
    while True:
        body = search_blog_page(client_id, client_secret, query, start)
        pages += 1
        page_items = body.get("items", [])
        items.extend(page_items)

        if not page_items:
            break

        last_postdate = parse_postdate(page_items[-1].get("postdate", ""))
        if last_postdate is not None and (TODAY - last_postdate).days > CUTOFF_DAYS:
            break

        if start + 100 > MAX_TOTAL_START:
            break

        start += 100

    return items, pages


def save_raw_results(query: str, items: list[dict]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"\s+", "_", query.strip())
    safe_name = re.sub(r"[^0-9A-Za-z가-힣_]", "", safe_name)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    path = RESULTS_DIR / f"{safe_name}_{timestamp}.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump({"query": query, "items": items}, f, ensure_ascii=False, indent=2)
    return path


def strip_tags(text: str) -> str:
    return TAG_RE.sub("", text or "")


def strip_josa(candidate: str) -> str:
    for suffix in PLACE_SUFFIXES:
        if candidate.endswith(suffix):
            return candidate
    for josa in JOSA_SUFFIXES:
        if candidate.endswith(josa) and len(candidate) > len(josa):
            return candidate[: -len(josa)]
    return candidate


def _is_generic_place_word(word: str) -> bool:
    """지시어/일반수식어/지역명처럼 상호명이 아닐 가능성이 큰 단어인지 확인한다.

    (ttaemachim-naver-blog-test-main/app.py의 _is_generic_place_word 포팅)
    """
    if word in PLACE_GENERIC_MODIFIERS or word in REGION_WORDS:
        return True
    if word.endswith("역"):
        return True
    for region_word in REGION_WORDS:
        if region_word.startswith(word) and len(region_word) - len(word) <= 2:
            return True
        if word.startswith(region_word) and len(word) - len(region_word) <= 2:
            return True
    return False


def is_named_place(candidate: str) -> bool:
    """지시어/지역명/조사만 남은 후보(상호명이 아닌 것)를 걸러낸다.

    (ttaemachim-naver-blog-test-main/app.py의 is_named_place 포팅)
    """
    for suffix in PLACE_SUFFIXES:
        if candidate.endswith(suffix):
            prefix = candidate[: -len(suffix)].strip()
            if not prefix:
                return False
            if _is_generic_place_word(prefix):
                return False
            if prefix.endswith(PLACE_LEFTOVER_PARTICLES):
                return False
            # 이 파이프라인 전용 규칙: 접두어가 8개 알려진 지역어와 완전히
            # 같거나 그 지역어로 시작하면("서촌카페" 등) 실제 상호명이 아니라
            # "지역+카페"가 붙은 일반 문구로 보고 기각한다.
            for region_prefix in KNOWN_REGION_PREFIXES:
                if prefix == region_prefix or prefix.startswith(region_prefix):
                    return False
            return True
    return True


def extract_candidates(item: dict) -> list[str]:
    text = strip_tags(item.get("title", "")) + " " + strip_tags(item.get("description", ""))
    matches = CANDIDATE_RE.findall(text)
    candidates: list[str] = []
    seen: set[str] = set()
    for match in matches:
        for suffix in PLACE_SUFFIXES:
            if match.endswith(suffix) and len(match) > len(suffix):
                cleaned = strip_josa(match)
                if cleaned and cleaned not in seen and is_named_place(cleaned):
                    seen.add(cleaned)
                    candidates.append(cleaned)
                break
    return candidates


def try_db_matches(candidates: list[str]) -> tuple[dict[str, list[dict]], str | None]:
    try:
        import psycopg
    except ImportError:
        return {}, "psycopg 모듈을 사용할 수 없어 DB 매칭을 건너뜁니다."

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        return {}, "DATABASE_URL이 .env에 없어 DB 매칭을 건너뜁니다."

    matches: dict[str, list[dict]] = {}
    try:
        with psycopg.connect(database_url, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                for candidate in candidates:
                    pattern = f"%{candidate}%"
                    cur.execute(
                        "SELECT id, name, district, neighborhood FROM place "
                        "WHERE normalized_name ILIKE %s OR name ILIKE %s LIMIT 3",
                        (pattern, pattern),
                    )
                    rows = cur.fetchall()
                    matches[candidate] = [
                        {"id": r[0], "name": r[1], "district": r[2], "neighborhood": r[3]} for r in rows
                    ]
        return matches, None
    except Exception as exc:  # noqa: BLE001 - report but don't crash pilot
        return {}, f"DB 연결/조회 실패로 매칭을 건너뜁니다 ({type(exc).__name__})."


def _safe_query_filename(query: str) -> str:
    safe_name = re.sub(r"\s+", "_", query.strip())
    return re.sub(r"[^0-9A-Za-z가-힣_]", "", safe_name)


def _find_latest_saved_file(query: str, raw_dir: Path) -> Path | None:
    candidates = sorted(raw_dir.glob(f"{_safe_query_filename(query)}_*.json"))
    return candidates[-1] if candidates else None


def resolve_query_filter(query_filter: str | None) -> list[str]:
    """검색어를 완전 일치로 검증하고 실행 대상 query 목록을 반환한다."""

    if query_filter is None:
        return list(QUERIES)
    requested = query_filter.strip()
    if requested not in QUERIES:
        available = ", ".join(QUERIES)
        raise ValueError(
            f"존재하지 않는 검색어입니다: {query_filter!r}. "
            f"사용 가능한 검색어: {available}"
        )
    return [requested]


def _load_saved_items(
    raw_dir: Path,
    queries: Sequence[str] | None = None,
) -> tuple[dict[str, list[dict]], list[dict]]:
    items_by_query: dict[str, list[dict]] = {}
    summaries: list[dict] = []
    selected_queries = list(QUERIES if queries is None else queries)
    for query in selected_queries:
        path = _find_latest_saved_file(query, raw_dir)
        if path is None:
            raise FileNotFoundError(f"저장된 raw 결과를 찾을 수 없습니다 (query={query})")
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        items = data.get("items", [])
        if not isinstance(items, list):
            items = []
        items_by_query[query] = items
        postdates = [parse_postdate(item.get("postdate", "")) for item in items if isinstance(item, dict)]
        postdates = [value for value in postdates if value is not None]
        date_range = (min(postdates), max(postdates)) if postdates else (None, None)
        summaries.append(
            {
                "query": query,
                "items_fetched": len(items),
                "pages": None,
                "date_range": date_range,
                "loaded_from": str(path),
            }
        )
    return items_by_query, summaries


def _print_place_mvp_result(result: dict) -> None:
    stats = result["stats"]
    print()
    print("[Naver Blog 장소 후보 MVP]")
    print(
        f"selected_posts={stats['selected_posts']}, fetched_posts={stats.get('fetched_posts', 0)}, "
        f"map_found_posts={stats.get('map_found_posts', 0)}, "
        f"extracted_place_count={stats.get('extracted_place_count', 0)}, "
        f"auto_confirmed={stats.get('auto_confirmed', 0)}, "
        f"review_required={stats.get('review_required', 0)}, "
        f"no_map={stats.get('no_map', 0)}, body_failed={stats.get('body_failed', 0)}, "
        f"auto_confirm_rate={stats.get('auto_confirm_rate', 0.0):.1f}%, "
        f"unique_links={stats['unique_links']}, body_requests={stats['body_requests']}, "
        f"places={stats['places']}"
    )
    if result["reason_counts"]:
        print("failure_or_skip_reasons=" + ", ".join(
            f"{key}:{value}" for key, value in sorted(result["reason_counts"].items())
        ))
    for key, path in result["artifacts"].items():
        print(f"{key}={path}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Naver Blog 검색 및 v2_map 장소 후보 MVP")
    parser.add_argument(
        "--fetch-bodies",
        action="store_true",
        help="선별된 link의 공개 HTML을 조회한다(기본값: 본문 조회 안 함).",
    )
    parser.add_argument(
        "--from-saved",
        action="store_true",
        help="기존 results/blog_pilot raw JSON을 사용해 API/DB 없이 selection dry-run을 실행한다.",
    )
    query_group = parser.add_mutually_exclusive_group()
    query_group.add_argument(
        "--query-filter",
        dest="query_filter",
        metavar="QUERY",
        help="--from-saved에서 정확히 이 검색어 하나만 선택한다.",
    )
    query_group.add_argument(
        "--query",
        dest="query_filter",
        metavar="QUERY",
        help="--query-filter의 별칭.",
    )
    parser.add_argument("--raw-dir", type=Path, default=RESULTS_DIR, help="--from-saved raw JSON 디렉터리")
    parser.add_argument("--output-dir", type=Path, default=RESULTS_DIR, help="selected/extracted/report 출력 디렉터리")
    parser.add_argument("--author-cap", type=int, choices=(1, 2), default=2, help="쿼리별 bloggerlink 최대 선택 수")
    parser.add_argument("--body-timeout", type=float, default=10.0, help="본문 요청 timeout(초)")
    parser.add_argument("--body-throttle", type=float, default=0.25, help="본문 요청 사이 최소 간격(초)")
    args = parser.parse_args(argv)

    try:
        selected_queries = resolve_query_filter(args.query_filter)
    except ValueError as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 2

    if args.from_saved:
        try:
            items_by_query, query_summaries = _load_saved_items(args.raw_dir, selected_queries)
        except FileNotFoundError as exc:
            print(f"오류: {exc}", file=sys.stderr)
            return 2
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            print(f"오류: 저장된 raw 결과를 읽을 수 없습니다 ({type(exc).__name__}).", file=sys.stderr)
            return 2
        all_items_with_query = [
            (item, query)
            for query in selected_queries
            for item in items_by_query[query]
            if isinstance(item, dict)
        ]
    else:
        # 기존 live 실행과의 호환을 위해서만 .env를 로드한다. --from-saved 경로는
        # 환경변수/DB/API 키를 읽지 않는다.
        load_dotenv(ROOT / ".env")
        client_id = os.getenv("NAVER_API_HUB_CLIENT_ID", "").strip()
        client_secret = os.getenv("NAVER_API_HUB_CLIENT_SECRET", "").strip()
        if not client_id or not client_secret:
            print("오류: NAVER_API_HUB_CLIENT_ID/SECRET이 .env에 없습니다.", file=sys.stderr)
            return 2

        query_summaries = []
        all_items_with_query = []
        items_by_query = {}
        for query in selected_queries:
            print(f"=== 수집 중: {query} ===")
            items, pages = fetch_query(client_id, client_secret, query)
            save_path = save_raw_results(query, items)
            items_by_query[query] = items

            postdates = [parse_postdate(it.get("postdate", "")) for it in items]
            postdates = [d for d in postdates if d is not None]
            date_range = (min(postdates), max(postdates)) if postdates else (None, None)

            query_summaries.append(
                {
                    "query": query,
                    "items_fetched": len(items),
                    "pages": pages,
                    "date_range": date_range,
                    "saved_to": str(save_path),
                }
            )
            for it in items:
                all_items_with_query.append((it, query))

            print(f"  items={len(items)}, pages={pages}, date_range={date_range}, saved={save_path}")

    body_fetcher = None
    if args.fetch_bodies:
        body_fetcher = BlogBodyFetcher(timeout=args.body_timeout, throttle_seconds=args.body_throttle)
    place_result = run_blog_place_pipeline(
        items_by_query,
        analysis_start=PRIOR_START,
        analysis_end=TODAY,
        fetch_bodies=args.fetch_bodies,
        fetcher=body_fetcher,
        output_dir=args.output_dir,
        author_cap=args.author_cap,
    )
    _print_place_mvp_result(place_result)

    # --from-saved는 의도적으로 selection/장소 MVP만 실행한다. 기존 live 경로의
    # 정규식 후보/DB 매칭 보고서는 그대로 유지한다.
    if args.from_saved:
        print("[selection dry-run] API/DB 없이 저장된 raw만 사용했습니다.")
        return 0

    aggregation: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"recent_count": 0, "prior_count": 0}
    )
    total_candidates_seen: set[tuple[str, str]] = set()

    for item, query in all_items_with_query:
        region = extract_region(query)
        postdate = parse_postdate(item.get("postdate", ""))
        candidates = extract_candidates(item)
        for candidate in candidates:
            key = (candidate, region)
            total_candidates_seen.add(key)
            if postdate is None:
                continue
            if RECENT_START <= postdate <= TODAY:
                aggregation[key]["recent_count"] += 1
            elif PRIOR_START <= postdate < RECENT_START:
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
    top_rows = rows[:15]

    db_reason = None
    matches: dict[str, list[dict]] = {}
    if top_rows:
        candidate_names = [r["candidate"] for r in top_rows]
        matches, db_reason = try_db_matches(candidate_names)

    print()
    print("=" * 80)
    print("파일럿 리포트")
    print("=" * 80)
    print()
    print("[검색어별 수집 결과]")
    for s in query_summaries:
        print(
            f"- {s['query']}: items={s['items_fetched']}, pages={s['pages']}, "
            f"date_range={s['date_range'][0]}~{s['date_range'][1]}"
        )

    print()
    print(f"[추출된 고유 후보 총 개수]: {len(total_candidates_seen)}")

    print()
    print("[Top 15 후보 (recent_count 내림차순)]")
    matched_count = 0
    unmatched_count = 0
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
        print(
            f"{i:2d}. {candidate} [{row['region']}] recent={row['recent_count']} "
            f"prior={row['prior_count']} growth={growth_display} -> {status}"
        )

    print()
    if db_reason:
        print(f"[DB 매칭 안내] {db_reason} (Top 15 전체를 unmatched로 처리)")
        unmatched_count = len(top_rows)
        matched_count = 0
    print(f"[매칭 결과 총계] matched={matched_count}, unmatched={unmatched_count}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
