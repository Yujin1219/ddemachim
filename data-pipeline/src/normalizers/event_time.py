from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import time


# Keep this deliberately narrower than a general natural-language time parser. The
# public event fields are free-form text, so only an explicit HH:mm token is safe to
# promote to a structured TIME value.
_TIME_TOKEN = r"(?<!\d)\d{1,2}:\d{2}(?!\d)"
_TIME_PATTERN = re.compile(_TIME_TOKEN)
_RANGE_PATTERN = re.compile(
    rf"(?P<start>{_TIME_TOKEN})\s*[~～〜\-–—]\s*(?P<end>{_TIME_TOKEN})"
)
_UNTIL_PATTERN = re.compile(rf"(?P<end>{_TIME_TOKEN})\s*까지")


@dataclass(frozen=True)
class EventTimeBounds:
    """Structured event-time bounds extracted from one raw schedule string."""

    event_start_time: time | None
    event_end_time: time | None


def _parse_time_token(value: str) -> time | None:
    hour_text, minute_text = value.split(":", 1)
    hour = int(hour_text)
    minute = int(minute_text)

    # Python datetime.time, PostgreSQL TIME, and the backend's java.time.LocalTime
    # all use the 00:00-23:59 range. In particular, do not turn 24:00 into 00:00.
    if hour > 23 or minute > 59:
        return None
    return time(hour=hour, minute=minute)


def parse_event_time_bounds(raw_event_time: str | None) -> EventTimeBounds:
    """Parse conservative start/end bounds from raw public event-time text.

    The first non-end time token is the start candidate. An end is accepted only
    when exactly one explicit range end (``10:00~18:00``/``10:00-18:00``) or one
    explicit ``HH:mm까지`` expression exists. Multiple ranges or end expressions
    are intentionally ambiguous and leave the end unstructured.
    """
    if not raw_event_time:
        return EventTimeBounds(None, None)

    range_matches = list(_RANGE_PATTERN.finditer(raw_event_time))
    until_matches = list(_UNTIL_PATTERN.finditer(raw_event_time))

    # Range ends and '까지' times are not start candidates. Deduplicate a range
    # end followed by '까지' so "10:00~18:00까지" remains one explicit end.
    end_spans: set[tuple[int, int]] = set()
    end_candidates: list[tuple[tuple[int, int], str]] = []
    for match in range_matches:
        span = match.span("end")
        end_spans.add(span)
        end_candidates.append((span, match.group("end")))
    for match in until_matches:
        span = match.span("end")
        if span not in end_spans:
            end_spans.add(span)
            end_candidates.append((span, match.group("end")))

    # Preserve textual order and stop at the first candidate, including an
    # invalid one. Falling through an invalid first boundary could invent a
    # different start from a later token.
    start_candidate: str | None = None
    for match in _TIME_PATTERN.finditer(raw_event_time):
        if match.span() not in end_spans:
            start_candidate = match.group()
            break
    event_start_time = _parse_time_token(start_candidate) if start_candidate else None

    # A single explicit end is safe; selecting one end from weekday-specific
    # ranges would make an event appear ongoing or ended at the wrong time.
    event_end_time = None
    if len(end_candidates) == 1:
        event_end_time = _parse_time_token(end_candidates[0][1])

    return EventTimeBounds(event_start_time, event_end_time)
