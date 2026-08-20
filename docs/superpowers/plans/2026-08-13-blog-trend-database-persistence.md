# Blog Trend Database Persistence Implementation Plan


**Goal:** Persist blog trend observations, daily snapshots, and shared body keywords in PostgreSQL and map them with Spring Data JPA.

**Architecture:** The repeated trend pipeline keeps JSONL as an audit log, accepts representative Naver map places whose address district is Jongno, then resolves Naver map IDs into the existing place master and performs transactional UPSERTs. Spring owns the schema model through three read-oriented entities and repositories.

**Tech Stack:** Python 3.9, psycopg 3, PostgreSQL/PostGIS, Java 21, Spring Boot 4.1, Spring Data JPA, JUnit 5

## Global Constraints

- Never persist blog HTML or raw blog body text.
- Deduplicate observations by `(collection_date, query, post_url)`.
- Deduplicate daily aggregates by `(place_id, snapshot_date)`.
- Preserve existing `place` rows and use `place_source` for Naver map identity.
- A live scheduled run fails if its transactional DB persistence fails.
- Preserve unrelated changes in the dirty worktree.

---

### Task 1: Freeze the database contract

**Files:**
- Modify: `data-pipeline/src/db/schema.sql`
- Create: `data-pipeline/src/db/add_blog_trend_tables.sql`
- Test: `data-pipeline/tests/test_blog_trend_loader.py`

**Interfaces:**
- Produces: the three table names, columns, unique constraints, and indexes consumed by Python SQL and JPA annotations.

- [ ] Add a failing schema contract test that requires `blog_trend_observation`, `place_trend_snapshot`, and `place_trend_keyword` with their idempotency constraints.
- [ ] Run the focused Python test and confirm the missing DDL failure.
- [ ] Add idempotent PostgreSQL DDL to both the standalone migration and reference schema.
- [ ] Run the schema contract test and confirm it passes.

### Task 2: Implement transactional Python persistence

**Files:**
- Create: `data-pipeline/src/loaders/blog_trend_loader.py`
- Modify: `data-pipeline/scripts/repeated_blog_trend.py`
- Modify: `data-pipeline/tests/test_repeated_blog_trend.py`
- Test: `data-pipeline/tests/test_blog_trend_loader.py`

**Interfaces:**
- Produces: `persist_blog_trend_run(conn, run_result) -> BlogTrendLoadStats`.
- Consumes: aggregate `evidence` and per-place Naver map evidence rows from `run_live`.

- [ ] Add failing tests for the Jongno address boundary, Naver map metadata propagation, and observation/snapshot/keyword UPSERT calls.
- [ ] Add canonical Naver map address, coordinates, and phone to place evidence rows and reused rows.
- [ ] Implement Naver map `PlaceDTO` conversion and conservative `place/place_source` resolution.
- [ ] Implement observation UPSERT, snapshot UPSERT, and keyword replacement in one caller-owned transaction.
- [ ] Add default DB persistence to live runs, `--skip-db` for diagnostics, and DB counts to the run artifact.
- [ ] Run focused Python tests until they pass.

### Task 3: Add Spring entities and repositories

**Files:**
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/entity/BlogTrendObservation.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/entity/PlaceTrendSnapshot.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/entity/PlaceTrendKeyword.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/enums/PlaceTrendStatus.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/repository/BlogTrendObservationRepository.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/repository/PlaceTrendSnapshotRepository.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/place/repository/PlaceTrendKeywordRepository.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/place/entity/PlaceTrendEntityMappingTest.java`

**Interfaces:**
- Produces: JPA mappings for all persisted trend fields and latest-snapshot/ordered-keyword repository reads.

- [ ] Add a failing reflection test for table names, unique constraints, and enum persistence.
- [ ] Implement the status enum and three lazy, read-oriented entity mappings.
- [ ] Add repositories for observation access, latest place snapshot, and ordered keywords.
- [ ] Run the focused Spring test and `compileJava`.

### Task 4: Integrate documentation and verify end to end

**Files:**
- Modify: `data-pipeline/README.md`

**Interfaces:**
- Consumes: the completed CLI and database contract.

- [ ] Document default DB persistence, `DATABASE_URL`, `--skip-db`, table purposes, and retry semantics.
- [ ] Run the full Python test suite.
- [ ] Run backend focused tests and `compileJava`.
- [ ] Run CLI dry-run and diff checks, then report any unrelated pre-existing backend test failures separately.
