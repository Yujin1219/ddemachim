from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "src" / "db" / "migrate_place_image_to_place.sql"
SCHEMA_PATH = ROOT / "src" / "db" / "schema.sql"


def _compact_sql(path: Path) -> str:
    return re.sub(r"\s+", " ", path.read_text(encoding="utf-8")).lower()


class PlaceImageMigrationContractTest(unittest.TestCase):
    def test_migration_is_atomic_idempotent_and_validates_before_drop(self) -> None:
        self.assertTrue(MIGRATION_PATH.exists(), "place image migration SQL must exist")

        sql = _compact_sql(MIGRATION_PATH)

        self.assertIn("begin;", sql)
        self.assertIn("do $$", sql)
        self.assertIn("commit;", sql)
        self.assertIn("add column if not exists image_url text", sql)
        self.assertIn("add column if not exists image_source varchar(30)", sql)
        self.assertIn("add column if not exists image_attribution text", sql)
        self.assertIn("select distinct on (pi.place_id)", sql)
        self.assertIn("create temp table place_image_migration_representatives", sql)
        self.assertIn("order by pi.place_id, random()", sql)
        self.assertIn("(p.image_url is null) as should_migrate", sql)
        self.assertIn("and r.should_migrate", sql)
        self.assertIn("is distinct from", sql)
        self.assertIn("drop table place_image", sql)
        self.assertLess(sql.index("missing_count"), sql.index("drop table place_image"))
        self.assertLess(sql.index("mismatch_count"), sql.index("drop table place_image"))

    def test_final_schema_has_representative_columns_and_no_legacy_image_table(self) -> None:
        sql = _compact_sql(SCHEMA_PATH)

        self.assertIn("image_url text", sql)
        self.assertIn("image_source varchar(30)", sql)
        self.assertIn("image_attribution text", sql)
        self.assertNotIn("create table if not exists place_image", sql)
        self.assertNotIn("idx_place_image_place_id", sql)
