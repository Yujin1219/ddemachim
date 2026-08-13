from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.cleaners.common import is_valid_seoul_coordinate, normalize_place_name
from src.collectors.geocoder import geocode_address
from src.db.connection import get_connection
from src.loaders.filming_location_loader import upsert_filming_location
from src.utils.logging import get_logger

logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REVIEW_PATH = ROOT / "data" / "processed" / "filming_location_review_required.jsonl"
PENDING_PATH = ROOT / "data" / "processed" / "filming_location_media_pending.jsonl"
SOURCE = "FILMING_LOCATION"


@dataclass(frozen=True)
class Resolution:
    source_id: str
    place_name: str
    title: str
    scene_description: str
    existing_place_id: int | None = None
    address: str | None = None


RESOLUTIONS = (
    Resolution("1212", "경복궁", "광해", "이병헌이 중전 한효주의 손을 잡고 탈출하는 장소", 8150),
    Resolution("1213", "종묘", "광해", "영화 <광해>의 시작 장면을 알리는 종묘", 8102),
    Resolution("6206", "광화문 광장", "부당거래", "부당거래가 시작할 때 펼쳐지는 서울 한복판", 8086),
    Resolution("882", "서촌 한옥마을", "건축학개론", "수지와 이제훈이 과제를 위해 살펴보던 마을", address="서울특별시 종로구 통의동 28-1"),
    Resolution("2381", "창덕궁", "너의 결혼식", "너의 결혼식에서 김영광과 박보영이 데이트한 곳", address="서울특별시 종로구 율곡로 99"),
)


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def _write_jsonl_atomic(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")
    temporary.replace(path)


def _validate_review_rows(review_rows: list[dict]) -> None:
    by_source_id = {str(row.get("source_id")): row for row in review_rows}
    for resolution in RESOLUTIONS:
        row = by_source_id.get(resolution.source_id)
        if row is None:
            continue
        extra = row.get("extra") or {}
        if row.get("name") != resolution.place_name or extra.get("title") != resolution.title:
            raise ValueError(
                f"source_id={resolution.source_id} 검토 데이터가 예상과 다릅니다: "
                f"name={row.get('name')!r}, title={extra.get('title')!r}"
            )


def _find_source_place_id(conn, source_id: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT place_id FROM place_source WHERE source = %s AND source_id = %s",
            (SOURCE, source_id),
        )
        row = cur.fetchone()
    return row[0] if row else None


def _validate_existing_place(conn, resolution: Resolution) -> int:
    assert resolution.existing_place_id is not None
    with conn.cursor() as cur:
        cur.execute("SELECT name FROM place WHERE id = %s", (resolution.existing_place_id,))
        row = cur.fetchone()
    if row is None:
        raise ValueError(f"place_id={resolution.existing_place_id} 장소가 없습니다.")
    return resolution.existing_place_id


def _create_place(conn, resolution: Resolution, coordinates: tuple[float, float]) -> int:
    assert resolution.address is not None
    lat, lng = coordinates
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM place_category WHERE code = 'ATTRACTION'")
        category = cur.fetchone()
        if category is None:
            raise ValueError("ATTRACTION 장소 카테고리가 없습니다.")
        cur.execute(
            """
            INSERT INTO place (
                name, normalized_name, category_id, road_address, district, location, tags
            ) VALUES (
                %s, %s, %s, %s, '종로구',
                ST_SetSRID(ST_MakePoint(%s, %s), 4326), ARRAY['FILMING_LOCATION']::text[]
            )
            RETURNING id
            """,
            (
                resolution.place_name,
                normalize_place_name(resolution.place_name),
                category[0],
                resolution.address,
                lng,
                lat,
            ),
        )
        return cur.fetchone()[0]


def _upsert_place_source(conn, place_id: int, source_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO place_source (place_id, source, source_id, has_coordinates, last_synced_at)
            VALUES (%s, %s, %s, true, now())
            ON CONFLICT (source, source_id) DO UPDATE SET
                place_id = EXCLUDED.place_id,
                has_coordinates = EXCLUDED.has_coordinates,
                last_synced_at = now()
            """,
            (place_id, SOURCE, source_id),
        )
        cur.execute(
            """
            UPDATE place
            SET tags = ARRAY(
                SELECT DISTINCT tag
                FROM unnest(COALESCE(tags, ARRAY[]::text[]) || ARRAY['FILMING_LOCATION']) AS tag
                ORDER BY tag
            ), updated_at = now()
            WHERE id = %s
            """,
            (place_id,),
        )


def _prepare_coordinates(conn, kakao_key: str) -> dict[str, tuple[float, float]]:
    coordinates: dict[str, tuple[float, float]] = {}
    for resolution in RESOLUTIONS:
        if resolution.address is None or _find_source_place_id(conn, resolution.source_id) is not None:
            continue
        result = geocode_address(resolution.address, kakao_key)
        if result is None or not is_valid_seoul_coordinate(*result):
            raise ValueError(f"source_id={resolution.source_id} 주소의 유효한 서울 좌표를 찾지 못했습니다.")
        coordinates[resolution.source_id] = result
    return coordinates


def _update_reports(place_ids: dict[str, int], review_rows: list[dict]) -> None:
    resolved_ids = set(place_ids)
    pending_rows = _read_jsonl(PENDING_PATH)
    pending_by_id = {str(row.get("source_id")): row for row in pending_rows}
    for resolution in RESOLUTIONS:
        pending_by_id[resolution.source_id] = {
            "source_id": resolution.source_id,
            "place_id": place_ids[resolution.source_id],
            "place_name": resolution.place_name,
            "title": resolution.title,
            "media_type": "movie",
            "scene_description": resolution.scene_description,
        }
    _write_jsonl_atomic(PENDING_PATH, sorted(pending_by_id.values(), key=lambda row: int(row["source_id"])))
    _write_jsonl_atomic(
        REVIEW_PATH,
        [row for row in review_rows if str(row.get("source_id")) not in resolved_ids],
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="검토 완료된 영화 촬영지 5건을 수동 확정")
    parser.add_argument("--dry-run", action="store_true", help="검토 파일만 확인하고 DB와 파일을 변경하지 않음")
    args = parser.parse_args()

    review_rows = _read_jsonl(REVIEW_PATH)
    _validate_review_rows(review_rows)
    if args.dry_run:
        logger.info("수동 확정 대상 검증 완료: 5건")
        return 0

    load_dotenv()
    kakao_key = os.getenv("KAKAO_REST_API_KEY", "").strip()
    if not kakao_key:
        logger.error("KAKAO_REST_API_KEY가 설정되어 있지 않습니다.")
        return 2

    place_ids: dict[str, int] = {}
    with get_connection() as conn:
        coordinates = _prepare_coordinates(conn, kakao_key)
        for resolution in RESOLUTIONS:
            place_id = _find_source_place_id(conn, resolution.source_id)
            if place_id is None:
                place_id = (
                    _validate_existing_place(conn, resolution)
                    if resolution.existing_place_id is not None
                    else _create_place(conn, resolution, coordinates[resolution.source_id])
                )
            _upsert_place_source(conn, place_id, resolution.source_id)
            upsert_filming_location(
                conn,
                place_id,
                SOURCE,
                resolution.source_id,
                content_type="MOVIE",
                scene_description=resolution.scene_description,
            )
            place_ids[resolution.source_id] = place_id
        conn.commit()

    _update_reports(place_ids, review_rows)
    for resolution in RESOLUTIONS:
        logger.info(
            f"확정 source_id={resolution.source_id} place_id={place_ids[resolution.source_id]} "
            f"place={resolution.place_name!r} title={resolution.title!r}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
