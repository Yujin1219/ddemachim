"""Evidence-only topic candidate extraction from validated blog text."""
from __future__ import annotations

import html
import re
import unicodedata
from collections import defaultdict
from typing import Any, Iterable, Mapping, Sequence

from blog_trend_metrics import normalize_blogger_identity, normalize_blog_link, place_record_key


SCHEMA_VERSION = 1
DEFAULT_MIN_BLOGGERS = 3
DEFAULT_STOPWORDS = frozenset(
    {
        "그리고",
        "그래서",
        "정말",
        "너무",
        "진짜",
        "매우",
        "조금",
        "곳",
        "여기",
        "저기",
        "이번",
        "오늘",
        "방문",
        "방문기",
        "방문후기",
        "후기",
        "리뷰",
        "추천",
        "소개",
        "신상",
        "요즘",
        "핫플",
        "카페",
        "맛집",
        "식당",
        "음식점",
        "장소",
        "매장",
        "가게",
        "공간",
        "서울",
        "종로구",
        "안국",
        "익선동",
        "서촌",
        "북촌",
        "삼청동",
        "인사동",
        "광화문",
        "대학로",
    }
)
_WORD_RE = re.compile(r"[가-힣A-Za-z][가-힣A-Za-z0-9]{1,19}")
_PARTICLE_SUFFIXES = (
    "으로부터",
    "에서",
    "에게",
    "까지",
    "부터",
    "처럼",
    "보다",
    "으로",
    "라고",
    "이라",
    "에는",
    "에게",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "의",
    "와",
    "과",
    "도",
    "로",
    "만",
)


def _clean_text(value: Any) -> str:
    value = html.unescape(unicodedata.normalize("NFKC", str(value or "")))
    return re.sub(r"<[^>]*>", " ", value).strip()


