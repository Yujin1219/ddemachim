# Jongno Region Query Redesign Implementation Plan


**Goal:** Collect Jongno blog-trend evidence with nine canonical commercial-area groups, exactly eighteen approved representative queries, up to 100 search results per query, and preserve aliases without duplicate region signals.

**Architecture:** Replace rotating region/intent generation with configuration-driven canonical region groups and two fixed intents (`카페`, `맛집`). Normalize CLI aliases to one canonical group, carry the alias set through JSON observations, and persist it in the blog observation table while preserving the existing body-selection quota of 30 and idempotent loader behavior.

**Tech Stack:** Python 3, `unittest`, JSON configuration, PostgreSQL/PostGIS, psycopg.

## Global Constraints

- The actual run uses exactly the nine representative terms `안국`, `서촌`, `익선동`, `삼청동`, `혜화`, `부암동`, `서순라길`, `창신동`, `동묘`.
- Each representative term gets only `카페` and `맛집`; aliases never become additional same-day queries.
- `resultsPerQuery=100`; body selection quota remains the existing sum of 30.
- Popup data and exhibition queries are excluded.
- Do not inspect or expose `.env`, secrets, credentials, dumps, or private data.
- Preserve unrelated user changes in the working tree.

---

### Task 1: Lock the canonical query and persistence contract with failing tests

**Files:**
- Modify: `data-pipeline/tests/test_repeated_blog_trend.py`
- Modify: `data-pipeline/tests/test_blog_trend_loader.py`

**Interfaces:**
- `generate_queries(config, collection_date, regions=None)` returns eighteen query specs with canonical `region`, `regionAliases`, `regionQuery`, and fixed `CAFE`/`RESTAURANT` intent categories.
- `blog_trend_loader._upsert_observation` sends `region_aliases` to the observation UPSERT.

- [ ] Add tests for nine canonical groups, exact eighteen query strings, no alias query expansion, alias CLI normalization, and `resultsPerQuery == 100` while body quota remains 30.
- [ ] Add a test asserting aggregated evidence stores one canonical region and the configured aliases when both query intents observe the same place.
- [ ] Add a loader test asserting the observation SQL contains `region_aliases` and receives the alias array.
- [ ] Run the focused tests and confirm they fail for the missing new contract.

### Task 2: Implement canonical groups and fixed 18-query generation

**Files:**
- Modify: `data-pipeline/config/blog_trend_discovery.json`
- Modify: `data-pipeline/scripts/repeated_blog_trend.py`

**Interfaces:**
- Add internal region helpers that accept both canonical labels and aliases and return one ordered canonical group per selected input.
- Keep `select_body_targets` canonical-region aware so region coverage cannot count aliases as separate groups.

- [ ] Replace the rotating query generator with fixed representative/intention pairs.
- [ ] Carry `canonicalRegion`, `regionQuery`, and `regionAliases` into normalized observations.
- [ ] Include canonical-region/alias summaries in place evidence without changing post URL deduplication.
- [ ] Add run stats for configured query count/results-per-query if needed for the execution report.
- [ ] Run the focused query and aggregation tests and confirm they pass.

### Task 3: Persist aliases safely in fresh and existing databases

**Files:**
- Modify: `data-pipeline/src/db/schema.sql`
- Modify: `data-pipeline/src/db/add_blog_trend_tables.sql`
- Modify: `data-pipeline/src/loaders/blog_trend_loader.py`

**Interfaces:**
- Add nullable-compatible `blog_trend_observation.region_aliases text[]` to fresh schema and an `ADD COLUMN IF NOT EXISTS` migration.
- Include `region_aliases` in observation insert/update parameters without changing existing identity keys.

- [ ] Update loader SQL and tests.
- [ ] Run all data-pipeline unit tests.
- [ ] Apply the migration through the existing connection helper without printing connection details.

### Task 4: Execute, verify, and report the live run

**Files:**
- Modify: `data-pipeline/README.md` only if the changed default contract is not documented by the implementation.

- [ ] Run a no-network dry-run and verify exactly eighteen queries and maximum metadata 1,800.
- [ ] Run the live pipeline for the approved collection date with `resultsPerQuery=100`, body limit 30, and DB persistence enabled.
- [ ] Query only aggregate counts from the result artifact and database, never credentials or raw private data.
- [ ] Run final diff/test checks and report changed files, commands, raw/deduplicated/body/Jongno-place/DB counts, and concrete risks.
