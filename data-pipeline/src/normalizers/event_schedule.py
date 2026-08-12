from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import time

OPEN_WINDOW = "OPEN_WINDOW"
SESSION = "SESSION"

_TIME_TOKEN = r"(?<!\d)\d{1,2}:\d{2}(?!\d)"
_TIME_PATTERN = re.compile(_TIME_TOKEN)
_RANGE_PATTERN = re.compile(
    rf"(?P<start>{_TIME_TOKEN})\s*[~～〜\-–—]\s*(?P<end>{_TIME_TOKEN})"
)
_UNTIL_PATTERN = re.compile(rf"(?P<end>{_TIME_TOKEN})\s*까지")
_WEEKDAY_PATTERN = re.compile(
    r"(?<![0-9가-힣])(?P<day>[월화수목금토일])(?:요일)?(?![가-힣])"
)
_WEEKDAY_RANGE_CHARS = "~～〜-–—"
_DURATION_PATTERN = re.compile(
    r"(?P<hours>\d+)\s*시간(?:\s*(?P<minutes>\d+)\s*분)?|(?P<minutes_only>\d+)\s*분"
)
_AMBIGUOUS_MARKERS = (
    "프로그램별 상이",
    "홈페이지 참고",
    "홈페이지 참조",
    "홈페이지를 참고",
    "시간 협의",
    "시간은 협의",
)
_WEEKDAY_INDEX = {day: index for index, day in enumerate("월화수목금토일", start=1)}


@dataclass(frozen=True)
class EventSchedule:
    """One conservative, repeatable schedule row derived from event_time.

    ``day_of_week`` uses ISO 1=Monday through 7=Sunday. ``None`` means that
    the source did not specify a day, so the row is applicable to every or an
    unspecified day. ``source_text`` is the complete raw schedule text used for
    traceability; the event's separate ``event_time`` field is never rewritten.
    """

    day_of_week: int | None
    start_time: time
    end_time: time | None
    schedule_kind: str
    duration_minutes: int | None
    source_text: str

    def __post_init__(self) -> None:
        if self.day_of_week is not None and not 1 <= self.day_of_week <= 7:
            raise ValueError("day_of_week must use ISO 1-7")
        if self.schedule_kind not in {OPEN_WINDOW, SESSION}:
            raise ValueError(f"unsupported schedule_kind: {self.schedule_kind}")
        if self.duration_minutes is not None and self.duration_minutes <= 0:
            raise ValueError("duration_minutes must be positive")
        if not self.source_text.strip():
            raise ValueError("source_text is required")


def _parse_time_token(value: str) -> time | None:
    hour_text, minute_text = value.split(":", 1)
    hour = int(hour_text)
    minute = int(minute_text)
    # 24:00 is deliberately unsupported: it is not representable by the
    # project's Python time / PostgreSQL TIME / Java LocalTime conventions.
    if hour > 23 or minute > 59:
        return None
    return time(hour=hour, minute=minute)


def _extract_duration(text: str) -> tuple[int | None, bool]:
    """Return one explicit duration, or invalid=False for no duration.

    More than one independent duration expression is ambiguous. A compound
    expression such as ``1시간 30분`` is captured as one match and normalized
    to 90 minutes.
    """
    matches = list(_DURATION_PATTERN.finditer(text))
    if not matches:
        return None, True
    if len(matches) != 1:
        return None, False

    match = matches[0]
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or match.group("minutes_only") or 0)
    total = hours * 60 + minutes
    if total <= 0:
        return None, False
    return total, True


def _remove_duration(text: str, match: re.Match[str]) -> str:
    return f"{text[:match.start()]} {text[match.end():]}"


def _weekday_days(prefix: str) -> tuple[set[int] | None, bool]:
    """Parse an explicit Korean weekday group from text before a time.

    The bool indicates whether weekday context was present. Returning None with
    context=True means the group contained unsupported prose and is unsafe to
    apply to a schedule.
    """
    matches = list(_WEEKDAY_PATTERN.finditer(prefix))
    has_context = bool(matches) or "매주" in prefix or "요일" in prefix
    if not matches:
        return None, has_context

    leftover = _WEEKDAY_PATTERN.sub("", prefix)
    leftover = re.sub(r"매주(?:마다)?", "", leftover)
    leftover = re.sub(r"[\s,、·./&+과및]+", "", leftover)
    leftover = re.sub(r"[~～〜\-–—]", "", leftover)
    if leftover:
        return None, True

    days: set[int] = set()
    for index, match in enumerate(matches):
        current = _WEEKDAY_INDEX[match.group("day")]
        days.add(current)
        if index + 1 >= len(matches):
            continue
        between = prefix[match.end():matches[index + 1].start()]
        if any(char in between for char in _WEEKDAY_RANGE_CHARS):
            next_day = _WEEKDAY_INDEX[matches[index + 1].group("day")]
            if current > next_day:
                return None, True
            days.update(range(current, next_day + 1))

    return days, True