def normalize_topic_term(value: Any) -> str:
    value = _clean_text(value).casefold()
    value = re.sub(r"[^0-9a-z가-힣\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _strip_particle(token: str) -> str:
    for suffix in sorted(_PARTICLE_SUFFIXES, key=len, reverse=True):
        if token.endswith(suffix) and len(token) - len(suffix) >= 2:
            return token[: -len(suffix)]
    return token


def _excluded(value: str, excluded_terms: set[str]) -> bool:
    normalized = normalize_topic_term(value).replace(" ", "")
    if not normalized:
        return True
    return any(normalized == term or (len(term) >= 3 and term in normalized) for term in excluded_terms)


def extract_topic_candidates(
    text: Any,
    *,
    place_name: str = "",
    aliases: Iterable[str] = (),
    regions: Iterable[str] = (),
    stopwords: Iterable[str] = DEFAULT_STOPWORDS,
) -> list[str]:
    """Return generic Korean token/phrase candidates without a menu dictionary."""

    raw = _clean_text(text)
    if not raw:
        return []
    stopword_set = {normalize_topic_term(word).replace(" ", "") for word in stopwords}
    excluded_terms = set(stopword_set)
    excluded_terms.update(
        normalize_topic_term(value).replace(" ", "")
        for value in (place_name, *aliases, *regions)
        if normalize_topic_term(value)
    )
    tokens: list[str] = []
    for match in _WORD_RE.findall(raw):
        token = normalize_topic_term(_strip_particle(match))
        compact = token.replace(" ", "")
        if len(compact) < 2 or len(compact) > 20 or compact in stopword_set:
            tokens.append("")
            continue
        if _excluded(token, excluded_terms):
            tokens.append("")
            continue
        tokens.append(token)

    candidates: set[str] = {token for token in tokens if token}
    # Whitespace n-grams are evidence candidates, not inferred categories. A
    # phrase is retained only when every component survives the same filters.
    for size in (2, 3):
        for index in range(0, max(0, len(tokens) - size + 1)):
            window = tokens[index : index + size]
            if any(not token for token in window):
                continue
            phrase = " ".join(window)
            compact = phrase.replace(" ", "")
            if len(compact) <= 24 and not _excluded(phrase, excluded_terms):
                candidates.add(phrase)
    return sorted(candidates)


def _validation_for_post(post: Mapping[str, Any], validation_index: Mapping[str, Mapping[str, Any]]) -> Mapping[str, Any] | None:
    for key in ("local_validation", "kakao_validation", "validation"):
        value = post.get(key)
        if isinstance(value, Mapping):
            return value
    representative = post.get("representative_place")
    if isinstance(representative, Mapping):
        return validation_index.get(place_record_key(representative))
    return None


def _validation_index(validation_records: Any) -> dict[str, Mapping[str, Any]]:
    if isinstance(validation_records, Mapping):
        values: Iterable[Any] = validation_records.values()
    elif isinstance(validation_records, Sequence) and not isinstance(validation_records, (str, bytes)):
        values = validation_records
    else:
        values = ()
    index: dict[str, Mapping[str, Any]] = {}
    for record in values:
        if not isinstance(record, Mapping):
            continue
        source_key = str(record.get("source_key", "") or "").strip()
        if source_key:
            index[source_key] = record
        representative = record.get("representative_place")
        if isinstance(representative, Mapping):
            index[place_record_key(representative)] = record
    return index


def extract_topics_for_place(
    posts: Sequence[Mapping[str, Any]],
    kakao_place_id: str,
    *,
    place_name: str = "",
    aliases: Iterable[str] = (),
    regions: Iterable[str] = (),
    validation_records: Any = None,
    min_bloggers: int = DEFAULT_MIN_BLOGGERS,
) -> list[dict[str, Any]]:
    """Extract terms supported by at least ``min_bloggers`` for one Kakao id."""

    if min_bloggers <= 0:
        raise ValueError("min_bloggers must be positive")
    target_id = str(kakao_place_id or "").strip()
    if not target_id:
        return []
    validation_index = _validation_index(validation_records)
    term_bloggers: dict[str, set[str]] = defaultdict(set)
    term_links: dict[str, set[str]] = defaultdict(set)
    term_evidence: dict[str, set[str]] = defaultdict(set)
    for post in posts:
        if not isinstance(post, Mapping):
            continue
        validation = _validation_for_post(post, validation_index)
        if not isinstance(validation, Mapping) or str(validation.get("status", "")) != "matched":
            continue
        matched_id = str(validation.get("matched_place_id", "") or "")
        matched = validation.get("matched_place")
        if not matched_id and isinstance(matched, Mapping):
            matched_id = str(matched.get("id", "") or "")
        if matched_id != target_id:
            continue
        blogger = normalize_blogger_identity(post.get("bloggerlink"))
        link = normalize_blog_link(post.get("link"))
        if not blogger or not link:
            continue
        text = f"{post.get('title', '')} {post.get('description', '')}"
        terms = extract_topic_candidates(
            text,
            place_name=place_name,
            aliases=aliases,
            regions=regions,
        )
        for term in terms:
            term_bloggers[term].add(blogger)
            term_links[term].add(link)
            term_evidence[term].add(term)

    rows: list[dict[str, Any]] = []
    for term in sorted(term_bloggers):
        bloggers = term_bloggers[term]
        if len(bloggers) < min_bloggers:
            continue
        rows.append(
            {
                "schema_version": SCHEMA_VERSION,
                "kakao_place_id": target_id,
                "topic_candidate": term,
                "unique_blogger_support": len(bloggers),
                "unique_link_support": len(term_links[term]),
                "evidence_terms": sorted(term_evidence[term]),
                "minimum_bloggers": min_bloggers,
                "evidence_only": True,
            }
        )
    rows.sort(key=lambda row: (-row["unique_blogger_support"], -row["unique_link_support"], row["topic_candidate"]))
    return rows


def extract_topics_for_places(
    posts: Sequence[Mapping[str, Any]],
    place_rows: Sequence[Mapping[str, Any]],
    *,
    validation_records: Any = None,
    min_bloggers: int = DEFAULT_MIN_BLOGGERS,
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for place in place_rows:
        if not isinstance(place, Mapping):
            continue
        place_id = str(place.get("kakao_place_id", place.get("id", "")) or "").strip()
        if not place_id:
            continue
        topics = extract_topics_for_place(
            posts,
            place_id,
            place_name=str(place.get("name", place.get("place_name", "")) or ""),
            aliases=place.get("aliases", []) if isinstance(place.get("aliases", []), Sequence) else (),
            regions=place.get("regions", []) if isinstance(place.get("regions", []), Sequence) else (),
            validation_records=validation_records,
            min_bloggers=min_bloggers,
        )
        output.extend(topics)
    return output
