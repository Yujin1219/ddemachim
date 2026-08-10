from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PlaceDTO:
    """API별 원본을 이 공통 형태로 변환한 뒤 clean/normalize/match/load 단계로 넘긴다."""

    name: str
    road_address: str | None
    lot_address: str | None
    latitude: float | None
    longitude: float | None
    phone: str | None
    raw_category: str | None
    description: str | None
    source: str
    source_id: str
    district: str | None = None
    normalized_name: str | None = None
    category_code: str | None = None
    has_coordinates: bool = False
    # 공통 컬럼에 안 맞는 소스별 부가 정보(운영시간 원문, 태그 등). enrichment-only 소스(좌표 없음)에서
    # 매칭이 REVIEW_REQUIRED로 빠질 때 검토 큐에 그대로 실려서 나중에 확정 시 유실되지 않게 한다.
    extra: dict[str, Any] = field(default_factory=dict)
