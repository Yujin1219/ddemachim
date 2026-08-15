"""Move one random place_image row onto place, validate it, then remove the old table."""
from __future__ import annotations

import logging
from pathlib import Path

from src.db.connection import get_connection


LOGGER = logging.getLogger(__name__)
MIGRATION_PATH = Path(__file__).resolve().parents[1] / "src" / "db" / "migrate_place_image_to_place.sql"


def _table_exists(cursor, table_name: str) -> bool:
    cursor.execute("SELECT to_regclass(%s) IS NOT NULL", (f"public.{table_name}",))
    return bool(cursor.fetchone()[0])


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    migration_sql = MIGRATION_PATH.read_text(encoding="utf-8")

    with get_connection() as connection:
        with connection.cursor() as cursor:
            had_legacy_table = _table_exists(cursor, "place_image")
            legacy_rows = 0
            legacy_places = 0
            if had_legacy_table:
                cursor.execute("SELECT count(*), count(DISTINCT place_id) FROM place_image")
                legacy_rows, legacy_places = cursor.fetchone()

            LOGGER.info("migration before: place_image rows=%s, places=%s", legacy_rows, legacy_places)
            cursor.execute(migration_sql)

        with connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM place WHERE image_url IS NOT NULL")
            final_places = cursor.fetchone()[0]
            legacy_table_removed = not _table_exists(cursor, "place_image")

            if not legacy_table_removed:
                raise RuntimeError("place_image table still exists after migration")
            if final_places < legacy_places:
                raise RuntimeError(
                    f"migrated image place count decreased: expected at least {legacy_places}, got {final_places}"
                )

    LOGGER.info(
        "migration complete: migrated legacy places=%s, final place images=%s, place_image removed=%s",
        legacy_places,
        final_places,
        legacy_table_removed,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
