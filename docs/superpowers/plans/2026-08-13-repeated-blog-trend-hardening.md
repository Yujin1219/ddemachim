# Repeated Blog Trend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden repeated blog sampling so daily results are comparable and only independent, adequately covered evidence can corroborate a trend.

**Architecture:** Keep the existing single repeated-pipeline module and append-only stores. Change query generation and body selection at collection time, enrich canonical place evidence during aggregation, and strengthen the shared Search Trend summary before classification.

**Tech Stack:** Python 3, standard-library `unittest`, JSON configuration, existing Naver API HUB and Kakao Local clients.

## Global Constraints

- Execute inline in the current task; do not dispatch subagents.
- Preserve unrelated working-tree changes and do not read `.env`, dumps, or credentials.
- Keep `uniqueQueries` for audit output but use `uniqueIntentCategories` for classification.
- Keep Search Trend explicitly relative-only and never describe it as absolute search volume.
- Use the existing total body limit and global author cap.

---

### Task 1: Comparable Query Sampling And Region Coverage

**Files:**
- Modify: `data-pipeline/config/blog_trend_discovery.json`
- Modify: `data-pipeline/scripts/repeated_blog_trend.py`
- Test: `data-pipeline/tests/test_repeated_blog_trend.py`

**Interfaces:**
- Produces: `generate_queries(config, collection_date, regions=None) -> list[dict[str, str]]`, with one stable and one rotating query per region.
- Produces: `select_body_targets(grouped_posts, config, body_limit=None, seed=None) -> list[dict[str, Any]]`, with `selectionBucket="region_coverage"` for relevance-funded regional picks.

- [ ] **Step 1: Write failing query and selection tests**

Add assertions that each region keeps `"요즘 뜨는 곳"` across adjacent dates, only the second query rotates through non-DISCOVERY categories, and a six-region candidate set gives every region at least two selected posts when `body_limit=30`.

- [ ] **Step 2: Verify the focused tests fail**

Run: `PYTHONPATH=data-pipeline/scripts PYTHONDONTWRITEBYTECODE=1 python3 -m unittest data-pipeline.tests.test_repeated_blog_trend.RepeatedBlogTrendTest.test_query_generation_keeps_one_stable_query_per_region data-pipeline.tests.test_repeated_blog_trend.RepeatedBlogTrendTest.test_selection_reserves_two_relevance_slots_per_region`

Expected: failures because all queries currently rotate and selection has no regional floor.

- [ ] **Step 3: Implement deterministic stable-plus-rotating queries**

Configure:

```json
"queryGeneration": {
  "stableIntent": {"category": "DISCOVERY", "phrase": "요즘 뜨는 곳"},
  "rotatingCategories": ["FOOD", "PHOTO", "EVENT"],
  "rotatingIntentsPerRegion": 1,
  "rotationSalt": "repeated-blog-trend-v2"
}
```

Use the salt as a fixed offset and `collection_date.toordinal()` as the daily increment so same-day reruns are identical and adjacent dates advance exactly one rotating entry.

- [ ] **Step 4: Implement relevance-funded region coverage**

Add `selection.regionMinimum=2`. Before the existing buckets, spend at most the scaled relevance quota in round-robin region passes, selecting each region's highest-scoring eligible post and charging every selected post against the URL set and author cap. Subtract those picks from the later relevance quota.

- [ ] **Step 5: Run the focused test module**

Run: `cd data-pipeline && PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_repeated_blog_trend`

Expected: all repeated-pipeline tests pass.

### Task 2: Independent Intent Evidence And Place Aliases

**Files:**
- Modify: `data-pipeline/config/blog_trend_discovery.json`
- Modify: `data-pipeline/scripts/repeated_blog_trend.py`
- Test: `data-pipeline/tests/test_repeated_blog_trend.py`

**Interfaces:**
- Produces: aggregate fields `uniqueIntentCategories: int` and `aliases: list[str]`.
- Produces: `build_place_trend_groups(evidence, config) -> list[TrendKeywordGroup]` with at most five canonical-name-plus-alias keywords.
- Consumes: `observedPlaceName` written by `_place_evidence_rows(...)`.

- [ ] **Step 1: Write failing category and alias tests**

