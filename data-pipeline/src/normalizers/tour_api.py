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
from src.config.categories import map_tourapi_category
from src.models.place_dto import PlaceDTO


def normalize_record(raw: dict[str, Any]) -> PlaceDTO | None:
    """TourAPI areaBasedList2(+detailCommon2 overview) 병합 레코드 1건을 PlaceDTO로 변환."""
    name = clean_text(raw.get("title"))
    content_id = raw.get("contentid")
    if name is None or content_id is None:
        return None

    addr1 = clean_text(raw.get("addr1"))
    addr2 = clean_text(raw.get("addr2"))
    full_address = " ".join(p for p in [addr1, addr2] if p) or None

    lat = parse_coordinate(raw.get("mapy"))  # mapy=위도
    lng = parse_coordinate(raw.get("mapx"))  # mapx=경도
    valid_coord = is_valid_seoul_coordinate(lat, lng)

    district = extract_district(addr1)

    return PlaceDTO(
        name=name,
        road_address=full_address,  # TourAPI는 도로명/지번을 분리해서 안 주므로 addr1+addr2를 road_address에 둔다
        lot_address=None,
        latitude=lat if valid_coord else None,
        longitude=lng if valid_coord else None,
        phone=clean_phone(raw.get("tel")),
        raw_category=str(raw.get("contenttypeid")) if raw.get("contenttypeid") else None,
        description=clean_text(raw.get("overview")),
        source="TOURAPI",
        source_id=str(content_id),
        district=district,
        normalized_name=normalize_place_name(name),
        category_code=map_tourapi_category(raw.get("contenttypeid")),
        has_coordinates=valid_coord,
    )


def filter_jongno(dtos: list[PlaceDTO]) -> list[PlaceDTO]:
    return [dto for dto in dtos if dto.district == "종로구"]
