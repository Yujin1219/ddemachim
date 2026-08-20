# Course Generation Schema Implementation Plan


**Goal:** Add the approved course, immutable course revision, and ordered course stop persistence model, together with per-place default dwell time and matching Spring JPA entities.

**Architecture:** The data migration is implemented and verified before backend code consumes the contract. Only the selected course option is stored. Every successful edit or dwell-overrun replan creates a new immutable revision; `course.current_revision_id` points at the active result and `course.planned_stop_count` provides the requested list summary.

**Tech Stack:** PostgreSQL/PostGIS SQL, Python unittest schema-contract tests, Java 21, Spring Boot, Spring Data JPA, Hibernate, JUnit 5, AssertJ.

**Spec:** `docs/superpowers/specs/2026-08-18-course-generation-schema-design.md`

## Global Constraints

- Work on branch `feat/course` and preserve unrelated changes.
- Do not inspect `.env`, credentials, dumps, or private records.
- Add no draft, candidate-option, progress, proximity-content, demo-hours-policy, or detailed route-geometry table.
- Reuse `event`, `filming_location`, `place_operating_hours`, `course_basket_item`, and `user_place`.
- Persist only the selected option and preserve old revisions after replan.
- `DEMO_DEFAULT` remains application configuration; only the applied source and hours are snapshotted in `course_stop`.

---

### Task 1: PostgreSQL migration contract

**Files:**
- Create: `data-pipeline/src/db/add_course_generation_schema.sql`
- Create: `data-pipeline/tests/test_course_generation_schema.py`

**Interfaces:**
- Consumes: existing `member(member_id)`, `place(id)`, `user_place(id)`, `event(id)`.
- Produces: `course`, `course_revision`, `course_stop`, plus `place.default_dwell_minutes` and `user_place.default_dwell_minutes`.

- [ ] **Step 1: Write the failing schema-contract test**

Create a unittest that reads `add_course_generation_schema.sql` and asserts the presence of the three tables, both dwell columns, the named FK/check/unique constraints, and the member/current-revision/revision-stop indexes. Assert forbidden table names (`course_progress`, `place_proximity_content`, `demo_operating_hours_policy`) are absent.

- [ ] **Step 2: Run the focused test and confirm red**

Run: `python -m unittest tests.test_course_generation_schema -v` from `data-pipeline`.

Expected: FAIL because `add_course_generation_schema.sql` does not exist.

- [ ] **Step 3: Implement the additive migration**

Add `default_dwell_minutes integer NOT NULL DEFAULT 60` to `place` and `user_place`, with named `1..1440` checks guarded through `pg_constraint`. Create the three tables and all columns exactly as defined by the spec. Use named checks for enums, coordinate ranges, positive/ordered times, dwell/buffer/range metrics, and at-most-one source reference. Use `ON DELETE CASCADE` only for owned course/revision/stop lifecycles and `ON DELETE SET NULL` for source place/user-place/event references. Add `course.current_revision_id` only after `course_revision` exists.

- [ ] **Step 4: Run the focused data test and full pipeline suite**

Run from `data-pipeline`:

```bash
python -m unittest tests.test_course_generation_schema -v
python -m unittest discover -s tests -v
```

Expected: PASS.

- [ ] **Step 5: Review migration safety**

Run:

```bash
rg -n "CREATE TABLE|ALTER TABLE|ADD CONSTRAINT|CREATE INDEX" src/db/add_course_generation_schema.sql
git diff --check -- data-pipeline
```

Confirm no destructive DDL and no secret/data access.

### Task 2: Place default dwell entity contract

**Files:**
- Modify: `BE/src/main/java/com/ddemachim/server/domain/place/entity/Place.java`
- Modify: `BE/src/main/java/com/ddemachim/server/domain/place/entity/UserPlace.java`
- Create: `BE/src/test/java/com/ddemachim/server/domain/place/entity/PlaceDefaultDwellTest.java`

