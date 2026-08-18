# Task 1 Report: Course Generation PostgreSQL Schema

## Status

Complete for the approved data-domain phase. The additive migration and its focused static contract tests implement the course generation persistence contract without changing `BE/**` or the baseline schema. An independent review found no Critical, Important, or Minor issues.

## Schema and Contract Effects

- Adds `place.default_dwell_minutes` and `user_place.default_dwell_minutes` as `integer NOT NULL DEFAULT 60`, each with a named `1..1440` check.
- Adds the member-owned `course` aggregate with status validation, nonnegative `planned_stop_count`, optimistic-lock `version bigint NOT NULL DEFAULT 0` and its named nonnegative check, timestamps, the member/update lookup index, and a nullable current-revision pointer added after `course_revision` exists.
- Adds immutable `course_revision` rows with per-course revision uniqueness, exact route/start/replan enums, same-day desired-time ordering, searched-place name validation, coordinate bounds, and descending revision lookup index.
- Adds ordered `course_stop` snapshots with exact dwell/hours enums, source snapshots, schedule/travel/range validation, and per-revision sequence uniqueness.
- Uses `ON DELETE CASCADE` for owned member/course/revision/stop lifecycles. Source `place`, `user_place`, and `event` references use `ON DELETE SET NULL` so stop snapshots survive source deletion. `course.current_revision_id` also uses `SET NULL`.
- Deliberately leaves `source_basket_item_id` without a foreign key so deleting basket data does not control completed-course history.
- Uses `IF NOT EXISTS` for additive objects and relation-scoped `pg_constraint` guards for every named constraint. The DDL contains no `CONCURRENTLY`, so it can run within a caller-managed transaction.

## Changed Files

- `data-pipeline/src/db/add_course_generation_schema.sql` — additive PostgreSQL migration.
- `data-pipeline/tests/test_course_generation_schema.py` — ten static migration-contract tests.
- `.superpowers/sdd/2026-08-18-course-generation-schema/task-1-report.md` — this report.

No baseline schema, backend file, or other repository file was changed.

## TDD Evidence: RED to GREEN

The focused test was written before the migration.

- `python -m unittest tests.test_course_generation_schema -v` could not run because `python` is unavailable (`exit 127`).
- `python3 -m unittest tests.test_course_generation_schema -v` provided the witnessed RED: 10 tests were discovered; the migration-presence test failed because `add_course_generation_schema.sql` did not exist; the remaining 9 contract tests were skipped; command exited 1 solely for the missing migration.
- After adding the migration, the focused command passed all 10 tests (`exit 0`).
- The post-implementation full suite passed all 71 tests (`exit 0`), with only the pre-existing urllib3 LibreSSL compatibility warning.

## Fresh Independent Verification

Before the documentation/commit pass, an independent reviewer reran:

- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_course_generation_schema -v`: 10/10 passed, `exit 0`.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v`: 71/71 passed, `exit 0`; only the existing urllib3 LibreSSL warning was emitted.
- In-memory Python compilation: `exit 0`.
- Direct whitespace scan: clean.

The final pre-commit verification pass reran:

- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_course_generation_schema -v`: 10/10 passed in 0.017 seconds, `exit 0`.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v`: 71/71 passed in 0.225 seconds, `exit 0`; only the existing urllib3 LibreSSL warning was emitted.
- `git diff --check -- data-pipeline .superpowers/sdd/2026-08-18-course-generation-schema/task-1-report.md`: no output, `exit 0`. Because all three files were new and the report path is ignored by repository rules, the same check was also required against the staged content after explicitly staging the exact paths.
- `git status --short`: exactly the two untracked data files were visible; the ignored report was present at its required path and was explicitly force-staged. No unrelated change appeared.

## Review Result

Independent review approved the implementation for documentation and commit with no Critical, Important, or Minor findings. Review covered the brief/spec contract, exact columns and named constraints, lifecycle actions, ordering of the current-revision foreign key, rerun guards, deliberate exclusions, static-test coverage, and repository scope.

## Deliberate Exclusions

No tables were added for unselected candidate options, route geometry, course progress, proximity-content copies, or demo operating-hours policy. No detailed navigation geometry, live traffic/transit state, frontend location state, baseline-schema cleanup, or backend/JPA/API work is included. The existing `event`, `filming_location`, operating-hours, and media models are unchanged.

## Compatibility and Dependencies

- The migration assumes the existing `member`, `place`, and `event` relations are present.
- It assumes the earlier `add_user_place_course_basket.sql` migration has created `user_place`; this course migration does not reconcile the known baseline-schema mismatch.
- The script is compatible with an enclosing transaction but intentionally does not provide an explicit `BEGIN`/`COMMIT` wrapper.
- Named constraint guards are scoped by both relation and name, matching repository conventions and preventing same-named constraints on other relations from suppressing creation.

## Remaining Risks

- No live PostgreSQL execution was performed. PostgreSQL parsing, constraint enforcement, cascade/`SET NULL` behavior, locking, transaction rollback, and a real second migration run remain unverified.
- Static contract tests validate the migration text and intended DDL shape, not database behavior.
- Relation-scoped guards trust an existing same-name constraint on the same relation and do not compare or repair its definition; arbitrary schema drift therefore remains possible.
- Adding `NOT NULL DEFAULT 60` columns and constraints to populated tables may take locks whose duration depends on the target PostgreSQL version and production table size.

## Commit

The three exact files listed above are included in the focused commit with subject `feat(data): add course generation schema`. The resulting commit hash is reported in the final handoff because a commit cannot contain its own hash without a follow-up amend that changes that hash.
