"""소스별 원본 카테고리 -> 내부 표준 카테고리(place_category.code) 매핑.

값은 반드시 실제 API 응답에서 관찰된 값만 등록한다(추측 금지). 매핑에 없는 값은
ETC로 분류하고 UNMAPPED_LOG에 남겨 나중에 검토한다.
"""
from __future__ import annotations

# RedTable BSNS_STATM_BZCND_NM 실제 관찰값 (2026-08-10 /api/rstr pageNo=1 응답 기준)
REDTABLE_CATEGORY_MAP: dict[str, str] = {
    "한식": "RESTAURANT",
    "중국식": "RESTAURANT",
    "일식": "RESTAURANT",
    "경양식": "RESTAURANT",
    "분식": "RESTAURANT",
    "뷔페식": "RESTAURANT",
    "식육(숯불구이)": "RESTAURANT",
    "외국음식전문점(인도,태국등)": "RESTAURANT",
    "일반조리판매": "RESTAURANT",
    "김밥(도시락)": "RESTAURANT",
    "탕류(보신용)": "RESTAURANT",
    "패스트푸드": "RESTAURANT",
    "정종/대포집/소주방": "RESTAURANT",
    "호프/통닭": "RESTAURANT",
    "기타 휴게음식점": "RESTAURANT",
    "다방": "CAFE",
    "커피숍": "CAFE",
    "제과점영업": "DESSERT",
    "기타": "ETC",
    # 2026-08-10 종로구 필터 데이터에서 추가로 관찰된 값
    "전통찻집": "CAFE",
    "라이브카페": "CAFE",
    "떡카페": "CAFE",
    "푸드트럭": "RESTAURANT",
    "회집": "RESTAURANT",
    "감성주점": "RESTAURANT",
    "패밀리레스토랑": "RESTAURANT",
    "복어취급": "RESTAURANT",
    "아이스크림": "DESSERT",
    "기타(편의점)": "ETC",
    "철도역구내": "ETC",
}


def map_redtable_category(raw_value: str | None) -> str:
    if raw_value is None:
        return "ETC"
    return REDTABLE_CATEGORY_MAP.get(raw_value, "ETC")


# TourAPI contentTypeId -> 내부 카테고리. 실호출로 확인된 값만 등록(2026-08-10, 종로구 기준).
# 15(축제공연행사)는 장소가 아니라 이벤트라 이 매핑에 넣지 않고 event 테이블 경로로 별도 처리한다.
TOURAPI_CATEGORY_MAP: dict[int, str] = {
    12: "ATTRACTION",   # 관광지
    14: "CULTURE",       # 문화시설
    38: "SHOPPING",      # 쇼핑
    39: "RESTAURANT",    # 음식점
}


def map_tourapi_category(content_type_id: int | str | None) -> str:
    if content_type_id is None:
        return "ETC"
    return TOURAPI_CATEGORY_MAP.get(int(content_type_id), "ETC")
