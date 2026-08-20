# Jongno Mock Crowding Grid Implementation Plan


**Goal:** Build a Redis-cached, deterministic 50 m Jongno MOCK congestion system that colors visible map grids and supplies one shared congestion value to every place in the same grid and 30-minute slot.

**Architecture:** The data pipeline generates static EPSG:5186-aligned squares and persists their EPSG:4326 polygons in PostGIS. A new backend crowding domain queries viewport grids or locates batches of points, derives deterministic 1-100 scores, and uses Redis as a 24-hour cache with graceful fallback. The frontend batches point requests, loads only viewport polygons, and refreshes at 30-minute Asia/Seoul slot boundaries.

**Tech Stack:** Python 3, Shapely, pyproj, psycopg, PostgreSQL/PostGIS, Java 21, Spring Boot 4, Spring Data JPA, Spring Data Redis, Redis 7, React, OpenLayers, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-18-jongno-mock-crowding-grid-design.md`

## Global Constraints

- The feature is MOCK internally, while user-facing labels use only `혼잡도` and the level. Do not expose `예시`, `시뮬레이션`, or `MOCK` in visible UI copy.
- Grid cells are 50 m squares generated in EPSG:5186 and stored as EPSG:4326 polygons.
- Business time is `Asia/Seoul`; slots begin at minute `00` or `30`.
- Scores are deterministic integers from 1 through 100 and Redis is never the source of truth.
- Redis keys use `crowding:v1:{gridCode}:{yyyy-MM-dd}:{HH:mm}` with a 24-hour TTL.
- Redis misses use atomic `SET NX` behavior; Redis failures return deterministic scores.
- Map and collection flows must batch work; no request-per-place or Redis-get-per-place implementation.
- Preserve all unrelated working-tree changes.
- Do not stage or commit. Report to the user before any commit.

---

### Task 1: PostGIS grid schema and deterministic grid loader

**Files:**
- Create: `data-pipeline/src/db/add_crowding_grid.sql`
- Modify: `data-pipeline/src/db/schema.sql`
- Create: `data-pipeline/scripts/load_jongno_crowding_grid.py`
- Create: `data-pipeline/tests/test_crowding_grid.py`
- Read: `FE/public/data/jongno-boundary.geojson`

**Interfaces:**
- Consumes: Jongno boundary GeoJSON in EPSG:4326.
- Produces: `crowding_grid(grid_code, grid_x, grid_y, geometry, center_latitude, center_longitude)` and a repeatable loader command.

- [ ] **Step 1: Write schema contract tests**

Add tests that normalize both SQL files and assert the table, unique constraints, GiST geometry index, SRID 4326, and timestamps are present.

- [ ] **Step 2: Write failing grid generation tests**

Define the loader interface:

```text
@dataclass(frozen=True)
class GridCell:
    grid_code: str
    grid_x: int
    grid_y: int
    geometry_wgs84: BaseGeometry
    center_latitude: float
    center_longitude: float

generate_grid_cells(boundary_wgs84: BaseGeometry, grid_size_meters: int = 50) -> list[GridCell]
upsert_grid_cells(conn: psycopg.Connection, cells: Sequence[GridCell]) -> int
```

Tests must prove that generated metric bounds are exactly 50 by 50 metres, grid codes remain stable across repeated generation, cells intersect the boundary, and WGS84 centres lie inside their cells.

- [ ] **Step 3: Verify RED**

Run:

```bash
python -m unittest data-pipeline/tests/test_crowding_grid.py
```

Expected: failure because the schema and loader do not exist.

- [ ] **Step 4: Add the schema and migration**

Create an idempotent table with:

```sql
CREATE TABLE IF NOT EXISTS crowding_grid (
    id bigserial PRIMARY KEY,
    grid_code varchar(64) NOT NULL UNIQUE,
    grid_x integer NOT NULL,
    grid_y integer NOT NULL,
    geometry geometry(Polygon, 4326) NOT NULL,
    center_latitude double precision NOT NULL,
    center_longitude double precision NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_crowding_grid_xy UNIQUE (grid_x, grid_y)
);
CREATE INDEX IF NOT EXISTS idx_crowding_grid_geometry
    ON crowding_grid USING gist (geometry);