Test that two synonymous query strings in one intent category count as one independent category, a second category counts as two, observed representative names survive aggregation, and a trend group contains canonical name first with no more than five deduplicated keywords.

- [ ] **Step 2: Verify the new tests fail**

Run: `cd data-pipeline && PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_repeated_blog_trend`

Expected: failures for missing `uniqueIntentCategories`, `aliases`, `observedPlaceName`, and `build_place_trend_groups`.

- [ ] **Step 3: Enrich evidence and classification**

Store the representative map name as `observedPlaceName`, aggregate intent categories and aliases, and replace `uniqueQueries` with `uniqueIntentCategories` in minimum, WATCH, and TRENDING thresholds. Preserve raw `uniqueQueries` in every result.

- [ ] **Step 4: Build bounded Search Trend keyword groups**

Gate candidates using author count or intent-category count. Build each `TrendKeywordGroup` from canonical name followed by distinct observed aliases, truncated to `MAX_KEYWORDS_PER_GROUP`.

- [ ] **Step 5: Run the focused test module**

Run: `cd data-pipeline && PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_repeated_blog_trend`

Expected: all repeated-pipeline tests pass.

### Task 3: Non-Zero Search Trend Coverage Guard

**Files:**
- Modify: `data-pipeline/config/blog_trend_discovery.json`
- Modify: `data-pipeline/scripts/naver_search_trend.py`
- Modify: `data-pipeline/scripts/repeated_blog_trend.py`
- Test: `data-pipeline/tests/test_blog_trend_pipeline.py`
- Test: `data-pipeline/tests/test_repeated_blog_trend.py`

**Interfaces:**
- Produces: `summarize_trend_ratio(...)` fields `recent_nonzero_observations` and `baseline_nonzero_observations`.
- Consumes: trend settings `minimumRecentNonzeroObservations=3`, `minimumBaselineNonzeroObservations=7`, and `minimumRatio=2.0`.

- [ ] **Step 1: Write failing summary and guard tests**

Extend the shared summary test with explicit zero and positive ratios. Test that a large ratio fails when either period lacks non-zero coverage and passes only when both coverage thresholds and the ratio threshold pass.

- [ ] **Step 2: Verify the tests fail**

Run: `cd data-pipeline && PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_blog_trend_pipeline tests.test_repeated_blog_trend`

Expected: failures because non-zero counts and coverage reasons do not exist.

- [ ] **Step 3: Implement non-zero counts and coverage decisions**

Count values greater than zero in each summary window. Remove `baselineFloor`; reject zero baseline as `baseline_missing`, then reject insufficient baseline or recent non-zero observations with distinct reasons, and finally evaluate `recent / baseline >= minimumRatio`.

- [ ] **Step 4: Run both affected test modules**

Run: `cd data-pipeline && PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_blog_trend_pipeline tests.test_repeated_blog_trend`

Expected: both modules pass.

### Task 4: Documentation And End-To-End Verification

**Files:**
- Modify: `data-pipeline/README.md`
- Verify: all files changed in Tasks 1-3

**Interfaces:**
- Documents the operational contract used by daily collection and downstream presentation.

- [ ] **Step 1: Update the repeated-pipeline documentation**

Document stable-plus-rotating queries, regional body coverage, intent-category evidence, alias groups, and non-zero Search Trend coverage. Remove the obsolete baseline-floor wording.

- [ ] **Step 2: Run the complete data-pipeline test suite**

Run: `cd data-pipeline && PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'`

Expected: all tests pass.

- [ ] **Step 3: Run a no-network dry run**

Run: `cd data-pipeline && PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 python3 scripts/repeated_blog_trend.py --date 2026-08-13 --dry-run`

Expected: 12 queries, maximum 240 metadata results, body limit 30, and no network or file writes.

- [ ] **Step 4: Check the final diff**

Run: `git diff --check -- data-pipeline/config/blog_trend_discovery.json data-pipeline/scripts/repeated_blog_trend.py data-pipeline/scripts/naver_search_trend.py data-pipeline/tests/test_repeated_blog_trend.py data-pipeline/tests/test_blog_trend_pipeline.py data-pipeline/README.md docs/superpowers/specs/2026-08-13-repeated-blog-trend-hardening-design.md docs/superpowers/plans/2026-08-13-repeated-blog-trend-hardening.md`

Expected: no whitespace errors.
