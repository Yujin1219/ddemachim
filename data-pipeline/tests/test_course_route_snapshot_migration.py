import unittest
from pathlib import Path


PIPELINE_DIR = Path(__file__).resolve().parents[1]
MIGRATION_PATH = PIPELINE_DIR / "src" / "db" / "add_course_selected_route_snapshot.sql"
STRATEGY_MIGRATION_PATH = PIPELINE_DIR / "src" / "db" / "expand_course_route_strategy_quiet.sql"


class CourseRouteSnapshotMigrationTest(unittest.TestCase):
    def test_adds_selected_route_snapshot_as_nullable_jsonb(self) -> None:
        self.assertTrue(MIGRATION_PATH.is_file())
        sql = " ".join(MIGRATION_PATH.read_text(encoding="utf-8").lower().split())
        self.assertIn(
            "alter table course_stop add column if not exists selected_route_snapshot jsonb;",
            sql,
        )
        self.assertNotIn("not null", sql)
        self.assertNotIn("drop ", sql)

    def test_route_strategy_constraint_accepts_quiet(self) -> None:
        self.assertTrue(STRATEGY_MIGRATION_PATH.is_file())
        sql = " ".join(STRATEGY_MIGRATION_PATH.read_text(encoding="utf-8").lower().split())
        self.assertIn("drop constraint if exists chk_course_revision_route_strategy", sql)
        self.assertIn("'easy', 'fast', 'quiet', 'pleasant'", sql)


if __name__ == "__main__":
    unittest.main()
