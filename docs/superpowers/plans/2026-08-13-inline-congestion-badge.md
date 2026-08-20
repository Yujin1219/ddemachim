# Inline Congestion Badge Implementation Plan


**Goal:** Place the compact point-matched congestion badge beside place and event metadata on detail pages.

**Architecture:** Keep the shared congestion component, five-minute cache, and point matching unchanged. Change only the detail-page composition and layout styles so the existing badge participates in a wrapping metadata row.

**Tech Stack:** React, CSS, Vite, in-app browser verification

## Global Constraints

- Place detail must show district/category and congestion in the same wrapping metadata row.
- Event detail must show status, event type, and congestion in the existing wrapping status row.
- Invalid or unmatched coordinates must render no badge and no empty spacing.
- List badges, map rendering, cache behavior, badge copy, color, and accessibility stay unchanged.
- Do not stage or commit until the user reviews the completed UI.

---

### Task 1: Inline Detail Metadata Badge

**Files:**
- Modify: `FE/src/pages/ProductFlow.jsx:1531`
- Modify: `FE/src/pages/ProductFlow.jsx:1604-1609`
- Modify: `FE/src/styles.css:1179-1182`
- Modify: `FE/src/styles.css:1277`

**Interfaces:**
- Consumes: `CongestionPointBadge({ longitude, latitude })`
- Produces: `.detail-meta-row` as a wrapping place metadata row; event status row includes the existing point badge

- [ ] **Step 1: Capture the failing layout behavior**

Open a covered place detail and verify `.eyebrow` and `.congestion-detail-badge` do not share the same parent. Open a covered event detail and verify `.congestion-detail-badge` is not inside `.event-status-row`.

- [ ] **Step 2: Implement the place metadata row**

Render the existing eyebrow and point badge inside one container:

```jsx
<div className="detail-meta-row">
  <p className="eyebrow">{[place.district, place.categoryLabel].filter(Boolean).join(' · ')}</p>
  <CongestionPointBadge longitude={place.longitude} latitude={place.latitude} />
</div>
```

- [ ] **Step 3: Implement the event metadata row**

Move the point badge inside the existing event status row after the event type:

```jsx
<div className="event-status-row">
  <Chip active>{stateLabel}</Chip>
  {displayEvent.eventType && <span className="event-type-label">{displayEvent.eventType}</span>}
  <CongestionPointBadge longitude={displayEvent.longitude} latitude={displayEvent.latitude} />
</div>
```

- [ ] **Step 4: Add resilient inline layout**

Use wrapping flex layout and remove the old detail badge top margin:

```css
.detail-meta-row { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }
.detail-meta-row .eyebrow { min-width: 0; }
.detail-meta-row .congestion-detail-badge,
.event-status-row .congestion-detail-badge { flex: 0 0 auto; }
```

- [ ] **Step 5: Verify behavior**

Run `npm --prefix FE test`, `npm --prefix FE run build`, and focused `git diff --check`. In the browser verify covered place/event details share their respective metadata parent, an uncovered event has no badge, narrow layouts do not overlap, list badges remain visible, and a fresh tab has no console errors.

- [ ] **Step 6: Stop before commit**

Report the completed UI and verification evidence. Do not stage or commit.
