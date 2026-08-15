# Congestion Detail Badge-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expanded congestion section on place and event details with a single current congestion badge above each title.

**Architecture:** Keep the shared five-minute cache and point-in-polygon lookup unchanged. Replace only the detail presenter with a coordinate-aware badge component, while preserving every list badge.

**Tech Stack:** React, Vite, OpenLayers geometry matching, browser UI verification

## Global Constraints

- Keep list-level congestion badges unchanged.
- Show no detail badge when coordinates do not match a valid congestion area.
- Do not display area name, population range, reference time, message, or stale explanation on detail pages.
- Do not commit without the user's approval.

---

### Task 1: Badge-only detail presentation

**Files:**
- Modify: `FE/src/components/CongestionInfo.jsx`
- Modify: `FE/src/pages/ProductFlow.jsx`
- Modify: `FE/src/styles.css`

**Interfaces:**
- Consumes: `useJongnoCongestionAtPoint(longitude, latitude)` and `CongestionBadge({ congestion, className })`
- Produces: `CongestionPointBadge({ longitude, latitude })`, returning a badge or `null`

- [ ] **Step 1: Verify the current UI fails the new requirement**

Open a covered place and event detail. Confirm `.congestion-detail-section` exists and its text includes `예상 인원` and `기준 시간`.

- [ ] **Step 2: Implement the minimal presenter**

Replace `CongestionDetailSection` with `CongestionPointBadge`. It should call `useJongnoCongestionAtPoint`, return `null` without a match, and otherwise return:

```jsx
<CongestionBadge congestion={congestion} className="congestion-detail-badge" />
```

- [ ] **Step 3: Move the badge above detail titles**

In `PlaceDetail`, render the badge between the eyebrow and `<h1>`. In `EventDetail`, render it between the status/type row and `<h1>`. Keep every list usage of `CongestionBadge` unchanged.

- [ ] **Step 4: Remove obsolete expanded-section styles**

Delete `.congestion-detail-section` rules and add a small `.congestion-detail-badge` spacing rule without introducing a container or card.

- [ ] **Step 5: Verify the new behavior**

Run `npm --prefix FE run build`. In the browser, confirm covered place/event details have exactly one `지금 ...` or `최근 ...` badge, no `.congestion-detail-section`, and no population/time/message copy. Confirm explore, event, and filming lists still show their existing badges and the console has no errors.

- [ ] **Step 6: Stop before commit**

Report the completed change and verification results to the user. Do not stage or commit.
