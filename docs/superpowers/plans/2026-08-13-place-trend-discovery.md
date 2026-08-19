# Place Trend Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable place-trend Explore section, expose latest visible trend data from Spring, and connect the existing place detail UI to it.

**Architecture:** Presentational React components consume a compact trend view model. Spring projects the latest visible `PlaceTrendSnapshot` and its ordered keywords into list and detail DTOs; internal scoring and search-interest evidence stay server-side.

**Tech Stack:** React/Vite, Lucide React, Spring Boot/JPA, JUnit, Vitest, Playwright/browser screenshots.

## Global Constraints

- Only `TRENDING` and `WATCH` are user-visible.
- Do not expose search-interest flags, ratios, authors, posts, or internal evidence counts.
- Reuse the existing place detail shell and shared controls.
- Preserve unrelated working-tree changes.

---

### Task 1: Presentational trend UI

**Files:**
- Create focused trend components and model helpers under `FE/src/components/`.
- Modify `FE/src/pages/ProductFlow.jsx` and `FE/src/styles.css` only where required.
- Add focused component tests under the existing frontend test convention.

- [ ] Add failing tests for visible status copy, keyword limits, hidden absent trend, and card navigation.
- [ ] Implement loading, empty, list card, and detail reason components using existing tokens and controls.
- [ ] Render the section in Explore and the optional section in the existing place detail shell with temporary page-level fixture data.
- [ ] Run focused tests and `npm run build`.

### Task 2: Spring trend projection

**Files:**
- Add trend response DTOs and repository query methods under `BE/src/main/java/com/ddemachim/server/domain/place/`.
- Modify `PlaceController`, `PlaceQueryService`, and `PlaceDetailResponse`.
- Add repository/service/controller tests following existing backend conventions.

- [ ] Add failing tests for latest visible snapshot selection, keyword ordering, list ordering, limit bounds, and nullable detail trend.
- [ ] Implement `GET /places/trends?limit=6` and append nullable `trend` to `GET /places/{id}`.
- [ ] Run focused Spring tests.

### Task 3: Frontend integration

**Files:**
- Modify `FE/src/api/client.js`, trend view-model helpers, and `ProductFlow.jsx`.
- Update frontend tests for API success, empty, and failure behavior.

- [ ] Add failing API/model tests for the frozen response contract.
- [ ] Replace fixtures with API loading while keeping failure non-blocking.
- [ ] Verify list-to-detail navigation and conditional detail rendering.
- [ ] Run frontend tests and production build.

### Task 4: End-to-end verification

- [ ] Run relevant data-pipeline, Spring, and frontend test suites.
- [ ] Start the local app and inspect Explore and detail at desktop and mobile widths.
- [ ] Fix overlap, overflow, loading, empty, and missing-image defects in one bounded pass.
- [ ] Re-run builds and report remaining risks.
