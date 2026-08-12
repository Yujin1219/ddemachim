from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any

from src.cleaners.common import clean_text, is_valid_seoul_coordinate, parse_coordinate
from src.normalizers.event_time import parse_event_time_bounds
from src.normalizers.event_schedule import EventSchedule, parse_event_schedules

TARGET_DISTRICT = "종로구"


@dataclass
class CultureEventDTO:
    title: str
    event_type: str | None
    start_date: date | None
    end_date: date | None
    apply_date: date | None
    source: str
    source_id: str
    district: str | None
    venue_name: str | None
    org_name: str | None
    use_target: str | None
    use_fee: str | None
    inquiry: str | None
    homepage_url: str | None
    main_image: str | None
    event_time: str | None
    event_start_time: time | None
    event_end_time: time | None
    schedules: tuple[EventSchedule, ...]
    detail_url: str | None
    latitude: float | None
    longitude: float | None
    has_coordinates: bool

    @property
    def event_schedules(self) -> tuple[EventSchedule, ...]:
        """Explicit alias for consumers that prefer the table-oriented name."""
        return self.schedules


def _parse_datetime_str(value: str | None) -> date | None:
    """STRTDATE/END_DATE("2026-12-24 00:00:00.0")를 date로. 형식 안 맞으면 None(지어내지 않음)."""
    if not value:
        return None
    value = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_date_str(value: str | None) -> date | None:
    """RGSTDATE("2026-07-23")를 date로."""
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def normalize_record(raw: dict[str, Any]) -> CultureEventDTO | None:
    """서울시 문화행사 정보(culturalEventInfo) row 1건을 CultureEventDTO로 변환."""
    title = clean_text(raw.get("TITLE"))
    # 이 API는 자체 고유 ID를 안 줘서(문서/응답 모두 없음), (자치구+제목+시작일)을 합쳐 소스 내 유일키로 쓴다.
    strt = clean_text(raw.get("STRTDATE"))
    guname = clean_text(raw.get("GUNAME"))
    if title is None or strt is None:
        return None
    source_id = f"{guname}|{title}|{strt}"

    lat = parse_coordinate(raw.get("LAT"))
    lng = parse_coordinate(raw.get("LOT"))
    valid_coord = is_valid_seoul_coordinate(lat, lng)

    event_time = clean_text(raw.get("PRO_TIME"))
    time_bounds = parse_event_time_bounds(event_time)

    return CultureEventDTO(
        title=title,
        event_type=clean_text(raw.get("CODENAME")),
        start_date=_parse_datetime_str(raw.get("STRTDATE")),
        end_date=_parse_datetime_str(raw.get("END_DATE")),
        apply_date=_parse_date_str(raw.get("RGSTDATE")),
        source="SEOUL_CULTURE_EVENT",
        source_id=source_id,
        district=guname,
        venue_name=clean_text(raw.get("PLACE")),
        org_name=clean_text(raw.get("ORG_NAME")),
        use_target=clean_text(raw.get("USE_TRGT")),
        use_fee=clean_text(raw.get("USE_FEE")),
        inquiry=clean_text(raw.get("INQUIRY")),
        homepage_url=clean_text(raw.get("ORG_LINK")),
        main_image=clean_text(raw.get("MAIN_IMG")),
        event_time=event_time,
        event_start_time=time_bounds.event_start_time,
        event_end_time=time_bounds.event_end_time,
        schedules=parse_event_schedules(event_time),
        detail_url=clean_text(raw.get("HMPG_ADDR")),
        latitude=lat if valid_coord else None,
        longitude=lng if valid_coord else None,
        has_coordinates=valid_coord,
    )


def filter_jongno(dtos: list[CultureEventDTO]) -> list[CultureEventDTO]:
    return [dto for dto in dtos if dto.district == TARGET_DISTRICT]


def filter_ongoing_or_upcoming(dtos: list[CultureEventDTO], today: date) -> list[CultureEventDTO]:
    """오늘 기준 진행중이거나 예정인 것만. end_date 없으면 start_date 기준(끝을 모르니 시작 전만 통과)."""
    result = []
    for dto in dtos:
        if dto.end_date is not None:
            if dto.end_date >= today:
                result.append(dto)
        elif dto.start_date is not None:
            if dto.start_date >= today:
                result.append(dto)
    return result
