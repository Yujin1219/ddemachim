from __future__ import annotations

import re

WEEKDAY_INDEX = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}

DAY_RANGE_PATTERN = re.compile(r"^([월화수목금토일])(?:요일)?\s*[~\-]\s*([월화수목금토일])(?:요일)?$")
TIME_RANGE_PATTERN = re.compile(r"(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})")
SINGLE_DAY_TOKEN_PATTERN = re.compile(r"([월화수목금토일])(?:요일)?")


def parse_open_days(operating_days_raw: str | None) -> set[int] | None:
    """'화요일~일요일', '화~일', '매일', '평일' 같은 단순 패턴만 파싱한다.
    복잡하거나 불명확하면 None(구조화 포기, 원문만 보존)."""
    if not operating_days_raw:
        return None
    text = operating_days_raw.strip()
    if text == "매일":
        return set(range(7))
    if text == "평일":
        return {0, 1, 2, 3, 4}

    compact = text.replace(" ", "")
    match = DAY_RANGE_PATTERN.match(compact)
    if match:
        start, end = WEEKDAY_INDEX[match.group(1)], WEEKDAY_INDEX[match.group(2)]
        if start <= end:
            return set(range(start, end + 1))
        return set(range(start, 7)) | set(range(0, end + 1))
    return None


def parse_single_time_range(operating_hours_raw: str | None) -> tuple[str, str] | None:
    """운영시간 원문에 시간 범위가 정확히 1개만 있을 때만 그 범위를 반환한다.
    2개 이상(요일별로 다른 시간)이거나 0개면 애매하다고 보고 None."""
    if not operating_hours_raw:
        return None
    matches = TIME_RANGE_PATTERN.findall(operating_hours_raw)
    if len(matches) != 1:
        return None
    h1, m1, h2, m2 = matches[0]
    return f"{int(h1):02d}:{m1}", f"{int(h2):02d}:{m2}"


def parse_explicit_closed_days(closed_days_raw: str | None) -> set[int]:
    """휴무일 원문에서 명시적인 요일 이름만 뽑는다('월요일, 1월 1일' -> {0}).
    '연중무휴'/'없음'/빈값이면 빈 집합."""
    if not closed_days_raw:
        return set()
    text = closed_days_raw.strip()
    if text in ("연중무휴", "없음"):
        return set()
    return {WEEKDAY_INDEX[d] for d in SINGLE_DAY_TOKEN_PATTERN.findall(text)}


def build_day_rows(
    operating_hours_raw: str | None,
    operating_days_raw: str | None,
    closed_days_raw: str | None,
) -> list[tuple[int, str | None, str | None, bool]] | None:
    """(day_of_week, open_time, close_time, is_closed) 7행을 만든다.
    시간 또는 요일 중 하나라도 애매하면 통째로 None(구조화 포기)."""
    open_days = parse_open_days(operating_days_raw)
    time_range = parse_single_time_range(operating_hours_raw)
    if open_days is None or time_range is None:
        return None

    explicit_closed = parse_explicit_closed_days(closed_days_raw) & open_days
    open_time, close_time = time_range

    rows = []
    for day in range(7):
        if day in explicit_closed or day not in open_days:
            rows.append((day, None, None, True))
        else:
            rows.append((day, open_time, close_time, False))
    return rows
