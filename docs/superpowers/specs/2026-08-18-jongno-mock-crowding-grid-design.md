# Jongno Mock Crowding Grid Design

## Purpose

Replace the broad Seoul city-data polygons in the demo experience with a 50 m grid covering Jongno-gu. Each grid receives a deterministic MOCK congestion score for a 30-minute Asia/Seoul time slot. Redis caches generated scores for 24 hours, but correctness must not depend on Redis availability or key retention.

## Scope

- Generate and persist static Jongno 50 m grid polygons in PostGIS.
- Generate 1-100 MOCK scores lazily for requested grids.
- Cache scores in Redis 7 with atomic first-write behavior.
- Return scored grids for a map viewport and scored results for a batch of coordinates.
- Render viewport grid colors and point-matched place/event badges in the frontend.
- Refresh frontend data at the next 30-minute slot boundary.
- Keep MOCK terminology in technical documentation and API metadata only. User-facing labels show `혼잡도` and the current level without `예시` or `시뮬레이션` wording.

## Non-goals

- Estimating actual visitors or population density.
- Predicting future congestion.
- Permanently storing time-series scores in PostgreSQL.
- Replacing Redis with a source of truth.
- Rendering every Jongno grid outside the current map viewport.

## Spatial Model

Grid generation uses EPSG:5186 because it uses metres and covers Seoul. The existing Jongno boundary GeoJSON is transformed from EPSG:4326 to EPSG:5186, covered with un-clipped 50 m squares, filtered to squares intersecting Jongno, and transformed back to EPSG:4326 for storage and map delivery. Intersecting cells are retained as complete 50 m squares instead of being clipped to the administrative boundary, so a narrow strip outside Jongno can be covered by a boundary cell.

Grid identity is derived from the metre coordinates, not database sequence IDs:

```text
gridX = floor(x / 50)
gridY = floor(y / 50)
gridCode = G-{gridX}-{gridY}
```

The fixed projection, cell size, and floor rule guarantee that one coordinate always maps to the same grid code. A coordinate is covered when it falls inside one of the stored Jongno-intersecting cells; this is intentionally different from strict containment by the administrative boundary.

## Database Contract

```text
crowding_grid

id                BIGSERIAL PRIMARY KEY
grid_code         VARCHAR(64) UNIQUE NOT NULL
grid_x            INTEGER NOT NULL
grid_y            INTEGER NOT NULL
geometry          geometry(Polygon, 4326) NOT NULL
center_latitude   DOUBLE PRECISION NOT NULL
center_longitude  DOUBLE PRECISION NOT NULL
created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
```

Required indexes:

- Unique B-tree index on `grid_code`.
- GiST index on `geometry`.
- Unique constraint on `(grid_x, grid_y)`.

The data pipeline owns generation and loading. The backend only reads this table.

## Time Slots

Business time uses `Asia/Seoul`. Request instants are floored to a 30-minute slot:

```text
14:00-14:29 -> 14:00
14:30-14:59 -> 14:30
```

Every response includes `slotStart` and `slotEnd` with a `+09:00` offset.

## Deterministic Score

The score seed is:

```text
{configuredMockSeed}|v1|{gridCode}|{yyyy-MM-dd}|{HH:mm}
```

SHA-256 is applied to the UTF-8 seed. An unsigned value from the digest is mapped to `1..100`. The configured mock seed must be stable across restarts and must not be exposed in API responses or logs.

This is a deterministic pseudorandom value. Different keys are independently generated but may coincidentally have the same score.

## Levels

| Score | Level | Label |
|---|---|---|
| 1-25 | `RELAXED` | `여유` |
| 26-50 | `NORMAL` | `보통` |
| 51-75 | `CROWDED` | `약간 붐빔` |
| 76-100 | `VERY_CROWDED` | `붐빔` |

## Redis Contract

Redis key:

```text
crowding:v1:{gridCode}:{yyyy-MM-dd}:{HH:mm}
```

Redis value is the integer score encoded as text. TTL is 24 hours. The TTL only removes old keys; slot changes are controlled by the key's date and slot start.

Read flow:

