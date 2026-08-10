from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Literal

from src.utils.logging import get_logger

logger = get_logger(__name__)

MediaKind = Literal["movie", "tv"]

# --- 신뢰도(confidence) 계산 기준 ---------------------------------------------
# 이 데이터셋(한국문화정보원 촬영지 CSV)에는 제작/방영 연도가 없어서, 원래 스펙에서
# 흔히 쓰는 "제목 + 연도 일치" 기준을 쓸 수 없다. 대신 아래 두 가지만으로 신뢰도를 낸다.
#
# 1) media_type 일치: drama/show -> TMDB search/tv, movie -> TMDB search/movie로
#    검색 엔드포인트 자체를 분기하므로, 검색 결과는 항상 media_type이 맞는 후보만 나온다.
#    (즉 media_type 불일치 후보는애초에 결과에 없음 — 별도 감점 로직 불필요)
# 2) 제목 유사도: CSV의 title과 TMDB 후보의 title/name, original_title/original_name을
#    공백/기호를 제거한 뒤 difflib.SequenceMatcher로 비교해 0~1 유사도를 낸다.
#    후보의 title과 original_title 중 더 높은 유사도를 그 후보의 점수로 쓴다.
#
# 최종 confidence = 검색 결과 중 최고 유사도 점수.
# - 정규화 후 완전히 동일한 문자열이면 1.0으로 취급(사소한 부동소수 오차 방지).
# - AUTO_MATCH_THRESHOLD 이상이면 자동 확정, 그 미만이면 REVIEW_REQUIRED로 남긴다.
#   (검색 결과가 아예 없는 경우도 REVIEW_REQUIRED 유지, confidence=None)
#
# 임계값은 보수적으로 잡았다 — 오매칭(가짜 데이터)보다 검토 대기가 훨씬 안전하다는
# 사용자 지시(원칙 1, 4)에 따라 0.90 이상만 자동 확정한다.
AUTO_MATCH_THRESHOLD = 0.90


def _normalize_title(title: str) -> str:
    """비교용 정규화: 소문자화 + 공백/구두점 제거."""
    if not title:
        return ""
    text = title.strip().lower()
    text = re.sub(r"[\s\.\,\!\?\'\"\:\;\-_~·・/\\]+", "", text)
    return text


def _title_similarity(query_title: str, candidate_title: str) -> float:
    norm_q = _normalize_title(query_title)
    norm_c = _normalize_title(candidate_title)
    if not norm_q or not norm_c:
        return 0.0
    if norm_q == norm_c:
        return 1.0
    return SequenceMatcher(None, norm_q, norm_c).ratio()


@dataclass
class MatchCandidate:
    tmdb_id: int
    media_type: MediaKind
    title: str
    original_title: str | None
    poster_path: str | None
    overview: str | None
    release_date: str | None
    confidence: float


def best_match(query_title: str, kind: MediaKind, results: list[dict[str, Any]]) -> MatchCandidate | None:
    """TMDB search 응답(results 리스트)에서 query_title과 가장 유사한 후보를 고른다.

    결과가 없으면 None. 결과가 있으면 유사도가 가장 높은 후보를 confidence와 함께 반환하되,
    AUTO_MATCH 여부 판단(threshold 비교)은 호출부에서 한다 — 이 함수는 "가장 그럴듯한 후보 +
    그 근거 점수"만 계산한다.
    """
    if not results:
        return None

    best: MatchCandidate | None = None
    for item in results:
        if kind == "movie":
            title = item.get("title") or ""
            original_title = item.get("original_title")
            release_date = item.get("release_date") or None
        else:
            title = item.get("name") or ""
            original_title = item.get("original_name")
            release_date = item.get("first_air_date") or None

        score_title = _title_similarity(query_title, title)
        score_original = _title_similarity(query_title, original_title or "")
        score = max(score_title, score_original)

        if best is None or score > best.confidence:
            best = MatchCandidate(
                tmdb_id=item["id"],
                media_type=kind,
                title=title,
                original_title=original_title,
                poster_path=item.get("poster_path"),
                overview=item.get("overview"),
                release_date=release_date,
                confidence=score,
            )

    return best


def is_auto_match(confidence: float) -> bool:
    return confidence >= AUTO_MATCH_THRESHOLD
