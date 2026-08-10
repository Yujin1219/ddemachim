from __future__ import annotations

from typing import Any

from src.cleaners.common import (
    clean_phone,
    clean_text,
    extract_district,
    is_valid_seoul_coordinate,
    normalize_place_name,
    parse_coordinate,
)
from src.config.categories import map_redtable_category
from src.models.place_dto import PlaceDTO

TARGET_DISTRICT = "종로구"


def normalize_record(raw: dict[str, Any]) -> PlaceDTO | None:
    """RedTable 원본 1건을 PlaceDTO로 변환. 이름이 없으면 None(폐기)."""
    name = clean_text(raw.get("RSTR_NM"))
    if name is None:
        return None

    road_address = clean_text(raw.get("RSTR_RDNMADR"))
    lot_address = clean_text(raw.get("RSTR_LNNO_ADRES"))
    lat = parse_coordinate(raw.get("RSTR_LA"))
    lng = parse_coordinate(raw.get("RSTR_LO"))
    valid_coord = is_valid_seoul_coordinate(lat, lng)

    district = extract_district(road_address) or extract_district(lot_address)

    return PlaceDTO(
        name=name,
        road_address=road_address,
        lot_address=lot_address,
        latitude=lat if valid_coord else None,
        longitude=lng if valid_coord else None,
        phone=clean_phone(raw.get("RSTR_TELNO")),
        raw_category=clean_text(raw.get("BSNS_STATM_BZCND_NM")),
        description=clean_text(raw.get("RSTR_INTRCN_CONT")),
        source="REDTABLE",
        source_id=str(raw.get("RSTR_ID")),
        district=district,
        normalized_name=normalize_place_name(name),
        category_code=map_redtable_category(clean_text(raw.get("BSNS_STATM_BZCND_NM"))),
        has_coordinates=valid_coord,
    )


def filter_jongno(dtos: list[PlaceDTO]) -> list[PlaceDTO]:
    return [dto for dto in dtos if dto.district == TARGET_DISTRICT]
