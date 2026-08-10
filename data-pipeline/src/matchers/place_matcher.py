from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import psycopg

from src.models.place_dto import PlaceDTO

# 두 후보가 같은 장소인지 자동 확정하는 거리 임계값(미터).
# 이름이 같아도 30~50m를 벗어나면 동명이지점일 가능성이 있어 검토로 보낸다는
# 원 설계(사용자 지시)를 그대로 코드화한 값. 필요시 여기서만 조정한다.
AUTO_MATCH_RADIUS_M = 50


class MatchStatus(str, Enum):
    AUTO_MATCH = "AUTO_MATCH"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    NO_MATCH = "NO_MATCH"


@dataclass
class MatchResult:
    status: MatchStatus
    place_id: int | None = None


def find_match(conn: psycopg.Connection, dto: PlaceDTO) -> MatchResult:
    """normalized_name + district로 후보를 찾고, 좌표 거리로 자동/검토를 가른다.

    이름만 같다고 자동 병합하지 않는다(스타벅스 같은 동명 매장 문제) — 반드시
    같은 district 안에서, 그리고 둘 다 좌표가 있으면 AUTO_MATCH_RADIUS_M 이내일
    때만 자동 병합한다. 좌표가 한쪽이라도 없으면 이름+구 일치만으로는 자동
    확정하지 않고 검토로 보낸다(엄격하게 안전한 쪽으로).
    """
    if dto.normalized_name is None or dto.district is None:
        return MatchResult(status=MatchStatus.NO_MATCH)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, ST_X(location) AS lng, ST_Y(location) AS lat
            FROM place
            WHERE normalized_name = %s AND district = %s
            """,
            (dto.normalized_name, dto.district),
        )
        candidates = cur.fetchall()

    if not candidates:
        return MatchResult(status=MatchStatus.NO_MATCH)

    if len(candidates) > 1:
        return MatchResult(status=MatchStatus.REVIEW_REQUIRED)

    place_id, cand_lng, cand_lat = candidates[0]

    if dto.has_coordinates and cand_lat is not None and cand_lng is not None:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ST_DistanceSphere(
                    ST_MakePoint(%s, %s),
                    ST_MakePoint(%s, %s)
                )
                """,
                (dto.longitude, dto.latitude, cand_lng, cand_lat),
            )
            (distance_m,) = cur.fetchone()
        if distance_m <= AUTO_MATCH_RADIUS_M:
            return MatchResult(status=MatchStatus.AUTO_MATCH, place_id=place_id)
        return MatchResult(status=MatchStatus.REVIEW_REQUIRED, place_id=place_id)

    return MatchResult(status=MatchStatus.REVIEW_REQUIRED, place_id=place_id)
