from __future__ import annotations

from dataclasses import dataclass, field

import psycopg

from src.normalizers.event_schedule import EventSchedule
from src.normalizers.event import EventDTO
from src.normalizers.seoul_culture_event import CultureEventDTO


@dataclass
class EventLoadStats:
    inserted: int = 0
    updated: int = 0
    place_matched: int = 0
    place_unmatched: int = 0
    unmatched_venues: list[str] = field(default_factory=list)


def _find_place_id(conn: psycopg.Connection, venue_name: str | None, district: str | None) -> int | None:
    """venue_name으로 기존 place를 정확히 하나만 찾을 수 있을 때만 연결한다(추측성 매칭 금지).

    이름이 정확히 같은 place가 district 안에서 1건이면 그 id, 0건/여러 건이면 None(비워둠).
    """
    if not venue_name:
        return None
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM place WHERE name = %s AND (district = %s OR %s::text IS NULL)",
            (venue_name, district, district),
        )
        rows = cur.fetchall()
    if len(rows) == 1:
        return rows[0][0]
    return None


def _replace_event_schedules(
    conn: psycopg.Connection,
    event_id: int,
    schedules: tuple[EventSchedule, ...],
) -> None:
    """Replace reliable derived rows in the caller's transaction.

    An empty tuple means parsing was ambiguous or unavailable. In that case the
    existing rows are intentionally preserved so a transient source response
    cannot erase previously valid itinerary data. The caller commits the event
    and these rows together.
    """
    if not schedules:
        return

    with conn.cursor() as cur:
        cur.execute("DELETE FROM event_schedule WHERE event_id = %s", (event_id,))
        for schedule in schedules:
            cur.execute(
                """
                INSERT INTO event_schedule (
                    event_id, day_of_week, start_time, end_time,
                    schedule_kind, duration_minutes, source_text
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ON CONSTRAINT uq_event_schedule_identity DO NOTHING
                """,
                (
                    event_id,
                    schedule.day_of_week,
                    schedule.start_time,
                    schedule.end_time,
                    schedule.schedule_kind,
                    schedule.duration_minutes,
                    schedule.source_text,
                ),
            )


def load_event(conn: psycopg.Connection, dto: EventDTO, stats: EventLoadStats) -> None:
    place_id = _find_place_id(conn, dto.venue_name, dto.district)
    if place_id is not None:
        stats.place_matched += 1
    else:
        stats.place_unmatched += 1
        if dto.venue_name:
            stats.unmatched_venues.append(dto.venue_name)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM event WHERE source = %s AND source_id = %s",
            (dto.source, dto.source_id),
        )
        existing = cur.fetchone()

        if existing:
            event_id = existing[0]
            cur.execute(
                """
                UPDATE event SET
                    place_id = COALESCE(place_id, %s),
                    title = %s,
                    event_type = %s,
                    start_date = %s,
                    end_date = %s,
                    event_time = %s,
                    event_start_time = %s,
                    event_end_time = %s
                WHERE id = %s
                """,
                (
                    place_id, dto.title, dto.event_type, dto.start_date, dto.end_date,
                    dto.event_time, dto.event_start_time, dto.event_end_time, event_id,
                ),
            )
            stats.updated += 1
        else:
            cur.execute(
                """
                INSERT INTO event (
                    place_id, title, event_type, start_date, end_date, event_time,
                    event_start_time, event_end_time, source, source_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    place_id, dto.title, dto.event_type, dto.start_date, dto.end_date,
                    dto.event_time, dto.event_start_time, dto.event_end_time, dto.source, dto.source_id,
                ),
            )
            inserted = cur.fetchone()
            event_id = inserted[0] if inserted else None
            stats.inserted += 1

    if event_id is not None:
        _replace_event_schedules(conn, event_id, dto.schedules)


def load_culture_event(conn: psycopg.Connection, dto: CultureEventDTO, stats: EventLoadStats) -> None:
    """서울시 문화행사 정보(culturalEventInfo) DTO 적재. 좌표/기관/요금 등 부가 컬럼까지 채운다."""
    place_id = _find_place_id(conn, dto.venue_name, dto.district)
    if place_id is not None:
        stats.place_matched += 1
    else:
        stats.place_unmatched += 1
        if dto.venue_name:
            stats.unmatched_venues.append(dto.venue_name)

    lng, lat = (dto.longitude, dto.latitude) if dto.has_coordinates else (None, None)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM event WHERE source = %s AND source_id = %s",
            (dto.source, dto.source_id),
        )
        existing = cur.fetchone()

        if existing:
            event_id = existing[0]
            cur.execute(
                """
                UPDATE event SET
                    place_id = COALESCE(place_id, %s),
                    title = %s,
                    event_type = %s,
                    start_date = %s,
                    end_date = %s,
                    apply_date = %s,
                    venue_name = %s,
                    org_name = %s,
                    use_target = %s,
                    use_fee = %s,
                    inquiry = %s,
                    homepage_url = %s,
                    main_image = %s,
                    event_time = %s,
                    event_start_time = %s,
                    event_end_time = %s,
                    detail_url = %s,
                    location = CASE WHEN %s IS NOT NULL AND %s IS NOT NULL
                                     THEN ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                                     ELSE location END
                WHERE id = %s
                """,
                (
                    place_id, dto.title, dto.event_type, dto.start_date, dto.end_date, dto.apply_date,
                    dto.venue_name, dto.org_name, dto.use_target, dto.use_fee, dto.inquiry,
                    dto.homepage_url, dto.main_image, dto.event_time,
                    dto.event_start_time, dto.event_end_time, dto.detail_url,
                    lng, lat, lng, lat,
                    event_id,
                ),
            )
            stats.updated += 1
        else:
            cur.execute(
                """
                INSERT INTO event (
                    place_id, title, event_type, start_date, end_date, source, source_id,
                    apply_date, venue_name, org_name, use_target, use_fee, inquiry,
                    homepage_url, main_image, event_time, event_start_time, event_end_time,
                    detail_url, location
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    CASE WHEN %s IS NOT NULL AND %s IS NOT NULL
                         THEN ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                         ELSE NULL END
                )
                RETURNING id
                """,
                (
                    place_id, dto.title, dto.event_type, dto.start_date, dto.end_date, dto.source, dto.source_id,
                    dto.apply_date, dto.venue_name, dto.org_name, dto.use_target, dto.use_fee, dto.inquiry,
                    dto.homepage_url, dto.main_image, dto.event_time,
                    dto.event_start_time, dto.event_end_time, dto.detail_url,
                    lng, lat, lng, lat,
                ),
            )
            inserted = cur.fetchone()
            event_id = inserted[0] if inserted else None
            stats.inserted += 1

    if event_id is not None:
        _replace_event_schedules(conn, event_id, dto.schedules)
