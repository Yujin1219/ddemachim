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
from src.models.place_dto import PlaceDTO

TARGET_DISTRICT = "종로구"

# 실제 CSV 컬럼(2026-08-10, cp949로 열어 확인): 연번,미디어타입,제목,장소명,장소타입,장소설명,
# 영업시간,브레이크타임,휴무일,주소,위도,경도,전화번호,최종작성일
# 미디어타입 실관찰값: drama / movie / show / artist
# 장소타입 실관찰값(종로구 1,086건 전수): playground 563, restaurant 288, stay 101, cafe 80,
# store 38, station 16. restaurant/cafe/store처럼 명확한 것만 내부 카테고리로 매핑하고,
# playground/stay/station처럼 이 서비스 카테고리로 단정하기 애매한 값은 FILMING_LOCATION으로
# 남긴다(추측성 매핑 금지 — 이미 명확한 것만 반영).
PLACE_TYPE_CATEGORY_MAP: dict[str, str] = {
    "restaurant": "RESTAURANT",
    "cafe": "CAFE",
    "store": "SHOPPING",
}


def map_place_type_category(place_type_raw: str | None) -> str:
    if place_type_raw is None:
        return "FILMING_LOCATION"
    return PLACE_TYPE_CATEGORY_MAP.get(place_type_raw.strip(), "FILMING_LOCATION")


def normalize_record(raw: dict[str, Any]) -> PlaceDTO | None:
    """촬영지 CSV 1행(장소 x 작품 조합 1건)을 PlaceDTO로 변환한다.

    연번을 source_id로 쓴다(외부 PK가 아니라 이 소스 안에서 행을 유일하게 식별하는 값). 같은
    물리적 장소가 여러 작품에서 촬영되면 여러 행이 생기는데, 이건 place_matcher의
    normalized_name+district+좌표 매칭이 자동으로 같은 place로 병합해준다(place_source는
    행마다 별도로 남아 촬영지-작품 조인에 쓰인다).

    카테고리는 장소타입(restaurant/cafe/store)이 명확할 때만 내부 카테고리로 매핑하고,
    그 외(playground/stay/station 등 애매한 값)는 FILMING_LOCATION으로 남긴다
    (`map_place_type_category` 참고). description은 이 소스가 주는 게 "특정 장면 설명"이라
    일반 장소 설명과 성격이 달라 공용 description 컬럼을 오염시키지 않으려고 extra에만 담는다.
    """
    name = clean_text(raw.get("장소명"))
    seq = clean_text(raw.get("연번"))
    if name is None or seq is None:
        return None

    address = clean_text(raw.get("주소"))
    lat = parse_coordinate(raw.get("위도"))
    lng = parse_coordinate(raw.get("경도"))
    valid_coord = is_valid_seoul_coordinate(lat, lng)

    district = extract_district(address)

    title = clean_text(raw.get("제목"))
    media_type = clean_text(raw.get("미디어타입"))

    return PlaceDTO(
        name=name,
        road_address=address,
        lot_address=None,
        latitude=lat if valid_coord else None,
        longitude=lng if valid_coord else None,
        phone=clean_phone(raw.get("전화번호")),
        raw_category=clean_text(raw.get("장소타입")),
        description=None,
        source="FILMING_LOCATION",
        source_id=seq,
        district=district,
        normalized_name=normalize_place_name(name),
        category_code=map_place_type_category(clean_text(raw.get("장소타입"))),
        has_coordinates=valid_coord,
        extra={
            "title": title,
            "media_type": media_type,
            "place_type_raw": clean_text(raw.get("장소타입")),
            "scene_description": clean_text(raw.get("장소설명")),
            "operating_hours_raw": clean_text(raw.get("영업시간")),
            "break_time_raw": clean_text(raw.get("브레이크타임")),
            "closed_days_raw": clean_text(raw.get("휴무일")),
            "last_written_at": clean_text(raw.get("최종작성일")),
        },
    )


def filter_jongno(dtos: list[PlaceDTO]) -> list[PlaceDTO]:
    return [dto for dto in dtos if dto.district == TARGET_DISTRICT]
