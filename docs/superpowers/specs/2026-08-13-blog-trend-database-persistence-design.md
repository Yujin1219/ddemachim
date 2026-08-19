# Blog Trend Database Persistence Design

## Goal

Persist the repeated Naver Blog place observations and their daily aggregate
results in PostgreSQL, and map the same schema with Spring Data JPA entities.
The database becomes the durable source for later frontend APIs while the
existing JSONL artifacts remain an operational audit trail.

## Data Model

### Naver map place identity

A representative Naver blog map place is accepted when its structured address
resolves to `종로구`. It is merged into the existing `place` master through
`place_source(source = 'NAVER_MAP', source_id = <Naver place id>)`. No Kakao
lookup is required by this repeated collection pipeline.

### `blog_trend_observation`

Stores one sampled search observation per `(collection_date, query, post_url)`.
It contains the linked `place_id`, author, publication date, search rank,
intent category, ad suspicion signals, observed map name, and normalized
`body_topic_candidates`. Blog HTML and raw body text are never stored.

### `place_trend_snapshot`

Stores one aggregate per `(place_id, snapshot_date)`. It contains the
classification, evidence counts, rank/ad ratios, Search Trend corroboration,
and the generated `whyTrending` summary metadata. A new day creates history;
rerunning the same day updates that day's row.

### `place_trend_keyword`

Stores the ordered keywords owned by a snapshot, including `label`,
`support_posts`, and `support_authors`. Rerunning a snapshot replaces its
keyword children so stale explanations cannot remain.

## Pipeline Flow

1. Run search, body selection, representative map extraction, and aggregation.
2. Keep only Naver map places whose structured address district is `종로구`.
3. Resolve each Naver map ID to a `place_id` through `place_source`.
4. UPSERT sampled observations by their existing idempotency key.
5. UPSERT the daily snapshot and replace its keywords.
6. Commit all database writes in one transaction and include load counts in
   the run artifact.

Normal live runs require `DATABASE_URL`. `--skip-db` is an explicit escape
hatch for file-only diagnostics. `--dry-run` continues to perform no network
or database writes.

## Spring Mapping

Add `BlogTrendObservation`, `PlaceTrendSnapshot`, and `PlaceTrendKeyword` under
the place domain, plus `PlaceTrendStatus` and focused JPA repositories. All
associations are lazy. Snapshot keyword lifecycle is represented by the
foreign key and queried through its repository; no broad cascading behavior
is required because the Python loader owns writes.

## Failure Handling

Database persistence is transactional. Missing schema, missing
`DATABASE_URL`, an unresolved canonical place, or a SQL error fails the live
pipeline so the scheduler reports a non-zero result. JSONL identities remain
idempotent, allowing a retry without double-counting observations.

## Verification

- Python tests cover canonical metadata propagation, record transformation,
  UPSERT identities, keyword replacement, and `--skip-db` behavior.
- Spring compilation verifies entity and repository mappings.
- Focused Spring tests verify enum values and entity table/constraint metadata
  without relying on the repository's currently incomplete H2 schema fixture.
