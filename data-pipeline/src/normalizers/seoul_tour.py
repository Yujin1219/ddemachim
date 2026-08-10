from __future__ import annotations

from typing import Any

from src.cleaners.common import (
    clean_phone,
    clean_text,
    extract_district,
    normalize_place_name,
    strip_leading_zipcode,
)
from src.models.place_dto import PlaceDTO


def normalize_record(raw: dict[str, Any]) -> PlaceDTO | None:
    """서울시 관광명소 CSV 1행을 PlaceDTO로 변환한다.

    이 소스는 좌표가 없어 has_coordinates=False로 고정된다. category_code는 'ATTRACTION' 고정값을
    쓴다 — 데이터셋 자체가 "서울시 관광 명소"라 그 이상의 세부 카테고리 근거는 없지만, 완전히
    무근거는 아니다. 기존 place에 병합(AUTO_MATCH)될 때는 로더가 COALESCE로 처리해서 TourAPI/
    RedTable이 이미 준 더 구체적인 카테고리를 덮어쓰지 않는다 — 이 값은 오직 이 소스만으로
    신규 place가 만들어질 때(예: 운현궁처럼 TourAPI가 못 커버한 곳)만 실제로 쓰인다.
    """
    name = clean_text(raw.get("상호명"))
    unique_id = clean_text(raw.get("고유번호"))
    if name is None or unique_id is None:
        return None

    road_address = strip_leading_zipcode(clean_text(raw.get("신주소")))
    lot_address = clean_text(raw.get("주소"))
    district = extract_district(road_address) or extract_district(lot_address)

    tags_raw = clean_text(raw.get("태그"))
    tags = [t.strip() for t in tags_raw.split(",")] if tags_raw else []

    return PlaceDTO(
        name=name,
        road_address=road_address,
        lot_address=lot_address,
        latitude=None,
        longitude=None,
        phone=clean_phone(raw.get("전화번호")),
        raw_category=None,
        description=None,
        source="SEOUL_TOUR",
        source_id=unique_id,
        district=district,
        normalized_name=normalize_place_name(name),
        category_code="ATTRACTION",
        has_coordinates=False,
        extra={
            "content_url": clean_text(raw.get("콘텐츠URL")),
            "website": clean_text(raw.get("웹사이트")),
            "fax": clean_text(raw.get("팩스번호")),
            "operating_hours_raw": clean_text(raw.get("운영시간")),
            "operating_days_raw": clean_text(raw.get("운영요일")),
            "closed_days_raw": clean_text(raw.get("휴무일")),
            "transit_info": clean_text(raw.get("교통정보")),
            "tags": tags,
            "accessibility": clean_text(raw.get("장애인편의시설")),
        },
    )


def filter_jongno(dtos: list[PlaceDTO]) -> list[PlaceDTO]:
    return [dto for dto in dtos if dto.district == "종로구"]
