"""Naver Blog 본문 선별 및 v2_map 장소 추출용 순수 파이프라인.

검색 API가 반환한 수백 건의 글을 모두 본문 조회하지 않고, 쿼리별로
결정론적인 소수의 글만 선택한다. 본문 조회는 호출자가 명시적으로 요청할 때만
사용하며, 장소 추출은 네이버 블로그 HTML의 ``__se_module_data`` JSON만 읽는다.

이 모듈은 DB나 환경변수를 읽지 않는다. 네트워크를 사용하는 부분도
``BlogBodyFetcher``로 격리해 선택/파싱/집계 테스트가 실제 네트워크 없이 가능하다.
"""
from __future__ import annotations

import hashlib
import html as html_lib
import json
import re
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import parse_qs, urlencode, unquote, urljoin, urlparse, urlunparse

import requests


DEFAULT_MAX_POSTS = 50
DEFAULT_AUTHOR_CAP = 2
DEFAULT_BUCKET_QUOTAS = {
    "latest": 25,
    "relevance": 15,
    "exploration": 10,
}
DEFAULT_ANALYSIS_DAYS = 60
DEFAULT_USER_AGENT = "NaverBlogPlaceMVP/1.0 (data-pipeline; public HTML only)"
REPRESENTATIVE_MIN_SCORE = 4
REPRESENTATIVE_MIN_MARGIN = 2

# 현재 파일럿 검색어는 종로 생활권이다. 주소에 생활권명이 생략되어도
# 서울 종로구를 허용하지만, 다른 서울 자치구나 타 시·도는 자동 확정하지
# 않는다. 고정 메뉴명/상호명 목록은 대표 판정에 사용하지 않는다.
SEOUL_DISTRICTS = (
    "종로구",
    "중구",
    "용산구",
    "성동구",
    "광진구",
    "동대문구",
    "중랑구",
    "성북구",
    "강북구",
    "도봉구",
    "노원구",
    "은평구",
    "서대문구",
    "마포구",
    "양천구",
    "강서구",
    "구로구",
    "금천구",
    "영등포구",
    "동작구",
    "관악구",
    "서초구",
    "강남구",
    "송파구",
    "강동구",
)
OUT_OF_SCOPE_AREA_TERMS = (
    "부산",
    "제주",
    "경기",
    "수원",
    "인천",
    "대구",
    "대전",
    "광주",
    "울산",
    "세종",
    "강원",
    "충북",
    "충남",
    "전북",
    "전남",
    "경북",
    "경남",
    "성남",
    "고양",
    "용인",
    "안양",
    "부천",
    "화성",
    "평택",
)

KNOWN_REGIONS = (
    "안국",
    "익선동",
    "서촌",
    "북촌",
    "삼청동",
    "인사동",
    "광화문",
    "대학로",
)

ADJACENT_REGIONS: dict[str, tuple[str, ...]] = {
    "안국": ("북촌", "인사동", "익선동", "삼청동"),
    "익선동": ("안국", "인사동", "서촌"),
    "서촌": ("광화문", "북촌", "안국", "삼청동"),
    "북촌": ("안국", "삼청동", "서촌", "인사동"),
    "삼청동": ("북촌", "안국", "서촌", "광화문"),
    "인사동": ("안국", "익선동", "광화문"),
    "광화문": ("서촌", "인사동", "대학로", "삼청동"),
    "대학로": ("광화문", "익선동", "인사동"),
}

# 장소 메뉴명이 아니라, 글이 실제 방문/후기 성격인지 판단하는 의도 신호다.
VISIT_INTENT_TERMS = (
    "후기",
    "방문",
    "다녀",
    "신상",
    "오픈",
    "오픈런",
    "웨이팅",
    "예약",
    "리뷰",
    "재방문",
    "내돈내산",
    "가본",
    "먹어",
    "추천",
    "투어",
    "소개",
)

# Raw 검색 결과에는 별도의 relevance/similarity 타입이 없으므로, 제목과
# 요약의 명시적인 표현만 약한 penalty로 사용한다. 이 신호들은 hard drop이
# 아니라 우선순위 조정용이며, exploration bucket은 계속 후보를 보존한다.
LISTICLE_TERMS = (
    "목록",
    "모음",
    "총정리",
    "정리",
    "리스트",
    "best",
    "베스트",
    "top",
    "가볼만한곳",
    "가볼 만한 곳",
)
LIFESTYLE_COLLECTION_TERMS = (
    "일상모음",
    "일상 모음",
    "일상기록",
    "일상 기록",
    "주간일기",
    "주간 일기",
    "소소한 일상",
    "일상 브이로그",
)

_BLOG_HOSTS = {"blog.naver.com"}
_BLOG_ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\Z")
_LOG_NO_RE = re.compile(r"[A-Za-z0-9_-]{1,100}\Z")
_POST_VIEW_PATH_RE = re.compile(r"/(?:PostView|postview)\.naver\Z")


def _safe_url_parts(value: Any):
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        parsed = urlparse(raw)
        # .port는 잘못된 포트 문자열에서 ValueError를 낼 수 있다.
        port = parsed.port
    except ValueError:
        return None
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme.lower() not in {"http", "https"} or host not in _BLOG_HOSTS:
        return None
    if parsed.username is not None or parsed.password is not None:
        return None
    if port is not None and not (
        (parsed.scheme.lower() == "http" and port == 80)
        or (parsed.scheme.lower() == "https" and port == 443)
    ):
        return None
    return parsed


def normalize_blog_url(value: Any) -> str | None:
    """허용된 네이버 블로그 URL만 정규화한다.

    호스트 allow-list, scheme, credentials, 비표준 port를 모두 확인하므로 이
    함수의 결과만 본문 HTTP 요청에 사용해야 한다.
    """

    parsed = _safe_url_parts(value)
    if parsed is None:
        return None
    host = (parsed.hostname or "").lower()
    path = parsed.path or "/"
    if path != "/":
        path = "/" + path.strip("/")
    return urlunparse(
        (
            parsed.scheme.lower(),
            host,
            path,
            "",
            parsed.query,
            "",
        )
    )


def is_naver_blog_url(value: Any) -> bool:
    return normalize_blog_url(value) is not None