```

Apply the same contract to `schema.sql`.

- [ ] **Step 5: Implement generation and loading**

Use `Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)` and its inverse. Iterate from `floor(min / 50)` through `floor(max / 50)`, build un-clipped Shapely boxes, retain intersecting cells, transform cells to WGS84, and bulk upsert with `ON CONFLICT (grid_code) DO UPDATE`.

CLI contract:

```bash
python data-pipeline/scripts/load_jongno_crowding_grid.py \
  --boundary FE/public/data/jongno-boundary.geojson \
  --database-url "$DATABASE_URL"
```

`--dry-run` generates and validates cells without connecting to PostgreSQL.

- [ ] **Step 6: Verify GREEN and deterministic output**

Run the focused test and two dry runs. Assert both runs report the same cell count and first/last grid codes.

---

### Task 2: Redis infrastructure and deterministic scoring core

**Files:**
- Modify: `docker-compose.yml`
- Modify: `BE/build.gradle`
- Modify: `BE/src/main/resources/application.yaml`
- Create: `BE/src/main/java/com/ddemachim/server/global/properties/CrowdingMockProperties.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/enums/CrowdingLevel.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/service/CrowdingSlotResolver.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/service/DeterministicCrowdingScoreGenerator.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/service/CrowdingRedisCache.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/crowding/service/CrowdingSlotResolverTest.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/crowding/service/DeterministicCrowdingScoreGeneratorTest.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/crowding/service/CrowdingRedisCacheTest.java`

**Interfaces:**
- Produces: `CrowdingSlotResolver.resolve(OffsetDateTime)`, `DeterministicCrowdingScoreGenerator.generate(gridCode, slotStart)`, and `CrowdingRedisCache.resolveScores(gridCodes, slotStart)`.
- Consumes later: grid codes from Task 1.

- [ ] **Step 1: Add failing slot and level boundary tests**

Assert `14:00`, `14:17`, and `14:29` resolve to `14:00`; `14:30` resolves to `14:30`; and score boundaries map to the four frozen enum values and Korean labels.

- [ ] **Step 2: Add failing deterministic score tests**

Assert repeated `(seed, gridCode, slot)` inputs are equal, all outputs are within 1..100, and changed grid or slot inputs are independently derived without asserting numerical inequality.

- [ ] **Step 3: Add failing Redis behavior tests**

Mock `StringRedisTemplate` and cover one `multiGet`, miss generation, `setIfAbsent(key, value, 24h)`, losing the first-write race, malformed cache values, and Redis exception fallback.

- [ ] **Step 4: Verify RED**

Run:

```bash
sh ./gradlew test --tests '*CrowdingSlotResolverTest' --tests '*DeterministicCrowdingScoreGeneratorTest' --tests '*CrowdingRedisCacheTest'
```

- [ ] **Step 5: Add Redis 7 and Spring configuration**

Add a `redis:7-alpine` service and named volume to Compose. Add `spring-boot-starter-data-redis`. Bind non-secret defaults under `ddemachim.crowding.mock`:

```yaml
enabled: true
seed: ${MOCK_CROWDING_SEED:ddemachim-demo-v1}
ttl: 24h
zone: Asia/Seoul
maximum-viewport-grids: 5000
maximum-batch-points: 300
```

Redis host, port, connect timeout, and command timeout remain Spring environment properties.

- [ ] **Step 6: Implement minimal scoring core**

Use `Clock` injection for tests, SHA-256 for generation, and `StringRedisTemplate.opsForValue().multiGet(keys)`. Catch Redis data-access/runtime failures at the cache boundary, warn without key values, and return generated scores.

- [ ] **Step 7: Verify GREEN**

Run the focused tests and `sh ./gradlew compileJava`.

---

### Task 3: PostGIS grid queries and public crowding APIs

**Files:**
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/entity/CrowdingGrid.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/repository/CrowdingGridRepository.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/service/CrowdingGridLocator.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/service/CrowdingService.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/dto/CrowdingRequest.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/dto/CrowdingResponse.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/controller/CrowdingController.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/exception/CrowdingErrorStatus.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/crowding/exception/CrowdingException.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/crowding/repository/CrowdingGridRepositoryTest.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/crowding/service/CrowdingServiceTest.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/crowding/controller/CrowdingControllerTest.java`

