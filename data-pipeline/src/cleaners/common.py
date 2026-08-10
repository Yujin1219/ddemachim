from __future__ import annotations

import re

PLACEHOLDER_VALUES = {"", "null", "Null", "NULL", "-", "없음", "none", "None", "N/A", "n/a"}

# 서울 대략 경계 (여유 포함). 이 범위를 벗어나면 좌표 오류로 간주해 null 처리한다.
SEOUL_LAT_RANGE = (37.30, 37.75)
SEOUL_LNG_RANGE = (126.70, 127.30)


def clean_text(value: str | None) -> str | None:
    """trim + placeholder 정리. 값이 없거나 의미 없는 placeholder면 None."""
    if value is None:
        return None
    trimmed = value.strip()
    if trimmed in PLACEHOLDER_VALUES:
        return None
    return trimmed


def clean_phone(value: str | None) -> str | None:
    cleaned = clean_text(value)
    if cleaned is None:
        return None
    # 숫자/하이픈만 남기고 나머지 공백류 제거
    return re.sub(r"[^\d\-]", "", cleaned) or None


def parse_coordinate(value: str | None) -> float | None:
    cleaned = clean_text(value)
    if cleaned is None:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def is_valid_seoul_coordinate(lat: float | None, lng: float | None) -> bool:
    if lat is None or lng is None:
        return False
    lat_min, lat_max = SEOUL_LAT_RANGE
    lng_min, lng_max = SEOUL_LNG_RANGE
    return lat_min <= lat <= lat_max and lng_min <= lng <= lng_max


DISTRICT_PATTERN = re.compile(r"(서울특별시|서울시|서울)?\s*([가-힣]+구)\b")


def extract_district(address: str | None) -> str | None:
    if not address:
        return None
    match = DISTRICT_PATTERN.search(address)
    return match.group(2) if match else None


LEADING_ZIPCODE_PATTERN = re.compile(r"^\d{5}\s+")


def strip_leading_zipcode(address: str | None) -> str | None:
    """'03054 서울 종로구...' 형식 주소 앞의 우편번호를 뗀다. 카카오 주소검색이 우편번호가
    붙으면 매칭을 못 하는 걸 실호출로 확인했다(0건 -> 우편번호 제거 후 1건)."""
    if address is None:
        return None
    return LEADING_ZIPCODE_PATTERN.sub("", address)


def normalize_place_name(name: str) -> str:
    """공백/특수문자 정리한 비교용 이름. 원본 name은 그대로 보존한다."""
    normalized = re.sub(r"\s+", "", name)
    normalized = re.sub(r"[^\w가-힣]", "", normalized)
    return normalized.lower()