def _derive_end_time(start_time: time, duration_minutes: int | None) -> time | None:
    if duration_minutes is None:
        return None
    total = start_time.hour * 60 + start_time.minute + duration_minutes
    if total >= 24 * 60:
        return None
    return time(hour=total // 60, minute=total % 60)


def _parse_clause(
    clause: str,
    source_text: str,
    duration_minutes: int | None,
) -> list[EventSchedule] | None:
    """Parse one safely paired weekday/time clause.

    ``None`` signals malformed or unsafe text and causes the whole parser to
    decline structured output. An empty list means this clause simply had no
    schedule-bearing expression (for example punctuation around a duration).
    """
    clause = clause.strip(" \t,;/")
    if not clause:
        return []

    time_matches = list(_TIME_PATTERN.finditer(clause))
    if not time_matches:
        return []
    parsed_times = [_parse_time_token(match.group()) for match in time_matches]
    if any(parsed is None for parsed in parsed_times):
        return None

    first_time = time_matches[0]
    days, has_weekday_context = _weekday_days(clause[:first_time.start()])
    if has_weekday_context and days is None:
        return None
    if _WEEKDAY_PATTERN.search(clause[first_time.end():]):
        # A later weekday group without an explicit clause boundary cannot be
        # paired safely with the earlier times.
        return None

    range_matches = list(_RANGE_PATTERN.finditer(clause))
    range_spans = {
        span
        for match in range_matches
        for span in (match.span("start"), match.span("end"))
    }
    until_matches = list(_UNTIL_PATTERN.finditer(clause))
    until_spans = {match.span("end") for match in until_matches}

    # An unpaired explicit 'until' expression is not enough to create a row.
    if until_matches and any(span not in range_spans for span in until_spans):
        return None

    applicable_days = sorted(days) if days else [None]
    schedules: list[EventSchedule] = []

    if range_matches:
        # If any time token is not part of a range (or an already paired
        # range-end '까지'), mixing ranges and sessions is ambiguous.
        if any(match.span() not in range_spans and match.span() not in until_spans for match in time_matches):
            return None
        for match in range_matches:
            start_time = _parse_time_token(match.group("start"))
            end_time = _parse_time_token(match.group("end"))
            if start_time is None or end_time is None:
                return None
            for day in applicable_days:
                schedules.append(
                    EventSchedule(
                        day_of_week=day,
                        start_time=start_time,
                        end_time=end_time,
                        schedule_kind=OPEN_WINDOW,
                        duration_minutes=None,
                        source_text=source_text,
                    )
                )
        return schedules

    session_matches = [match for match in time_matches if match.span() not in until_spans]
    if not session_matches:
        return []
    for match in session_matches:
        start_time = _parse_time_token(match.group())
        if start_time is None:
            return None
        end_time = _derive_end_time(start_time, duration_minutes)
        for day in applicable_days:
            schedules.append(
                EventSchedule(
                    day_of_week=day,
                    start_time=start_time,
                    end_time=end_time,
                    schedule_kind=SESSION,
                    duration_minutes=duration_minutes,
                    source_text=source_text,
                )
            )
    return schedules


def parse_event_schedules(raw_event_time: str | None) -> tuple[EventSchedule, ...]:
    """Conservatively normalize verified public event schedule formats.

    Supported forms are explicit ranges (OPEN_WINDOW), weekday-qualified ranges
    or session lists, multiple slash-separated ranges, and explicit session
    durations. Ellipses, newlines, and semicolons are accepted as explicit
    clause boundaries. Text with unsupported/ambiguous wording, malformed time
    values, or unpaired weekday clauses produces no rows so a loader can retain
    previously valid schedules.
    """
    if not raw_event_time:
        return ()
    source_text = raw_event_time.strip()
    if not source_text:
        return ()
    if any(marker in source_text for marker in _AMBIGUOUS_MARKERS):
        return ()

    duration_matches = list(_DURATION_PATTERN.finditer(source_text))
    if len(duration_matches) > 1:
        return ()
    duration_minutes, duration_valid = _extract_duration(source_text)
    if not duration_valid:
        return ()
    parse_text = source_text
    if duration_matches:
        parse_text = _remove_duration(parse_text, duration_matches[0])

    # These separators are explicit enough to pair different weekday groups.
    clauses = re.split(r"(?:\.{3,}|…+|[\r\n;]+)", parse_text)
    all_schedules: list[EventSchedule] = []
    for clause in clauses:
        parsed = _parse_clause(clause, source_text, duration_minutes)
        if parsed is None:
            return ()
        all_schedules.extend(parsed)

    # Keep output immutable and deterministic even when a source repeats one
    # clause verbatim. The database uniqueness constraint remains the final
    # rerun/idempotency guard.
    unique: dict[tuple[object, ...], EventSchedule] = {}
    for schedule in all_schedules:
        key = (
            schedule.day_of_week,
            schedule.start_time,
            schedule.end_time,
            schedule.schedule_kind,
            schedule.duration_minutes,
            schedule.source_text,
        )
        unique.setdefault(key, schedule)
    return tuple(unique.values())


# Singular alias keeps call sites readable and provides a stable parser entry
# point for tests and future pipeline consumers.
parse_event_schedule = parse_event_schedules