**Interfaces:**
- Produces: `GET /api/v1/crowding/grids` and `POST /api/v1/crowding/points` in the common response envelope.
- Consumes: Task 1 grid table and Task 2 scoring/cache services.

- [ ] **Step 1: Write failing repository tests**

Persist small Polygon fixtures and assert a bounding envelope returns only intersecting grids. Use the repository signature:

```java
List<CrowdingGrid> findIntersectingBounds(
        double minLat, double maxLat, double minLng, double maxLng, int limit);
```

- [ ] **Step 2: Write failing service tests**

Cover viewport limit enforcement, batch point validation, one bounds query for a batch, duplicate-grid score reuse, reference preservation, outside-Jongno `covered=false`, and Redis fallback results.

Use a JTS `STRtree` inside `CrowdingGridLocator` so point matching does not scan every returned grid.

- [ ] **Step 3: Write failing controller contract tests**

Assert the common envelope, query/body validation, Korean labels, `mock=true`, geometry coordinate order `[longitude, latitude]`, and typed invalid-bounds errors.

- [ ] **Step 4: Verify RED**

Run:

```bash
sh ./gradlew test --tests '*CrowdingGridRepositoryTest' --tests '*CrowdingServiceTest' --tests '*CrowdingControllerTest'
```

- [ ] **Step 5: Implement entity and repository**

Map `geometry(Polygon,4326)` to JTS `Polygon`. Use one native `ST_Intersects` query with `ST_MakeEnvelope` and `limit + 1` so the service can detect an overly broad viewport.

- [ ] **Step 6: Implement service and DTOs**

Expose offset-aware slot metadata. Viewport responses contain polygon coordinates and scores. Batch point responses preserve each `referenceId`, mark uncovered points without scores, deduplicate unique grid codes, and resolve them through one cache call.

- [ ] **Step 7: Implement controller and typed errors**

Use `@Valid`, `@Tag`, `@Operation`, `/api/v1/crowding`, and `ApiResponse.onSuccess`. Do not expose entities.

- [ ] **Step 8: Verify GREEN**

Run focused tests, `sh ./gradlew compileJava`, and `git diff --check -- BE docker-compose.yml`.

---

### Task 4: Frontend batch point store and shared badges

**Files:**
- Modify: `FE/src/api/client.js`
- Modify: `FE/src/api/client.test.js`
- Create: `FE/src/utils/mockCrowdingStore.js`
- Create: `FE/src/utils/mockCrowdingStore.test.js`
- Modify: `FE/src/components/CongestionInfo.jsx`
- Modify: `FE/src/pages/ProductFlow.jsx`

**Interfaces:**
- Consumes: `POST /api/v1/crowding/points`.
- Produces: `useMockCrowdingAtPoint(longitude, latitude)` with the existing badge-compatible shape `{ congestionLevel, score, level, levelLabel, mock, slotStart, slotEnd }`.

- [ ] **Step 1: Add failing API client tests**

Assert one batch POST with `referenceId`, latitude, longitude, optional `at`, and abort signal. Assert API envelope unwrapping remains centralized in `client.js`.

- [ ] **Step 2: Add failing store tests**

Inject the fetch function and prove that registrations in the same microtask become one request, duplicate coordinates are deduplicated, returned values publish to all listeners, current-slot results are cached, and a slot change invalidates them.

- [ ] **Step 3: Verify RED**

Run:

```bash
npm --prefix FE test
```

- [ ] **Step 4: Implement the client and store**

Queue point requests and flush them as one batch. Keep a stable external-store snapshot for `useSyncExternalStore`. Schedule invalidation at the next `:00` or `:30` boundary and re-check on `visibilitychange`.

