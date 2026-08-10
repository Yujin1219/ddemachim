from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from src.cleaners.common import clean_text, extract_district


@dataclass
class EventDTO:
    title: str
    event_type: str | None
    start_date: date | None
    end_date: date | None
    source: str
    source_id: str
    district: str | None
    venue_name: str | None  # place 매칭용 참고 이름(장소명은 아니고 addr2/eventplace)


def _parse_yyyymmdd(value: str | None) -> date | None:
    """TourAPI eventstartdate/eventenddate(YYYYMMDD 문자열)을 date로 변환. 형식 불명확하면 None."""
    if not value or len(value) != 8 or not value.isdigit():
        return None
    try:
        return date(int(value[:4]), int(value[4:6]), int(value[6:8]))
    except ValueError:
        return None


def normalize_record(raw: dict[str, Any]) -> EventDTO | None:
    """TourAPI areaBasedList2(+detailIntro2 eventstartdate/eventenddate/eventplace) 병합 레코드를 EventDTO로 변환."""
    title = clean_text(raw.get("title"))
    content_id = raw.get("contentid")
    if title is None or content_id is None:
        return None

    addr1 = clean_text(raw.get("addr1"))
    district = extract_district(addr1)

    venue_name = clean_text(raw.get("eventplace")) or clean_text(raw.get("addr2"))

    return EventDTO(
        title=title,
        event_type="FESTIVAL",  # contentTypeId=15는 TourAPI 분류상 전부 "축제공연행사" 대분류라 세분류 없음
        start_date=_parse_yyyymmdd(raw.get("eventstartdate")),
        end_date=_parse_yyyymmdd(raw.get("eventenddate")),
        source="TOURAPI",
        source_id=str(content_id),
        district=district,
        venue_name=venue_name,
    )


def filter_jongno(dtos: list[EventDTO]) -> list[EventDTO]:
    return [dto for dto in dtos if dto.district == "종로구"]


def filter_ongoing_or_upcoming(dtos: list[EventDTO], today: date) -> list[EventDTO]:
    """오늘 기준 진행중이거나 예정인 것만 남긴다.

    end_date가 있으면 end_date >= today면 통과(진행중 포함).
    end_date가 없고 start_date만 있으면 start_date >= today일 때만 통과(언제 끝날지 모르니 시작 전이어야 안전).
    둘 다 없으면 판단 불가 — 지어내지 않고 제외한다.
    """
    result = []
    for dto in dtos:
        if dto.end_date is not None:
            if dto.end_date >= today:
                result.append(dto)
        elif dto.start_date is not None:
            if dto.start_date >= today:
                result.append(dto)
    return result