**Interfaces:**
- Consumes: migration column `default_dwell_minutes integer NOT NULL DEFAULT 60`.
- Produces: `Integer getDefaultDwellMinutes()` on both entities and `UserPlace.createKakao(...)` initialized to 60.

- [ ] **Step 1: Write failing entity tests**

Use existing entity test/reflection conventions to assert a new Kakao `UserPlace` has a 60-minute default and both entity fields map to `default_dwell_minutes` as non-null.

- [ ] **Step 2: Run the focused test and confirm red**

Run from `BE`:

```bash
./gradlew test --tests '*PlaceDefaultDwellTest'
```

Expected: compilation/test failure because the property does not exist.

- [ ] **Step 3: Add the entity fields**

Add:

```java
@Column(name = "default_dwell_minutes", nullable = false)
private Integer defaultDwellMinutes = 60;
```

to both entities. Preserve existing factories and set the Kakao default explicitly where needed by the test.

- [ ] **Step 4: Run focused tests**

Run the same Gradle test and expect PASS.

### Task 3: Course aggregate entities and enums

**Files:**
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/entity/Course.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/entity/CourseRevision.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/entity/CourseStop.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/enums/CourseStatus.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/enums/CourseRouteStrategy.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/enums/CourseStartType.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/enums/CourseReplanReason.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/enums/CourseDwellSource.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/enums/CourseHoursSourceType.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/course/entity/CourseEntityTest.java`

**Interfaces:**
- Consumes: Task 1 table/column names and Task 2 dwell properties.
- Produces: static factories for initial course/revision/stop construction and an intention-revealing `Course.changeCurrentRevision(CourseRevision revision, int plannedStopCount)` method.

- [ ] **Step 1: Write failing aggregate tests**

Cover initial `Course` state, revision number/strategy/start snapshot, internal-place stop snapshot, user-place stop snapshot, deadline buffer 10, and rejection of a current revision belonging to another course.

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```bash
./gradlew test --tests '*CourseEntityTest'
```

Expected: compilation failure because the types do not exist.

- [ ] **Step 3: Implement enums and entities**

Follow `BE/AGENTS.md`: protected no-arg constructors, getters, lazy unidirectional associations, string enums, named indexes/unique constraints, controlled factories, and no public setters. Map Java `LocalDate`/`LocalTime`, `BigDecimal`, and `OffsetDateTime` types to the SQL contract. Add JPA `@Version` to `Course.version`.

- [ ] **Step 4: Run focused tests and compile**

Run:

```bash
./gradlew test --tests '*CourseEntityTest'
./gradlew compileJava
```

Expected: PASS.

### Task 4: Repositories and regression verification

**Files:**
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/repository/CourseRepository.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/repository/CourseRevisionRepository.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/course/repository/CourseStopRepository.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/course/repository/CoursePersistenceContractTest.java`

**Interfaces:**
- Consumes: Tasks 1 and 3 persistence contract.
- Produces: member-owned course lookup, latest revision lookup, and ordered stop lookup.

- [ ] **Step 1: Write failing repository contract tests**

Assert repository signatures for `findByIdAndMember_Id`, latest revision by course/revision number, and `findAllByCourseRevision_IdOrderBySequenceNoAsc`.

- [ ] **Step 2: Run focused test and confirm red**

Run:

```bash
./gradlew test --tests '*CoursePersistenceContractTest'
```

Expected: compilation failure because repositories do not exist.

- [ ] **Step 3: Implement minimal Spring Data repositories**

Use `JpaRepository` and derived queries only; do not add services or APIs in this schema/entity task.

- [ ] **Step 4: Run backend verification**

Run from `BE`:

```bash
./gradlew test --tests 'com.ddemachim.server.domain.course.*' --tests 'com.ddemachim.server.domain.place.*'
./gradlew test
./gradlew compileJava
```

Expected: PASS.

- [ ] **Step 5: Final consistency check**

Run from repository root:

```bash
git diff --check
rg -n "course_progress|place_proximity_content|demo_operating_hours_policy" data-pipeline/src/db BE/src/main
```

Expected: no whitespace errors and no forbidden new persistence models.
