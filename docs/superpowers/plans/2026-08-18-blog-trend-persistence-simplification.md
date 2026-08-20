# Blog Trend Persistence Simplification Implementation Plan


**Goal:** Replace stored blog evidence and large snapshots with one weekly run record and minimal frontend-ready place trend results.

**Architecture:** The data pipeline performs blog discovery and aggregation transiently, resolves places through the existing `place` contract, and persists only Search Trend output. Spring reads successful, unexpired results through the existing place APIs.

**Tech Stack:** PostgreSQL, Python 3 data pipeline, Spring Boot, JPA, JUnit, unittest

**Spec:** `docs/superpowers/specs/2026-08-18-blog-trend-persistence-simplification-design.md`

## Global Constraints

- Preserve every existing `place` row and unrelated table.
- Remove all existing data in obsolete trend tables intentionally.
- Do not persist blog post metadata, body text, author evidence, keywords, or weekly blog aggregates.
- Keep existing place trend API paths.

---

### Task 1: Minimal PostgreSQL Contract And Loader

**Files:**
- Modify: `data-pipeline/src/db/schema.sql`
- Modify: `data-pipeline/src/db/add_blog_trend_tables.sql`
- Create: `data-pipeline/src/db/migrate_simplify_blog_trend_persistence.sql`
- Modify: `data-pipeline/src/loaders/blog_trend_loader.py`
- Modify: `data-pipeline/scripts/repeated_blog_trend.py`
- Modify: `data-pipeline/scripts/re_evaluate_search_trend.py`
- Test: `data-pipeline/tests/test_blog_trend_loader.py`
- Test: `data-pipeline/tests/test_repeated_blog_trend.py`

**Interfaces:**
- Consumes: collected run result with resolved place evidence and Search Trend values.
- Produces: one `blog_trend_run` row per week and zero or more `place_trend_result` rows.

- [x] **Step 1: Add failing schema and loader tests**

Assert that obsolete tables are absent from the canonical schema, the migration drops only trend tables, same-week writes are idempotent, invisible statuses are skipped, and failures preserve a `FAILED` run.

- [x] **Step 2: Run focused tests and confirm failure**

Run: `python -m unittest data-pipeline/tests/test_blog_trend_loader.py data-pipeline/tests/test_repeated_blog_trend.py`

- [x] **Step 3: Implement schema, migration, and minimal persistence**

Create `blog_trend_run` and `place_trend_result`, replace observation/snapshot writes, and keep intermediate blog evidence in memory only.

- [x] **Step 4: Run data-pipeline regression tests**

Run: `python -m unittest discover -s data-pipeline/tests`

### Task 2: Spring Entities And Queries

**Files:**
- Delete: `BE/src/main/java/com/ddemachim/server/domain/place/entity/BlogTrendObservation.java`
- Delete: `BE/src/main/java/com/ddemachim/server/domain/place/entity/PlaceTrendSnapshot.java`
- Delete: `BE/src/main/java/com/ddemachim/server/domain/place/repository/BlogTrendObservationRepository.java`
- Delete: `BE/src/main/java/com/ddemachim/server/domain/place/repository/PlaceTrendSnapshotRepository.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/entity/BlogTrendRun.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/entity/PlaceTrendResult.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/repository/PlaceTrendResultRepository.java`
- Modify: `BE/src/main/java/com/ddemachim/server/domain/place/service/PlaceQueryService.java`
- Modify: `BE/src/main/java/com/ddemachim/server/domain/place/dto/PlaceTrendResponse.java`
- Modify: `BE/src/main/java/com/ddemachim/server/domain/place/controller/PlaceController.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/place/service/PlaceQueryServiceTest.java`

**Interfaces:**
- Consumes: successful `blog_trend_run` rows and unexpired `place_trend_result` rows.
- Produces: existing list/detail responses with status and Search Trend comparison fields.

- [x] **Step 1: Update tests for the response and visibility contract**

Cover successful unexpired results, failed runs, expired results, status ordering, and percentage-change projection.

- [x] **Step 2: Run focused tests and confirm failure**

Run: `./gradlew test --tests '*PlaceQueryServiceTest'`

- [x] **Step 3: Replace obsolete entities and repository queries**

Map the new tables, query only successful and unexpired results, and preserve the current controller paths.

- [x] **Step 4: Run backend verification**

Run: `./gradlew test`

### Task 3: Apply And Verify The Real Database Migration

**Files:**
- Execute: `data-pipeline/src/db/migrate_simplify_blog_trend_persistence.sql`

**Interfaces:**
- Consumes: configured `DATABASE_URL` without printing it.
- Produces: replacement trend tables with no obsolete trend data.

- [x] **Step 1: Apply the migration transactionally**

Run the SQL with `ON_ERROR_STOP=1` using the configured database connection. Do not log credentials.

- [x] **Step 2: Verify table and column names**

Query `information_schema` for the five relevant table names and the replacement table columns; report counts and names only.

- [x] **Step 3: Compile against the migrated contract**

Run: `./gradlew compileJava`