1. Use one multi-get for all unique keys in the request.
2. Deterministically generate only misses.
3. Store each miss with `SET NX EX 86400` semantics.
4. When another request wins the first write, read and use the winner.
5. If Redis is unavailable, log a concise warning and return deterministic scores without failing the API.

Redis is an optimization and demonstration dependency, not the correctness boundary.

## API Contracts

All endpoints use the existing `ApiResponse<T>` envelope and `/api/v1` prefix.

### Viewport grids

```http
GET /api/v1/crowding/grids?minLat={value}&maxLat={value}&minLng={value}&maxLng={value}&at={optionalOffsetDateTime}
```

Returns only grids intersecting the requested viewport. Each item contains `gridCode`, polygon coordinates, centre coordinates, score, level, label, `mock=true`, `slotStart`, and `slotEnd`. Bounds are validated and the result has a configured maximum grid count.

### Coordinate batch

```http
POST /api/v1/crowding/points
```

Request:

```json
{
  "at": "2026-08-18T14:17:00+09:00",
  "points": [
    { "referenceId": "place:101", "latitude": 37.5759, "longitude": 126.9768 }
  ]
}
```

Response items preserve `referenceId`. A point inside a stored Jongno-intersecting cell returns `gridCode`, score, level, label, and slot metadata. A point outside every stored cell returns `covered=false` and no fabricated score. Duplicate grids share one Redis lookup and score.

The request has a configured maximum point count. Invalid coordinates fail validation; valid coordinates outside the stored grid coverage do not fail the batch.

## Frontend Data Flow

- The map requests scored grid polygons for the current viewport and slot.
- Place, filming-location, and event collections submit visible coordinates through the batch endpoint rather than issuing one request per item.
- A shared frontend store deduplicates in-flight requests and caches results by `gridCode + slotStart`.
- At the next 30-minute boundary, the frontend invalidates the current slot and refetches visible data.
- On `visibilitychange`, the frontend compares the current slot and refetches if the slot changed while the tab was hidden.
- Existing Seoul city-data code remains available during implementation but is no longer the source for MOCK place badges once the new flow is enabled.

## Map UX

- Only viewport grids are rendered, underneath place markers.
- Grid fills use the four existing congestion color families with restrained opacity.
- Place markers remain the primary interaction target.
- Selecting a grid shows its level, score, and slot with a visible `혼잡도` label.
- Existing congestion layer visibility preference continues to control the grid layer.
- The legend and toggle say `혼잡도`; they do not claim that the value is real-time.

## Configuration

Local development adds Redis 7 to `docker-compose.yml`. Backend configuration uses environment-driven host, port, timeout, TTL, seed, maximum viewport grids, and maximum batch points. No credentials or environment-specific endpoints are hardcoded.

The application must still start when Redis is unavailable. Redis health affects cache usage, not endpoint correctness.

## Error Handling

- Invalid bounds or coordinates: typed `400` error in the common response envelope.
- Viewport result above the configured limit: typed `400` asking the client to narrow the viewport.
- Redis unavailable or malformed cached value: warning log, deterministic fallback, successful MOCK response.
- PostGIS query failure: typed server error; do not return invented geometry.
- Missing grid coverage for a valid point: `covered=false`.

## Testing

- Grid generation produces 50 m squares in EPSG:5186 and stable grid codes.
- Schema and migration contain required constraints and spatial index.
- Slot boundaries cover 14:00, 14:29, and 14:30 correctly in Asia/Seoul.
- Deterministic score is stable across repeated calls and remains in 1..100.
- Level boundaries cover 25/26, 50/51, and 75/76.
- Redis hit, miss, atomic first write, malformed value, and outage fallback are covered.
- Viewport query returns only intersecting grids and enforces limits.
- Batch points deduplicate grid keys and preserve references.
- Frontend client sends one viewport or batch request, not one request per place.
- Frontend refreshes at the slot boundary and after background-tab slot changes.
- Map layer, list badges, detail badges, empty coverage, and toggle copy are verified in a real browser.

## Delivery Order

1. Data schema, deterministic generator, and Jongno grid load tooling.
2. Redis infrastructure, scoring core, repositories, and backend APIs.
3. Frontend shared store, map grid layer, list/detail badges, and slot refresh.
4. Cross-domain verification and commit review.
