# Blog Body Why-Trending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add map-adjacent blog-body topic extraction and a consensus-based `whyTrending` result to repeated place evidence.

**Architecture:** Extend the existing SmartEditor parser to return text assigned to a representative map. Reuse `blog_topic_extraction.py` for normalization and add a deterministic unique-author aggregator; the repeated pipeline persists only candidate terms and attaches the aggregate explanation.

**Tech Stack:** Python 3 standard library, existing `HTMLParser`, JSONL observation stores, `unittest`.

## Global Constraints

- Execute inline without subagents.
- Do not persist complete body HTML or complete body text.
- Do not use shared topics to decide WATCH or TRENDING status.
- Require three unique authors by default and return no explanation below that threshold.
- Count each post URL once even when observed under multiple queries.

---

### Task 1: Representative Map Body Context

**Files:**
- Modify: `data-pipeline/scripts/blog_place_pipeline.py`
- Test: `data-pipeline/tests/test_blog_place_pipeline.py`

**Interfaces:**
- Produces: `extract_place_context_text(html_text, representative_place) -> str`.
- Produces: extracted post field `body_topic_candidates: list[str]`; never a body-text field.

- [ ] Write a failing test with two SmartEditor map modules and distinct text, asserting only the representative map's text is returned.
- [ ] Write a failing extraction test asserting normalized body candidates are emitted and raw context is absent.
- [ ] Run the focused module and confirm failures are caused by the missing context API and candidates.
- [ ] Implement ordered paragraph/map parsing, nearest-map assignment, bounded context, and candidate extraction.
- [ ] Run `tests.test_blog_place_pipeline` and confirm it passes.

### Task 2: Unique-Author Topic Consensus

**Files:**
- Modify: `data-pipeline/scripts/blog_topic_extraction.py`
- Test: `data-pipeline/tests/test_blog_trend_pipeline.py`

**Interfaces:**
- Produces: `build_shared_topic_explanation(records, min_authors=3, max_topics=4) -> dict[str, Any]`.
- Consumes record keys `postUrl`, `author`, and `bodyTopicCandidates`.

- [ ] Write failing tests proving three authors qualify, duplicate query rows do not inflate support, two authors do not qualify, and redundant subphrases are removed.
- [ ] Run the focused tests and verify the missing API failure.
- [ ] Implement set-based support aggregation, deterministic ranking, redundancy removal, and Korean summary generation.
- [ ] Run the topic and trend-pipeline tests and confirm they pass.

### Task 3: Repeated Pipeline Integration

**Files:**
- Modify: `data-pipeline/config/blog_trend_discovery.json`
- Modify: `data-pipeline/scripts/repeated_blog_trend.py`
- Modify: `data-pipeline/README.md`
- Test: `data-pipeline/tests/test_repeated_blog_trend.py`

**Interfaces:**
- Stores `bodyTopicCandidates` in matched place evidence rows.
- Emits `whyTrending` in each aggregate place record.

- [ ] Write failing tests that candidates survive Kakao matching and aggregate evidence contains the expected explanation.
- [ ] Run the repeated-pipeline tests and verify the new assertions fail.
- [ ] Add topic thresholds to configuration, copy candidates into append-only evidence, and attach the shared-topic explanation during aggregation.
- [ ] Document that only normalized map-adjacent candidates are retained and public explanations require independent-author consensus.
- [ ] Run all repeated-pipeline tests and confirm they pass.

### Task 4: Full Verification And Live Smoke

**Files:**
- Verify all files changed in Tasks 1-3.

- [ ] Run the complete `data-pipeline` unittest suite.
- [ ] Run a two-region live smoke to a temporary output directory.
- [ ] Confirm raw body HTML/text is absent and `whyTrending` has either evidence-backed keywords or an explicit insufficient-evidence reason.
- [ ] Run `git diff --check` for all changed files.
