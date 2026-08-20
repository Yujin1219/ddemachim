import re
import unittest
from pathlib import Path


PIPELINE_DIR = Path(__file__).resolve().parents[1]
MIGRATION_PATH = PIPELINE_DIR / "src" / "db" / "add_course_generation_schema.sql"


def _normalize_sql(sql: str) -> str:
    without_block_comments = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    without_comments = re.sub(r"--[^\n]*", " ", without_block_comments)
    return re.sub(r"\s+", " ", without_comments).strip().lower()


class CourseGenerationMigrationPresenceTest(unittest.TestCase):
    def test_course_generation_migration_exists(self) -> None:
        self.assertTrue(
            MIGRATION_PATH.is_file(),
            f"course generation migration is missing: {MIGRATION_PATH}",
        )


@unittest.skipUnless(MIGRATION_PATH.is_file(), "course generation migration is absent")
class CourseGenerationSchemaContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = _normalize_sql(MIGRATION_PATH.read_text(encoding="utf-8"))

    def _table_body(self, table: str) -> str:
        match = re.search(
            rf"create table if not exists {table}\s*\((.*?)\)\s*;",
            self.sql,
        )
        self.assertIsNotNone(match, f"missing idempotent CREATE TABLE for {table}")
        return match.group(1).strip()

    def _constraint(self, name: str) -> str:
        match = re.search(rf"add constraint {name}\s+(.*?);", self.sql)
        self.assertIsNotNone(match, f"missing constraint {name}")
        definition = re.sub(r"\(\s+", "(", match.group(1))
        return re.sub(r"\s+\)", ")", definition)

    def _assert_column(self, table: str, declaration: str) -> None:
        body = self._table_body(table)
        self.assertRegex(body, rf"(?:^|, )\s*{declaration}(?:\s*,|$)")

    def test_existing_places_receive_bounded_default_dwell_minutes(self) -> None:
        for table, constraint in (
            ("place", "chk_place_default_dwell_minutes"),
            ("user_place", "chk_user_place_default_dwell_minutes"),
        ):
            self.assertIn(
                f"alter table {table} add column if not exists "
                "default_dwell_minutes integer not null default 60;",
                self.sql,
            )
            self.assertEqual(
                self._constraint(constraint),
                "check (default_dwell_minutes between 1 and 1440)",
            )

    def test_course_has_required_columns_and_checks(self) -> None:
        declarations = (
            "id bigserial not null",
            "member_id bigint not null",
            "title varchar\\(200\\) not null",
            "status varchar\\(20\\) not null",
            "planned_stop_count integer not null default 0",
            "version bigint not null default 0",
            "created_at timestamptz not null default now\\(\\)",
            "updated_at timestamptz not null default now\\(\\)",
        )
        for declaration in declarations:
            self._assert_column("course", declaration)

        self.assertEqual(self._constraint("pk_course"), "primary key (id)")
        self.assertEqual(
            self._constraint("chk_course_status"),
            "check (status in ('ready', 'in_progress', 'completed', 'archived'))",
        )
        self.assertEqual(
            self._constraint("chk_course_planned_stop_count"),
            "check (planned_stop_count >= 0)",
        )
        self.assertEqual(
            self._constraint("chk_course_version"),
            "check (version >= 0)",
        )

    def test_revision_preserves_generation_inputs_and_validates_ranges(self) -> None:
        declarations = (
            "id bigserial not null",
            "course_id bigint not null",
            "revision_no integer not null",
            "route_strategy varchar\\(20\\) not null",
            "service_date date not null",
            "desired_start_time time not null",
            "desired_end_time time not null",
            "start_type varchar\\(30\\) not null",
            "start_name varchar\\(200\\)",
            "start_latitude double precision not null",
            "start_longitude double precision not null",
            "algorithm_version varchar\\(50\\) not null",
            "replan_reason varchar\\(30\\) not null",
            "created_at timestamptz not null default now\\(\\)",
        )
        for declaration in declarations:
            self._assert_column("course_revision", declaration)

        expected_constraints = {
            "pk_course_revision": "primary key (id)",
            "uq_course_revision_course_revision_no": "unique (course_id, revision_no)",
            "chk_course_revision_revision_no": "check (revision_no >= 1)",
            "chk_course_revision_desired_time_range": (
                "check (desired_end_time > desired_start_time)"
            ),
            "chk_course_revision_start_name": (
                "check (start_type <> 'searched_place' or start_name is not null)"
            ),
            "chk_course_revision_latitude": (
                "check (start_latitude between -90.0 and 90.0)"
            ),
            "chk_course_revision_longitude": (
                "check (start_longitude between -180.0 and 180.0)"
            ),
        }
        for name, definition in expected_constraints.items():
            self.assertEqual(self._constraint(name), definition)

    def test_stop_has_required_snapshot_and_schedule_columns(self) -> None:
        declarations = (
            "id bigserial not null",
            "course_revision_id bigint not null",
            "sequence_no integer not null",
            "source_basket_item_id bigint",
            "place_id bigint",
            "user_place_id bigint",
            "place_name_snapshot varchar\\(200\\) not null",
            "address_snapshot text",
            "latitude_snapshot double precision not null",
            "longitude_snapshot double precision not null",
            "default_dwell_minutes integer not null",
            "dwell_minutes integer not null",
            "dwell_source varchar\\(20\\) not null",
            "arrival_deadline time",
            "arrival_buffer_minutes integer not null default 10",
            "scheduled_arrival time not null",
            "scheduled_departure time not null",
            "travel_minutes_from_previous integer not null",
            "travel_distance_meters integer not null",
            "ascent_meters numeric\\(10, ?2\\)",
            "congestion_score_snapshot numeric\\(5, ?2\\)",
            "hours_source_type varchar\\(20\\) not null",
            "open_time_snapshot time not null",
            "close_time_snapshot time not null",
            "event_id bigint",
            "event_end_time_snapshot time",
            "created_at timestamptz not null default now\\(\\)",
        )
        for declaration in declarations:
            self._assert_column("course_stop", declaration)

        expected_constraints = {
            "pk_course_stop": "primary key (id)",
            "uq_course_stop_revision_sequence": (
                "unique (course_revision_id, sequence_no)"
            ),
            "chk_course_stop_sequence_no": "check (sequence_no >= 1)",
            "chk_course_stop_at_most_one_place": (
                "check (place_id is null or user_place_id is null)"
            ),
            "chk_course_stop_latitude": (
                "check (latitude_snapshot between -90.0 and 90.0)"
            ),
            "chk_course_stop_longitude": (
                "check (longitude_snapshot between -180.0 and 180.0)"
            ),
            "chk_course_stop_default_dwell_minutes": (
                "check (default_dwell_minutes between 1 and 1440)"
            ),
            "chk_course_stop_dwell_minutes": (
                "check (dwell_minutes between 1 and 1440)"
            ),
            "chk_course_stop_arrival_buffer_minutes": (
                "check (arrival_buffer_minutes between 0 and 1440)"
            ),
            "chk_course_stop_schedule": (
                "check (scheduled_departure >= scheduled_arrival)"
            ),
            "chk_course_stop_travel_minutes": (
                "check (travel_minutes_from_previous >= 0)"
            ),
            "chk_course_stop_travel_distance": (
                "check (travel_distance_meters >= 0)"
            ),
            "chk_course_stop_congestion_score": (
                "check (congestion_score_snapshot is null or "
                "congestion_score_snapshot between 0.0 and 100.0)"
            ),
        }
        for name, definition in expected_constraints.items():
            self.assertEqual(self._constraint(name), definition)

        self.assertNotIn("ascent_meters", self._constraint("chk_course_stop_congestion_score"))
        self.assertNotRegex(self.sql, r"check \([^)]*ascent_meters")
        self.assertNotRegex(
            self.sql,
            r"check \([^)]*open_time_snapshot[^)]*close_time_snapshot",
        )

    def test_enum_checks_are_exact_and_enum_columns_are_not_null(self) -> None:
        expected = {
            "chk_course_revision_route_strategy": (
                "check (route_strategy in ('easy', 'fast', 'quiet', 'pleasant'))"
            ),
            "chk_course_revision_start_type": (
                "check (start_type in ('current_location', 'searched_place'))"
            ),
            "chk_course_revision_replan_reason": (
                "check (replan_reason in ('initial', 'dwell_overrun', 'user_edit'))"
            ),
            "chk_course_stop_dwell_source": (
                "check (dwell_source in ('default', 'user_modified'))"
            ),
            "chk_course_stop_hours_source_type": (
                "check (hours_source_type in ('real', 'demo_default'))"
            ),
        }
        for name, definition in expected.items():
            self.assertEqual(self._constraint(name), definition)

    def test_foreign_keys_have_exact_delete_actions_and_no_basket_fk(self) -> None:
        expected = {
            "fk_course_member": (
                "foreign key (member_id) references member(member_id) on delete cascade"
            ),
            "fk_course_revision_course": (
                "foreign key (course_id) references course(id) on delete cascade"
            ),
            "fk_course_current_revision": (
                "foreign key (current_revision_id) references course_revision(id) "
                "on delete set null"
            ),
            "fk_course_stop_revision": (
                "foreign key (course_revision_id) references course_revision(id) "
                "on delete cascade"
            ),
            "fk_course_stop_place": (
                "foreign key (place_id) references place(id) on delete set null"
            ),
            "fk_course_stop_user_place": (
                "foreign key (user_place_id) references user_place(id) on delete set null"
            ),
            "fk_course_stop_event": (
                "foreign key (event_id) references event(id) on delete set null"
            ),
        }
        for name, definition in expected.items():
            self.assertEqual(self._constraint(name), definition)

        self.assertNotRegex(
            self.sql,
            r"foreign key \(source_basket_item_id\)|"
            r"references course_basket_item\s*\(",
        )

    def test_current_revision_is_added_after_revision_table(self) -> None:
        course_position = self.sql.index("create table if not exists course (")
        revision_position = self.sql.index("create table if not exists course_revision (")
        current_revision_position = self.sql.index(
            "alter table course add column if not exists current_revision_id bigint;"
        )
        current_revision_fk_position = self.sql.index(
            "add constraint fk_course_current_revision"
        )
        self.assertLess(course_position, revision_position)
        self.assertLess(revision_position, current_revision_position)
        self.assertLess(current_revision_position, current_revision_fk_position)
        self.assertNotIn("current_revision_id", self._table_body("course"))

    def test_constraints_are_guarded_and_ddl_is_rerunnable(self) -> None:
        expected_constraint_tables = {
            "chk_place_default_dwell_minutes": "place",
            "chk_user_place_default_dwell_minutes": "user_place",
            "pk_course": "course",
            "fk_course_member": "course",
            "chk_course_status": "course",
            "chk_course_planned_stop_count": "course",
            "chk_course_version": "course",
            "pk_course_revision": "course_revision",
            "fk_course_revision_course": "course_revision",
            "uq_course_revision_course_revision_no": "course_revision",
            "chk_course_revision_revision_no": "course_revision",
            "chk_course_revision_route_strategy": "course_revision",
            "chk_course_revision_desired_time_range": "course_revision",
            "chk_course_revision_start_type": "course_revision",
            "chk_course_revision_start_name": "course_revision",
            "chk_course_revision_latitude": "course_revision",
            "chk_course_revision_longitude": "course_revision",
            "chk_course_revision_replan_reason": "course_revision",
            "pk_course_stop": "course_stop",
            "fk_course_stop_revision": "course_stop",
            "fk_course_stop_place": "course_stop",
            "fk_course_stop_user_place": "course_stop",
            "fk_course_stop_event": "course_stop",
            "uq_course_stop_revision_sequence": "course_stop",
            "chk_course_stop_sequence_no": "course_stop",
            "chk_course_stop_at_most_one_place": "course_stop",
            "chk_course_stop_latitude": "course_stop",
            "chk_course_stop_longitude": "course_stop",
            "chk_course_stop_default_dwell_minutes": "course_stop",
            "chk_course_stop_dwell_minutes": "course_stop",
            "chk_course_stop_dwell_source": "course_stop",
            "chk_course_stop_arrival_buffer_minutes": "course_stop",
            "chk_course_stop_schedule": "course_stop",
            "chk_course_stop_travel_minutes": "course_stop",
            "chk_course_stop_travel_distance": "course_stop",
            "chk_course_stop_congestion_score": "course_stop",
            "chk_course_stop_hours_source_type": "course_stop",
            "fk_course_current_revision": "course",
        }
        actual_constraints = set(re.findall(r"add constraint (\w+)", self.sql))
        self.assertEqual(actual_constraints, set(expected_constraint_tables))

        for name, table in expected_constraint_tables.items():
            guard = (
                "if not exists ( select 1 from pg_constraint "
                f"where conname = '{name}' and conrelid = '{table}'::regclass ) "
                f"then alter table {table} add constraint {name}"
            )
            self.assertIn(guard, self.sql, f"constraint {name} is not relation-scoped")

        for table in ("course", "course_revision", "course_stop"):
            body = self._table_body(table)
            self.assertNotRegex(
                body,
                r"\b(constraint|primary key|foreign key|references|unique|check)\b",
            )

        self.assertIn(
            "create index if not exists idx_course_member_updated_at "
            "on course (member_id, updated_at desc);",
            self.sql,
        )
        self.assertIn(
            "create index if not exists idx_course_revision_course_revision_no "
            "on course_revision (course_id, revision_no desc);",
            self.sql,
        )
        self.assertNotRegex(self.sql, r"create index if not exists \w+ on course_stop")
        self.assertNotIn("concurrently", self.sql)

    def test_excluded_storage_models_are_absent(self) -> None:
        for excluded_table in (
            "course_candidate",
            "course_geometry",
            "course_progress",
            "course_proximity_content",
            "course_demo_operating_hours",
        ):
            self.assertNotRegex(
                self.sql,
                rf"(?:create|alter) table(?: if not exists)? {excluded_table}\b",
            )


if __name__ == "__main__":
    unittest.main()