def parse_post_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    for fmt in ("%Y%m%d", "%Y-%m-%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except (TypeError, ValueError):
            continue
    return None


def _clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    # 검색 API title/description의 b, br 등은 선별 신호에서 의미가 없다.
    value = re.sub(r"<[^>]*>", " ", value)
    return html_lib.unescape(value).strip()


def _target_region(query: str) -> str | None:
    query_text = _clean_text(query)
    for region in KNOWN_REGIONS:
        if region in query_text:
            return region
    return None


# 검색어에 들어 있는 지역명과 이 파일럿의 명시적인 대상 구역만 사용한다.
# 장소명/메뉴명 목록을 별도로 두지 않는 것이 대표 장소 판정의 중요한 전제다.
_REPRESENTATIVE_AREA_NAMES = ("서울", "종로구", *KNOWN_REGIONS)
_QUERY_AREA_RE = re.compile(r"[가-힣A-Za-z0-9]{2,}(?:시|도|구|동|읍|면|리)")


def _target_area_terms(query: Any) -> tuple[str, ...]:
    """대표 장소 주소 점수에 사용할 검색어 기반 지역어를 반환한다."""

    query_text = _clean_text(query)
    terms: list[str] = []
    for area in _REPRESENTATIVE_AREA_NAMES:
        if area in query_text and area not in terms:
            terms.append(area)
    for area in _QUERY_AREA_RE.findall(query_text):
        if area not in terms:
            terms.append(area)

    # 현재 파일럿은 종로구 대상이며, 안국/서촌 같은 생활권 검색어의
    # 지도 주소에는 생활권명이 생략되고 종로구만 남는 경우가 있다.
    if _target_region(query_text) and "종로구" not in terms:
        terms.append("종로구")
    return tuple(terms)


def _representative_area_profile(query: Any) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """쿼리에 대한 허용 생활권/자치구를 반환한다.

    현재 대상 생활권(안국·익선동 등)은 모두 서울 종로구에 속한다. 따라서
    주소에 생활권명이 직접 없더라도 ``종로구``를 지역 증거로 인정하되, 다른
    자치구·시도 주소는 별도 불일치로 표시한다.
    """

    query_text = _clean_text(query)
    target_region = _target_region(query_text)
    area_terms = (target_region,) if target_region else ()
    allowed_districts: list[str] = []
    if target_region in KNOWN_REGIONS or "종로구" in query_text:
        allowed_districts.append("종로구")
    for district in SEOUL_DISTRICTS:
        if district in query_text and district not in allowed_districts:
            allowed_districts.append(district)
    return area_terms, tuple(allowed_districts)


def _representative_address_evidence(
    query: Any,
    address: Any,
) -> dict[str, Any]:
    """주소가 쿼리 대상 지역인지 판정하는 명시적 evidence flags를 만든다."""

    normalized_address = _representative_match_text(address)
    area_terms, allowed_districts = _representative_area_profile(query)
    matched_area_terms = [
        area for area in area_terms if _representative_match_text(area) in normalized_address
    ]
    matched_districts = [
        district
        for district in allowed_districts
        if _representative_match_text(district) in normalized_address
    ]
    disallowed_districts = [
        district
        for district in SEOUL_DISTRICTS
        if district not in allowed_districts and _representative_match_text(district) in normalized_address
    ]
    out_of_scope_terms = [
        term
        for term in OUT_OF_SCOPE_AREA_TERMS
        if _representative_match_text(term) in normalized_address
    ]
    area_mismatch = bool(disallowed_districts or out_of_scope_terms)
    return {
        "target_area_evidence": bool(matched_area_terms or matched_districts),
        "matched_area_terms": matched_area_terms,
        "matched_districts": matched_districts,
        "area_mismatch": area_mismatch,
        "mismatch_terms": sorted(set(disallowed_districts + out_of_scope_terms)),
    }


def _stable_digest(query: str, link: str) -> str:
    return hashlib.sha256(f"{query}\0{link}".encode("utf-8")).hexdigest()


def _blogger_key(item: Mapping[str, Any], link: str) -> str:
    blogger = _blogger_identity(item.get("bloggerlink"))
    # bloggerlink가 없는 항목끼리 전부 같은 작성자로 취급하지 않는다.
    return blogger or f"missing:{link}"


def _blogger_identity(value: Any) -> str | None:
    """bloggerlink의 query/fragment를 제거한 작성자 identity."""

    normalized = normalize_blog_url(value)
    if normalized is None:
        return None
    parsed = _safe_url_parts(normalized)
    if parsed is None:
        return None
    return urlunparse((parsed.scheme.lower(), (parsed.hostname or "").lower(), parsed.path or "/", "", "", ""))


def _relevance_details(item: Mapping[str, Any], query: str, post_date: date, end_date: date) -> tuple[int, list[str]]:
    title = _clean_text(item.get("title"))
    description = _clean_text(item.get("description"))
    text = f"{title} {description}"
    target = _target_region(query)
    adjacent = ADJACENT_REGIONS.get(target or "", ())
    score = 0
    reasons: list[str] = []

    if target and target in title:
        score += 24
        reasons.append("target-region-title")
    elif target and target in text:
        score += 15
        reasons.append("target-region")
    adjacent_hits = [region for region in adjacent if region in text]
    if adjacent_hits:
        score += 7 * len(adjacent_hits)
        reasons.append("adjacent-region")

    intent_hits = [term for term in VISIT_INTENT_TERMS if term in text]
    if intent_hits:
        score += 5 * len(intent_hits)
        reasons.append(f"visit-intent:{','.join(intent_hits)}(+{5 * len(intent_hits)})")

    # These are deliberately additive penalties. A post mentioning another
    # area or having a list/diary framing can still enter exploration, but it
    # should lose priority to an explicit target-area visit report.
    out_of_scope_hits = [term for term in OUT_OF_SCOPE_AREA_TERMS if term in text]
    if out_of_scope_hits:
        penalty = min(24, 12 * len(out_of_scope_hits))
        score -= penalty
        reasons.append(f"penalty:out-of-scope:{','.join(out_of_scope_hits)}(-{penalty})")

    listicle_hits = [term for term in LISTICLE_TERMS if term.casefold() in text.casefold()]
    lifestyle_hits = [term for term in LIFESTYLE_COLLECTION_TERMS if term in text]
    collection_hits = list(dict.fromkeys(listicle_hits + lifestyle_hits))
    if collection_hits:
        penalty = min(20, 6 * len(collection_hits))
        score -= penalty
        reasons.append(f"penalty:collection:{','.join(collection_hits)}(-{penalty})")

    if target and target not in text:
        score -= 8
        reasons.append(f"penalty:target-region-absent:{target}(-8)")

    age_days = max(0, (end_date - post_date).days)
    recency_score = max(0, DEFAULT_ANALYSIS_DAYS - age_days)
    score += recency_score
    if age_days <= 14:
        reasons.append("recent")
    return score, reasons


def _materialize_selected(candidate: Mapping[str, Any], query: str, bucket: str, reasons: Sequence[str]) -> dict[str, Any]:
    item = candidate["item"]
    selected = {
        "query": query,
        "link": candidate["link"],
        "bloggerlink": item.get("bloggerlink"),
        "bloggername": item.get("bloggername"),
        "title": item.get("title", ""),
        "description": item.get("description", ""),
        "postdate": item.get("postdate", ""),
        "selection_bucket": bucket,
        "selection_score": int(candidate.get("relevance_score") or 0),
        "selection_reasons": list(dict.fromkeys(reasons)),
    }
    return selected


def select_posts(
    items: Sequence[Mapping[str, Any]],
    query: str,
    *,
    analysis_start: date | None = None,
    analysis_end: date | None = None,
    max_posts: int = DEFAULT_MAX_POSTS,
    author_cap: int = DEFAULT_AUTHOR_CAP,
    quotas: Mapping[str, int] | None = None,
) -> list[dict[str, Any]]:
    """쿼리별 본문 조회 대상을 최신/적합도/탐색 순으로 결정한다.

    URL, 날짜, 링크 중복, 작성자 cap을 먼저 적용한다. 각 bucket은 앞선
    bucket과 중복되지 않으며, bucket이 cap/후보 부족으로 비면 남은 후보로
    backfill한다. 모든 정렬 tie-breaker는 URL 또는 SHA-256 digest라서
    입력이 같으면 결과가 같다.
    """

    if max_posts <= 0 or author_cap <= 0:
        return []
    end_date = analysis_end or date.today()
    start_date = analysis_start or (end_date - timedelta(days=DEFAULT_ANALYSIS_DAYS))
    bucket_quotas = dict(DEFAULT_BUCKET_QUOTAS)
    if quotas is not None:
        bucket_quotas.update({key: max(0, int(value)) for key, value in quotas.items()})
    bucket_quotas = {
        key: min(max_posts, value) for key, value in bucket_quotas.items() if key in DEFAULT_BUCKET_QUOTAS
    }

    # 같은 link가 API 응답에 여러 번 있을 때도 입력 순서가 결과를 결정하지 않게
    # 날짜/메타데이터를 기준으로 대표 항목을 고른다.
    by_link: dict[str, dict[str, Any]] = {}
    for raw_item in items:
        if not isinstance(raw_item, Mapping):
            continue
        link = normalize_blog_url(raw_item.get("link"))
        post_date = parse_post_date(raw_item.get("postdate"))
        if link is None or post_date is None or not (start_date <= post_date <= end_date):
            continue
        candidate = {
            "item": dict(raw_item),
            "link": link,
            "post_date": post_date,
            "blogger_key": _blogger_key(raw_item, link),
        }
        current = by_link.get(link)
        if current is None:
            by_link[link] = candidate
            continue
        current_key = (
            current["post_date"],
            _clean_text(current["item"].get("title")),
            _clean_text(current["item"].get("description")),
            str(current["item"].get("bloggerlink") or ""),
            json.dumps(current["item"], ensure_ascii=False, sort_keys=True, default=str),
        )
        candidate_key = (
            candidate["post_date"],
            _clean_text(candidate["item"].get("title")),
            _clean_text(candidate["item"].get("description")),
            str(candidate["item"].get("bloggerlink") or ""),
            json.dumps(candidate["item"], ensure_ascii=False, sort_keys=True, default=str),
        )
        if candidate_key > current_key:
            by_link[link] = candidate

    candidates = list(by_link.values())
    for candidate in candidates:
        score, reasons = _relevance_details(candidate["item"], query, candidate["post_date"], end_date)
        candidate["relevance_score"] = score
        candidate["relevance_reasons"] = reasons

    latest_order = sorted(
        candidates,
        key=lambda candidate: (-candidate["post_date"].toordinal(), candidate["link"]),
    )
    relevance_order = sorted(
        candidates,
        key=lambda candidate: (
            -candidate["relevance_score"],
            -candidate["post_date"].toordinal(),
            candidate["link"],
        ),
    )
    exploration_order = sorted(
        candidates,
        key=lambda candidate: _stable_digest(query, candidate["link"]),
    )

    selected: list[dict[str, Any]] = []
    selected_links: set[str] = set()
    author_counts: Counter[str] = Counter()

    def take(order: Iterable[Mapping[str, Any]], requested: int, bucket: str) -> None:
        if requested <= 0:
            return
        for candidate in order:
            if len(selected) >= max_posts or len(selected) >= sum(bucket_quotas.values()):
                return
            link = candidate["link"]
            author = candidate["blogger_key"]
            if link in selected_links or author_counts[author] >= author_cap:
                continue
            selected_links.add(link)
            author_counts[author] += 1
            reasons = list(candidate["relevance_reasons"])
            if bucket == "latest":
                reasons.insert(0, "latest")
            elif bucket == "exploration":
                reasons.insert(0, "deterministic-exploration")
            elif bucket == "backfill":
                reasons.insert(0, "backfill")
            selected.append(_materialize_selected(candidate, query, bucket, reasons))
            if sum(1 for post in selected if post["selection_bucket"] == bucket) >= requested:
                return

    # sum(bucket_quotas.values())은 기본적으로 50이지만 사용자가 quota를 낮춘
    # 경우에도 max_posts보다 더 담지 않는다.
    take(latest_order, bucket_quotas.get("latest", 0), "latest")
    take(relevance_order, bucket_quotas.get("relevance", 0), "relevance")
    take(exploration_order, bucket_quotas.get("exploration", 0), "exploration")

    # 특정 bucket의 후보가 부족하거나 author cap으로 막힌 경우 남은 후보를
    # 적합도→최신성→URL 순으로 채운다. menu 이름은 이 과정에 사용하지 않는다.
    remaining_order = sorted(
        (candidate for candidate in candidates if candidate["link"] not in selected_links),
        key=lambda candidate: (
            -candidate["relevance_score"],
            -candidate["post_date"].toordinal(),
            candidate["link"],
        ),
    )
    take(remaining_order, max_posts, "backfill")
    return selected[:max_posts]


@dataclass
class _HtmlNavigation:
    frame_urls: list[str]
    has_frameset: bool = False


class _HtmlNavigationParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.frame_urls: list[str] = []
        self.has_frameset = False

    def _handle_tag(self, tag: str, attrs: Sequence[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        if lowered == "frameset":
            self.has_frameset = True
        if lowered not in {"frame", "iframe", "a"}:
            return
        attrs_map = {key.lower(): value for key, value in attrs}
        value = attrs_map.get("src") if lowered in {"frame", "iframe"} else attrs_map.get("href")
        if value:
            self.frame_urls.append(html_lib.unescape(value.strip()))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._handle_tag(tag, attrs)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._handle_tag(tag, attrs)


def _parse_navigation(html_text: str) -> _HtmlNavigation:
    parser = _HtmlNavigationParser()
    try:
        parser.feed(html_text or "")
        parser.close()
    except (TypeError, ValueError):
        # 본문 자체가 깨져 있어도 호출자는 map 없음/실패로 계속 진행할 수 있다.
        pass
    return _HtmlNavigation(parser.frame_urls, parser.has_frameset)


def _valid_post_view_ids(blog_id: Any, log_no: Any) -> tuple[str, str] | None:
    if not isinstance(blog_id, str) or not isinstance(log_no, str):
        return None
    blog_id = unquote(blog_id).strip()
    log_no = unquote(log_no).strip()
    if not _BLOG_ID_RE.fullmatch(blog_id) or not _LOG_NO_RE.fullmatch(log_no):
        return None
    return blog_id, log_no


def _post_view_from_safe_url(url: str) -> str | None:
    parsed = _safe_url_parts(url)
    if parsed is None:
        return None
    query = parse_qs(parsed.query, keep_blank_values=False)
    ids = _valid_post_view_ids(
        (query.get("blogId") or query.get("blogid") or [None])[0],
        (query.get("logNo") or query.get("logno") or [None])[0],
    )
    if ids is None or not _POST_VIEW_PATH_RE.search(parsed.path):
        return None
    blog_id, log_no = ids
    return urlunparse(
        (
            "https",
            "blog.naver.com",
            "/PostView.naver",
            "",
            urlencode({"blogId": blog_id, "logNo": log_no}),
            "",
        )
    )


def build_post_view_url(blog_url: Any) -> str | None:
    """구형 blog.naver.com/{blogId}/{logNo} URL을 안전한 PostView URL로 만든다."""

    normalized = normalize_blog_url(blog_url)
    if normalized is None:
        return None
    direct = _post_view_from_safe_url(normalized)
    if direct is not None:
        return direct

    parsed = _safe_url_parts(normalized)
    if parsed is None:
        return None
    parts = [unquote(part) for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        return None
    ids = _valid_post_view_ids(parts[0], parts[1])
    if ids is None:
        return None
    blog_id, log_no = ids
    return urlunparse(
        (
            "https",
            "blog.naver.com",
            "/PostView.naver",
            "",
            urlencode({"blogId": blog_id, "logNo": log_no}),
            "",
        )
    )


def extract_post_view_url(html_text: str, source_url: Any) -> str | None:
    """frameset/frame에서 PostView URL을 추출하되 네이버 호스트만 허용한다."""

    source = normalize_blog_url(source_url)
    if source is None:
        return None
    navigation = _parse_navigation(html_text)
    for raw_url in navigation.frame_urls:
        candidate = normalize_blog_url(urljoin(source, raw_url))
        if candidate is None:
            # 외부 frame URL은 반환하지도, fetch하지도 않는다.
            continue
        post_view = _post_view_from_safe_url(candidate)
        if post_view is not None:
            return post_view
    if navigation.has_frameset:
        return build_post_view_url(source)
    return None


@dataclass(frozen=True)
class BodyFetchResult:
    requested_url: str
    html: str | None
    fetched_url: str | None
    reason: str | None
    request_count: int = 0


class BlogBodyFetcher:
    """허용된 네이버 블로그만 조회하는 공개 HTML fetcher."""

    def __init__(
        self,
        *,
        session: requests.Session | None = None,
        timeout: float = 10.0,
        throttle_seconds: float = 0.25,
        user_agent: str = DEFAULT_USER_AGENT,
        max_hops: int = 2,
    ) -> None:
        self.session = session or requests.Session()
        self.timeout = timeout
        self.throttle_seconds = max(0.0, throttle_seconds)
        self.user_agent = user_agent
        self.max_hops = max(0, max_hops)
        self._last_request_at: float | None = None

    def _wait_for_throttle(self) -> None:
        if self._last_request_at is None or self.throttle_seconds <= 0:
            return
        remaining = self.throttle_seconds - (time.monotonic() - self._last_request_at)
        if remaining > 0:
            time.sleep(remaining)

    def fetch(self, blog_url: Any) -> BodyFetchResult:
        requested = normalize_blog_url(blog_url)
        if requested is None:
            return BodyFetchResult(str(blog_url or ""), None, None, "unsafe_url")

        current = requested
        visited: set[str] = set()
        request_count = 0
        for hop in range(self.max_hops + 1):
            if current in visited:
                return BodyFetchResult(requested, None, None, "redirect_loop", request_count)
            visited.add(current)
            self._wait_for_throttle()
            try:
                response = self.session.get(
                    current,
                    headers={"User-Agent": self.user_agent, "Accept": "text/html,application/xhtml+xml"},
                    timeout=self.timeout,
                    allow_redirects=False,
                )
                request_count += 1
                self._last_request_at = time.monotonic()
            except requests.Timeout:
                return BodyFetchResult(requested, None, None, "timeout", request_count)
            except requests.RequestException:
                return BodyFetchResult(requested, None, None, "request_error", request_count)
            except Exception:  # noqa: BLE001 - one broken post must not stop the batch
                return BodyFetchResult(requested, None, None, "request_error", request_count)

            status = int(getattr(response, "status_code", 0) or 0)
            if 300 <= status < 400:
                location = getattr(response, "headers", {}).get("Location")
                redirected = normalize_blog_url(urljoin(current, location or ""))
                if redirected is None:
                    return BodyFetchResult(requested, None, None, "redirect_blocked", request_count)
                current = redirected
                continue
            if status >= 400:
                category = "http_4xx" if status < 500 else "http_5xx"
                return BodyFetchResult(requested, None, current, category, request_count)

            body = getattr(response, "text", "") or ""
            if not body.strip():
                return BodyFetchResult(requested, None, current, "empty_html", request_count)

            post_view = extract_post_view_url(body, current)
            if post_view is not None and post_view != current:
                current = post_view
                continue
            return BodyFetchResult(requested, body, current, None, request_count)

        return BodyFetchResult(requested, None, None, "postview_hop_limit", request_count)


class _ModuleDataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._script_class: str | None = None
        self._script_attrs: dict[str, str] = {}
        self._script_text: list[str] = []
        self.modules: list[tuple[dict[str, str], str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return
        attrs_map = {key.lower(): (value or "") for key, value in attrs}
        classes = set((attrs_map.get("class") or "").split())
        if "__se_module_data" not in classes:
            self._script_class = None
            return
        self._script_class = "__se_module_data"
        self._script_attrs = attrs_map
        self._script_text = []

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "script":
            self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        if self._script_class is not None:
            self._script_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "script" or self._script_class is None:
            return
        self.modules.append((dict(self._script_attrs), "".join(self._script_text)))
        self._script_class = None
        self._script_attrs = {}
        self._script_text = []


def _json_values(raw: Any) -> Iterable[Any]:
    if not isinstance(raw, str):
        return
    text = html_lib.unescape(raw).strip()
    if not text:
        return
    # data-module-v2가 JSON 문자열 안에 JSON을 한 번 더 담는 경우를 허용한다.
    for _ in range(3):
        try:
            value = json.loads(text)
        except (TypeError, ValueError, json.JSONDecodeError):
            return
        yield value
        if not isinstance(value, str):
            return
        text = value.strip()


def _iter_v2_map_payloads(value: Any) -> Iterable[Mapping[str, Any]]:
    if isinstance(value, Mapping):
        if value.get("type") == "v2_map":
            yield value
        for child in value.values():
            yield from _iter_v2_map_payloads(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_v2_map_payloads(child)


def _normalise_map_place(raw_place: Any) -> dict[str, Any] | None:
    if not isinstance(raw_place, Mapping):
        return None
    result: dict[str, Any] = {}
    for field in ("placeId", "name", "address", "latlng", "tel", "bookingUrl"):
        value = raw_place.get(field)
        if isinstance(value, str):
            value = html_lib.unescape(value).strip() or None
        elif field == "placeId" and value is not None:
            value = str(value)
        if value is not None:
            result[field] = value
        else:
            result[field] = None
    if not any(result[field] not in (None, "") for field in ("placeId", "name", "address")):
        return None
    result["category_status"] = "unverified"
    return result


def _module_v2_map_places(attrs: Mapping[str, str], script_text: str) -> list[dict[str, Any]]:
    places: list[dict[str, Any]] = []
    seen: set[str] = set()
    raw_values = [attrs.get("data-module", ""), attrs.get("data-module-v2", "")]
    if script_text.strip():
        raw_values.append(script_text)
    for raw in raw_values:
        for value in _json_values(raw):
            for payload in _iter_v2_map_payloads(value):
                data = payload.get("data")
                data_values = list(_json_values(data)) if isinstance(data, str) else [data]
                for data_value in data_values:
                    if not isinstance(data_value, Mapping):
                        continue
                    raw_places = data_value.get("places")
                    if not isinstance(raw_places, list):
                        continue
                    for raw_place in raw_places:
                        place = _normalise_map_place(raw_place)
                        if place is None:
                            continue
                        fingerprint = json.dumps(
                            place, ensure_ascii=False, sort_keys=True, default=str
                        )
                        if fingerprint in seen:
                            continue
                        seen.add(fingerprint)
                        places.append(place)
    return places


def extract_v2_map_places(html_text: Any) -> list[dict[str, Any]]:
    """HTMLParser로 __se_module_data의 JSON을 읽어 모든 v2_map 장소를 반환한다."""

    if not isinstance(html_text, str) or not html_text:
        return []
    parser = _ModuleDataParser()
    try:
        parser.feed(html_text)
        parser.close()
    except (TypeError, ValueError):
        return []

    places: list[dict[str, Any]] = []
    seen: set[str] = set()
    for attrs, script_text in parser.modules:
        for place in _module_v2_map_places(attrs, script_text):
            fingerprint = json.dumps(place, ensure_ascii=False, sort_keys=True, default=str)
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            places.append(place)
    return places


def _normalise_place_component(value: Any) -> str:
    if value is None:
        return ""
    value = unicodedata.normalize("NFKC", str(value)).casefold()
    value = re.sub(r"\s+", "", value)
    return re.sub(r"[^\w가-힣]", "", value)


def _name_address_dedupe_key(place: Mapping[str, Any]) -> str | None:
    name = _normalise_place_component(place.get("name"))
    address = _normalise_place_component(place.get("address"))
    if not name and not address:
        return None
    return f"name_address:{name}|{address}"


def place_dedupe_key(place: Mapping[str, Any]) -> str | None:
    place_id = place.get("placeId")
    if place_id not in (None, ""):
        return f"place_id:{_normalise_place_component(place_id)}"
    return _name_address_dedupe_key(place)


def _representative_match_text(value: Any) -> str:
    return _normalise_place_component(_clean_text(value))


def score_representative_places(
    places: Sequence[Mapping[str, Any]],
    *,
    query: str,
    title: Any = "",
    description: Any = "",
) -> list[dict[str, Any]]:
    """지도 장소마다 대표 장소 판정 점수와 근거를 붙인다.

    점수는 검색 API의 title/description, 검색어에서 파생한 대상 지역과 지도
    address, 그리고 지도 순서만 사용한다. 카테고리/업종 또는 고정 상호 목록은
    판정에 사용하지 않는다.
    """

    title_text = _representative_match_text(title)
    description_text = _representative_match_text(description)
    scored: list[dict[str, Any]] = []
    for map_index, raw_place in enumerate(places):
        if not isinstance(raw_place, Mapping):
            continue
        place = dict(raw_place)
        name = _clean_text(place.get("name"))
        normalized_name = _representative_match_text(name)
        score = 0
        reasons: list[str] = []
        address_evidence = _representative_address_evidence(query, place.get("address"))
        name_in_title = bool(normalized_name and normalized_name in title_text)
        name_in_description = bool(normalized_name and normalized_name in description_text)
        name_text_evidence = name_in_title or name_in_description

        if name_in_title:
            score += 5
            reasons.append("name_in_title(+5)")
        if name_in_description:
            score += 3
            reasons.append("name_in_description(+3)")

        matched_areas = address_evidence["matched_area_terms"] + address_evidence["matched_districts"]
        if matched_areas:
            score += 3
            reasons.append(f"target_area_in_address:{','.join(matched_areas)}(+3)")
        elif address_evidence["area_mismatch"]:
            reasons.append("area_mismatch")
        else:
            reasons.append("target_area_missing")
        if map_index == 0:
            score += 1
            reasons.append("first_map(+1)")
        if not name:
            reasons.append("name_missing")
        elif not name_text_evidence:
            reasons.append("name_not_in_title_or_description")

        # v2_map에는 신뢰할 수 있는 category/업종 필드가 없으므로, 존재를
        # 확인한 척하지 않고 모든 출력 장소에 명시적으로 보류 상태를 남긴다.
        place["category_status"] = "unverified"
        place["representative_evidence"] = {
            "name_text_evidence": name_text_evidence,
            "name_in_title": name_in_title,
            "name_in_description": name_in_description,
            "target_area_evidence": address_evidence["target_area_evidence"],
            "area_mismatch": address_evidence["area_mismatch"],
            "matched_area_terms": address_evidence["matched_area_terms"],
            "matched_districts": address_evidence["matched_districts"],
            "mismatch_terms": address_evidence["mismatch_terms"],
            "first_map": map_index == 0,
        }
        place["representative_score"] = score
        place["representative_reasons"] = reasons
        scored.append(place)
    return scored


def choose_representative_place(
    scored_places: Sequence[Mapping[str, Any]],
    *,
    min_score: int = REPRESENTATIVE_MIN_SCORE,
    min_margin: int = REPRESENTATIVE_MIN_MARGIN,
) -> tuple[str, dict[str, Any] | None, list[str]]:
    """점수화된 장소에서 보수적으로 대표 장소를 확정한다.

    반환값은 ``(status, representative_place, decision_reasons)``다. 동점,
    근접 점수, 이름 누락, 근거 부족은 모두 ``review_required``로 남긴다.
    """

    candidates = [place for place in scored_places if isinstance(place, Mapping)]
    if not candidates:
        return "no_place", None, ["no_map_place"]

    def score_of(place: Mapping[str, Any]) -> int:
        try:
            return int(place.get("representative_score") or 0)
        except (TypeError, ValueError):
            return 0

    ordered = sorted(
        enumerate(candidates),
        key=lambda item: (-score_of(item[1]), item[0], str(item[1].get("placeId") or "")),
    )
    top_index, top = ordered[0]
    top_score = score_of(top)
    reasons: list[str] = []
    name = _clean_text(top.get("name"))
    evidence = top.get("representative_evidence")
    if not isinstance(evidence, Mapping):
        evidence = {}
        reasons.append("evidence_flags_missing")

    if not name:
        reasons.append("top_place_name_missing")
    if top_score < min_score:
        reasons.append(f"score_below_threshold:{top_score}<{min_score}")
    if evidence.get("area_mismatch"):
        reasons.append("area_mismatch")
    if not evidence.get("target_area_evidence"):
        reasons.append("target_area_evidence_missing")
    if not evidence.get("name_text_evidence"):
        reasons.append("name_text_evidence_missing")
    if not evidence.get("target_area_evidence") or not evidence.get("name_text_evidence"):
        reasons.append("insufficient_text_or_region_evidence")

    if len(ordered) > 1:
        second_score = score_of(ordered[1][1])
        margin = top_score - second_score
        if margin == 0:
            reasons.append("score_tie")
        elif margin < min_margin:
            reasons.append(f"score_margin_too_small:{margin}<{min_margin}")

    if reasons:
        return "review_required", None, reasons
    # Keep the original map order for deterministic representative output. The
    # index is intentionally otherwise unused after tie/margin evaluation.
    _ = top_index
    return "auto_confirmed", dict(top), ["unique_highest_score_with_sufficient_evidence"]


def _representative_score_rows(scored_places: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for place in scored_places:
        try:
            score = int(place.get("representative_score") or 0)
        except (TypeError, ValueError):
            score = 0
        place_reasons = place.get("representative_reasons")
        rows.append(
            {
                "placeId": place.get("placeId"),
                "name": place.get("name"),
                "address": place.get("address"),
                "score": score,
                "reasons": list(place_reasons) if isinstance(place_reasons, list) else [],
            }
        )
    return rows


def aggregate_places(post_records: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """본문별 장소를 placeId 우선/name+address fallback으로 집계한다."""

    groups: dict[str, dict[str, Any]] = {}
    fallback_indexes: dict[str, str] = {}
    for record in post_records:
        if not isinstance(record, Mapping):
            continue
        places = record.get("places")
        if not isinstance(places, list):
            continue
        source = {
            key: record.get(key)
            for key in ("query", "link", "bloggerlink", "postdate", "title", "selection_bucket")
            if record.get(key) not in (None, "")
        }
        for raw_place in places:
            if not isinstance(raw_place, Mapping):
                continue
            primary_key = place_dedupe_key(raw_place)
            fallback_key = _name_address_dedupe_key(raw_place)
            if primary_key is None:
                continue
            has_place_id = raw_place.get("placeId") not in (None, "")
            key = primary_key
            indexed_key = fallback_indexes.get(fallback_key) if fallback_key else None
            if not has_place_id and indexed_key is not None:
                # ID가 없는 후속 map은 먼저 발견한 placeId/name-address group에
                # 합친다. 서로 다른 placeId끼리는 fallback 문자열만 같아도
                # placeId 우선 원칙을 유지한다.
                key = indexed_key
            elif has_place_id and indexed_key == fallback_key and fallback_key in groups:
                # ID가 늦게 등장하면 기존 fallback group을 placeId key로 승격한다.
                group_to_upgrade = groups.pop(fallback_key)
                group_to_upgrade["dedupe_key"] = primary_key
                groups[primary_key] = group_to_upgrade
                for index_key, index_value in list(fallback_indexes.items()):
                    if index_value == fallback_key:
                        fallback_indexes[index_key] = primary_key
                key = primary_key
            group = groups.setdefault(
                key,
                {
                    "dedupe_key": key,
                    "placeId": None,
                    "name": None,
                    "address": None,
                    "latlng": None,
                    "tel": None,
                    "bookingUrl": None,
                    "category_status": "unverified",
                    "representative_score": None,
                    "representative_reasons": [],
                    "queries": set(),
                    "links": set(),
                    "bloggers": set(),
                    "source_posts": [],
                    "_source_keys": set(),
                },
            )
            if fallback_key:
                fallback_indexes.setdefault(fallback_key, key)
            for field in ("placeId", "name", "address", "latlng", "tel", "bookingUrl"):
                if group[field] in (None, "") and raw_place.get(field) not in (None, ""):
                    group[field] = raw_place.get(field)
            try:
                raw_score = int(raw_place.get("representative_score"))
            except (TypeError, ValueError):
                raw_score = None
            if raw_score is not None and (
                group["representative_score"] is None or raw_score > group["representative_score"]
            ):
                group["representative_score"] = raw_score
                raw_reasons = raw_place.get("representative_reasons")
                group["representative_reasons"] = (
                    list(raw_reasons) if isinstance(raw_reasons, list) else []
                )
            elif raw_score is not None and raw_score == group["representative_score"]:
                raw_reasons = raw_place.get("representative_reasons")
                if isinstance(raw_reasons, list):
                    group["representative_reasons"] = sorted(
                        set(group["representative_reasons"]) | set(raw_reasons)
                    )
            if source.get("query"):
                group["queries"].add(source["query"])
            if source.get("link"):
                group["links"].add(source["link"])
            blogger = _blogger_identity(source.get("bloggerlink"))
            if blogger:
                group["bloggers"].add(blogger)
            source_key = json.dumps(source, ensure_ascii=False, sort_keys=True, default=str)
            if source_key not in group["_source_keys"]:
                group["_source_keys"].add(source_key)
                group["source_posts"].append(source)

    output: list[dict[str, Any]] = []
    for key in sorted(groups):
        group = groups[key]
        source_posts = sorted(
            group["source_posts"],
            key=lambda source: (
                str(source.get("postdate") or ""),
                str(source.get("query") or ""),
                str(source.get("link") or ""),
            ),
            reverse=True,
        )
        output.append(
            {
                "dedupe_key": group["dedupe_key"],
                "placeId": group["placeId"],
                "name": group["name"],
                "address": group["address"],
                "latlng": group["latlng"],
                "tel": group["tel"],
                "bookingUrl": group["bookingUrl"],
                "category_status": "unverified",
                "representative_score": group["representative_score"],
                "representative_reasons": group["representative_reasons"],
                "queries": sorted(group["queries"]),
                "links": sorted(group["links"]),
                "bloggers": sorted(group["bloggers"]),
                "unique_link_count": len(group["links"]),
                "unique_blogger_count": len(group["bloggers"]),
                "mention_count": len(source_posts),
                "source_posts": source_posts,
            }
        )
    return output


def _fetch_result_for(fetcher: Any, link: str) -> BodyFetchResult:
    result = fetcher.fetch(link) if hasattr(fetcher, "fetch") else fetcher(link)
    if isinstance(result, BodyFetchResult):
        return result
    if isinstance(result, Mapping):
        return BodyFetchResult(
            requested_url=str(result.get("requested_url") or link),
            html=result.get("html"),
            fetched_url=result.get("fetched_url"),
            reason=result.get("reason"),
            request_count=int(result.get("request_count") or 0),
        )
    raise TypeError("fetcher는 BodyFetchResult 또는 그에 준하는 mapping을 반환해야 합니다.")


def extract_selected_posts(
    selected_posts: Sequence[Mapping[str, Any]],
    *,
    fetch_bodies: bool,
    fetcher: Any = None,
) -> tuple[list[dict[str, Any]], Counter[str], dict[str, Any]]:
    """선택된 글을 본문/지도까지 처리한다. 동일 link는 한 번만 조회한다."""

    unique_links_set: set[str] = set()
    for post in selected_posts:
        link = normalize_blog_url(post.get("link"))
        if link is not None:
            unique_links_set.add(link)
    unique_links = sorted(unique_links_set)
    results_by_link: dict[str, BodyFetchResult] = {}
    reason_counts: Counter[str] = Counter()
    stats: dict[str, Any] = {"body_requests": 0, "unique_links": len(unique_links)}

    if fetch_bodies:
        active_fetcher = fetcher or BlogBodyFetcher()
        for link in unique_links:
            try:
                result = _fetch_result_for(active_fetcher, link)
            except Exception:  # noqa: BLE001 - count an individual fetch failure and continue
                result = BodyFetchResult(link, None, None, "fetcher_error")
            results_by_link[link] = result
            stats["body_requests"] += result.request_count
            if result.reason:
                reason_counts[f"body:{result.reason}"] += 1
            else:
                places = extract_v2_map_places(result.html)
                if not places:
                    reason_counts["map_not_found"] += 1
    else:
        reason_counts["body_not_requested"] = len(unique_links)

    extracted: list[dict[str, Any]] = []
    for selected in selected_posts:
        link = normalize_blog_url(selected.get("link"))
        if link is None:
            continue
        base = dict(selected)
        base["link"] = link
        if not fetch_bodies:
            base.update(
                {
                    "body_status": "skipped",
                    "failure_reason": "fetch_bodies_not_enabled",
                    "places": [],
                    "representative_status": "skipped",
                    "representative_place": None,
                    "representative_scores": [],
                    "representative_reasons": ["fetch_bodies_not_enabled"],
                }
            )
        else:
            result = results_by_link[link]
            places = [] if result.reason else extract_v2_map_places(result.html)
            if result.reason:
                representative_status = "body_failed"
                representative_place = None
                representative_scores: list[dict[str, Any]] = []
                representative_reasons = [f"body_fetch_failed:{result.reason}"]
            elif not places:
                representative_status = "no_place"
                representative_place = None
                representative_scores = []
                representative_reasons = ["no_v2_map_place"]
            else:
                places = score_representative_places(
                    places,
                    query=str(selected.get("query") or ""),
                    title=selected.get("title", ""),
                    description=selected.get("description", ""),
                )
                representative_status, representative_place, representative_reasons = (
                    choose_representative_place(places)
                )
                representative_scores = _representative_score_rows(places)
            base.update(
                {
                    "body_status": "failed" if result.reason else "fetched",
                    "failure_reason": result.reason,
                    "fetched_url": result.fetched_url,
                    "places": places,
                    "representative_status": representative_status,
                    "representative_place": representative_place,
                    "representative_scores": representative_scores,
                    "representative_reasons": representative_reasons,
                }
            )
        extracted.append(base)
    status_counts = Counter(str(post.get("representative_status") or "") for post in extracted)
    map_found_posts = sum(1 for post in extracted if post.get("places"))
    auto_confirmed = status_counts["auto_confirmed"]
    stats.update(
        {
            "selected_posts": len(extracted),
            "fetched_posts": status_counts["auto_confirmed"]
            + status_counts["review_required"]
            + status_counts["no_place"],
            "map_found_posts": map_found_posts,
            "extracted_place_count": sum(
                len(post.get("places", []))
                for post in extracted
                if isinstance(post.get("places"), list)
            ),
            "auto_confirmed": auto_confirmed,
            "review_required": status_counts["review_required"],
            "no_map": status_counts["no_place"],
            "body_failed": status_counts["body_failed"],
            "skipped": status_counts["skipped"],
        }
    )
    stats["auto_confirm_rate"] = round(
        auto_confirmed / map_found_posts * 100, 1
    ) if map_found_posts else 0.0
    stats["auto_confirm_rate_basis"] = "map_found_posts"
    return extracted, reason_counts, stats


def _json_dump(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def write_artifacts(
    output_dir: Path,
    *,
    run_id: str,
    analysis_start: date,
    analysis_end: date,
    selected_posts: Sequence[Mapping[str, Any]],
    extracted_posts: Sequence[Mapping[str, Any]],
    places: Sequence[Mapping[str, Any]],
    reason_counts: Mapping[str, int],
    stats: Mapping[str, Any],
) -> dict[str, Path]:
    """raw 결과와 분리된 selected/extracted JSON 및 사람이 읽는 report를 저장한다."""

    output_dir.mkdir(parents=True, exist_ok=True)
    common = {
        "schema_version": 2,
        "run_id": run_id,
        "analysis_period": {"start": analysis_start.isoformat(), "end": analysis_end.isoformat()},
        "stats": dict(stats),
        "failure_reason_counts": dict(sorted(reason_counts.items())),
    }
    selected_path = output_dir / f"selected-posts_{run_id}.json"
    extracted_path = output_dir / f"extracted-places_{run_id}.json"
    summary_path = output_dir / f"place-summary_{run_id}.txt"
    _json_dump(selected_path, {**common, "selected_posts": list(selected_posts)})
    _json_dump(
        extracted_path,
        {**common, "extracted_posts": list(extracted_posts), "places": list(places)},
    )

    lines = [
        "Naver Blog v2_map 장소 후보 MVP",
        f"분석 기간: {analysis_start.isoformat()} ~ {analysis_end.isoformat()}",
        f"선택 글: {stats.get('selected_posts', 0)}개 / 고유 link: {stats.get('unique_links', 0)}개",
        f"본문 조회: {'실행' if stats.get('fetch_bodies') else '생략(--fetch-bodies 필요)'}, 요청: {stats.get('body_requests', 0)}회",
        f"fetched posts: {stats.get('fetched_posts', 0)}개",
        f"map found posts: {stats.get('map_found_posts', 0)}개",
        f"extracted place count: {stats.get('extracted_place_count', 0)}개 (고유 {len(places)}개)",
        f"auto confirmed: {stats.get('auto_confirmed', 0)}개",
        f"review required: {stats.get('review_required', 0)}개",
        f"no map: {stats.get('no_map', 0)}개",
        f"body failed: {stats.get('body_failed', 0)}개",
        f"skipped: {stats.get('skipped', 0)}개",
        f"auto-confirm rate: {stats.get('auto_confirm_rate', 0.0):.1f}% (map found posts 기준)",
        "",
        "[실패/생략 사유]",
    ]
    if reason_counts:
        lines.extend(f"- {key}: {value}" for key, value in sorted(reason_counts.items()))
    else:
        lines.append("- 없음")
    lines.extend(["", "[장소별 집계]"])
    if places:
        for place in places:
            label = place.get("name") or "(이름 없음)"
            address = place.get("address") or "주소 없음"
            lines.append(
                f"- {label} | {address} | links={place.get('unique_link_count', 0)} "
                f"bloggers={place.get('unique_blogger_count', 0)} | queries={','.join(place.get('queries', []))}"
            )
    else:
        lines.append("- 없음")
    with summary_path.open("w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    return {"selected_posts": selected_path, "extracted_places": extracted_path, "summary": summary_path}


def run_blog_place_pipeline(
    items_by_query: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    analysis_start: date,
    analysis_end: date,
    fetch_bodies: bool = False,
    fetcher: Any = None,
    output_dir: Path | None = None,
    run_id: str | None = None,
    author_cap: int = DEFAULT_AUTHOR_CAP,
    quotas: Mapping[str, int] | None = None,
) -> dict[str, Any]:
    """쿼리별 선택부터 장소 집계/아티팩트 저장까지 수행한다."""

    selected_posts: list[dict[str, Any]] = []
    selection_counts: dict[str, int] = {}
    for query, items in items_by_query.items():
        selected = select_posts(
            items,
            query,
            analysis_start=analysis_start,
            analysis_end=analysis_end,
            author_cap=author_cap,
            quotas=quotas,
        )
        selected_posts.extend(selected)
        selection_counts[query] = len(selected)

    extracted_posts, reason_counts, fetch_stats = extract_selected_posts(
        selected_posts,
        fetch_bodies=fetch_bodies,
        fetcher=fetcher,
    )
    places = aggregate_places(extracted_posts)
    stats: dict[str, Any] = {
        "queries": len(items_by_query),
        "selected_posts": len(selected_posts),
        "unique_links": fetch_stats["unique_links"],
        "body_requests": fetch_stats["body_requests"],
        "fetch_bodies": fetch_bodies,
        "places": len(places),
        "selection_counts": selection_counts,
    }
    for key in (
        "fetched_posts",
        "map_found_posts",
        "extracted_place_count",
        "auto_confirmed",
        "review_required",
        "no_map",
        "body_failed",
        "skipped",
        "auto_confirm_rate",
        "auto_confirm_rate_basis",
    ):
        stats[key] = fetch_stats.get(key, 0)
    stats["unique_place_count"] = len(places)
    artifacts: dict[str, Path] = {}
    if output_dir is not None:
        effective_run_id = run_id or time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        artifacts = write_artifacts(
            output_dir,
            run_id=effective_run_id,
            analysis_start=analysis_start,
            analysis_end=analysis_end,
            selected_posts=selected_posts,
            extracted_posts=extracted_posts,
            places=places,
            reason_counts=reason_counts,
            stats=stats,
        )
    return {
        "selected_posts": selected_posts,
        "extracted_posts": extracted_posts,
        "places": places,
        "reason_counts": reason_counts,
        "stats": stats,
        "artifacts": artifacts,
    }