- [ ] **Step 5: Switch shared badges to MOCK data**

Change `CongestionPointBadge` to use the new point hook. Preserve existing compact badge components and level colors, use accessible `혼잡도` wording, and remove the old city-data source from point badges without deleting unrelated city-data files.

- [ ] **Step 6: Verify GREEN**

Run all frontend tests and the production build.

---

### Task 5: Viewport grid map layer and MOCK UX

**Files:**
- Modify: `FE/src/api/client.js`
- Modify: `FE/src/components/VWorldMap.jsx`
- Modify: `FE/src/pages/ProductFlow.jsx`
- Modify: `FE/src/styles.css`
- Modify: `FE/src/vworld-map.css`
- Test: `FE/src/utils/mockCrowdingMap.test.js`
- Create: `FE/src/utils/mockCrowdingMap.js`

**Interfaces:**
- Consumes: `GET /api/v1/crowding/grids`.
- Produces: a viewport-only OpenLayers vector layer and marker/grid detail labels.

- [ ] **Step 1: Add failing map-model tests**

Test response-to-GeoJSON conversion, geometry coordinate order, level label mapping, grid detail content, and marker accessibility labels.

- [ ] **Step 2: Verify RED**

Run the focused map test.

- [ ] **Step 3: Add viewport loader to VWorldMap**

Add `loadCongestionInBounds(bounds)` and an abortable request alongside `loadPlacesInBounds`. Replace layer features atomically after successful movement requests, preserve the previous layer on aborted requests, and reload at slot changes through a request key.

- [ ] **Step 4: Connect MapHome**

Call `fetchMockCrowdingGrids(bounds)`, remove the old static 121-area URL/data from the live map path, keep the existing visibility preference, and update selected-grid state from the clicked scored feature.

- [ ] **Step 5: Update visible UI copy and details**

Change `실시간 혼잡도` to `혼잡도`. The selected detail shows score, Korean level, and slot range; it no longer shows fabricated population counts or visible `예시`/`시뮬레이션` wording.

- [ ] **Step 6: Make all visible map places congestion-aware**

When rendering a place overlay, query the loaded grid vector source at the place coordinate. Add the level to the marker class and accessible label. Re-render existing place overlays after a new grid response so every visible place receives its cell's current level without another API request.

- [ ] **Step 7: Verify layout and behavior**

Run the Impeccable layout detector once, frontend tests, build, and browser checks at desktop and mobile phone widths. Verify layer toggle, viewport reload, one request per movement, place markers, grid click detail, slot copy, list/detail badges, uncovered points, and no overlap.

---

### Task 6: Integrated verification and commit checkpoint

**Files:**
- Review all files changed by Tasks 1-5.

**Interfaces:**
- Produces: a verified working tree ready for user review, not a commit.

- [ ] **Step 1: Start dependencies**

Run Redis 7 and PostgreSQL through Compose, apply the idempotent grid schema, and load Jongno cells. Record the grid count and verify all stored geometries have SRID 4326.

- [ ] **Step 2: Run backend integration smoke tests**

Verify Redis miss then hit, a 30-minute slot transition using an explicit `at`, viewport bounds, batch duplicate grids, Redis outage fallback, and outside-Jongno points.

- [ ] **Step 3: Run complete automated verification**

```bash
python -m unittest discover -s data-pipeline/tests
sh ./gradlew test
npm --prefix FE test
npm --prefix FE run build
git diff --check
```

- [ ] **Step 4: Run final browser verification**

Use the live backend and Redis. Confirm scored 50 m cells appear below markers, every visible place resolves a score, visible UI copy omits `예시` and `시뮬레이션`, the next-slot refresh works, and network inspection shows batched requests rather than one request per place.

- [ ] **Step 5: Request independent review**

Review data correctness first, then backend API/cache correctness, then frontend rendering and accessibility. Resolve Critical and Important findings and re-run scoped verification.

- [ ] **Step 6: Stop before commit**

Report changed files, grid count, test results, browser results, Redis behavior, and remaining risks to the user. Do not stage or commit until the user explicitly approves.
