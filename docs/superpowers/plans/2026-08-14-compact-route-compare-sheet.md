# Compact Route Compare Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized selected-place sheet with a compact route comparison list and keep the fixed origin and destination visible above it.

**Architecture:** Keep route request ownership in `MapHome`, add pure helpers for fastest-mode selection and endpoint normalization, and render the selected place as a compact header inside `SelectedPlaceRoutePanel`. `VWorldMap` will fit the union of route geometry and explicit origin/destination points once per selected place.

**Tech Stack:** React 19, JavaScript ES modules, OpenLayers 10, CSS, Node test runner, react-test-renderer, Vite.

## Global Constraints

- Do not change backend route APIs or provider integrations.
- Keep the temporary origin fixed to `TEMPORARY_JONGNO_ORIGIN` and label it `광화문 출발`.
- Hide the transit comparison row whenever its ready response is `UNAVAILABLE`.
- The fastest available mode is selected only before the user manually chooses a mode for the current place.
- Route comparison sheet maximum height is `min(44dvh, 360px)` and sits above the bottom navigation.
- Every interactive target remains at least 44px tall and exposes selection through `aria-pressed`.
- Do not add dependencies or convert files to TypeScript.
- Preserve unrelated working-tree changes and commit only task-owned hunks.

---

### Task 1: Fastest available route selection

**Files:**
- Modify: `FE/src/utils/routeComparison.js`
- Test: `FE/src/utils/routeComparison.test.js`

**Interfaces:**
- Consumes: route comparison response `{ routes: RouteOption[] }` and an optional ordered mode list.
- Produces: `fastestAvailableRouteMode(response, modes = ROUTE_MODES): 'WALK' | 'TRANSIT' | 'TAXI' | null`.

- [ ] **Step 1: Write failing tests for fastest selection**

Add tests that require invalid, unavailable, and missing durations to be ignored and preserve `ROUTE_MODES` order for ties:

```js
test('selects the fastest available route and preserves mode order for ties', () => {
  assert.equal(fastestAvailableRouteMode({ routes: [
    { mode: 'WALK', status: 'AVAILABLE', durationSeconds: 840 },
    { mode: 'TRANSIT', status: 'AVAILABLE', durationSeconds: 610 },
    { mode: 'TAXI', status: 'AVAILABLE', durationSeconds: 610 },
  ] }), 'TRANSIT');
});

test('ignores unavailable and invalid route durations', () => {
  assert.equal(fastestAvailableRouteMode({ routes: [
    { mode: 'WALK', status: 'AVAILABLE', durationSeconds: null },
    { mode: 'TRANSIT', status: 'UNAVAILABLE', durationSeconds: 300 },
    { mode: 'TAXI', status: 'AVAILABLE', durationSeconds: 720 },
  ] }), 'TAXI');
  assert.equal(fastestAvailableRouteMode({ routes: [] }), null);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cd FE && node --test src/utils/routeComparison.test.js`

Expected: FAIL because `fastestAvailableRouteMode` is not exported.

- [ ] **Step 3: Implement the pure selector**

Add an ordered reduction that accepts only `status === 'AVAILABLE'` and finite `durationSeconds >= 0`:

```js
export function fastestAvailableRouteMode(response, modes = ROUTE_MODES) {
  let fastest = null;
  for (const mode of modes) {
    const option = routeOptionByMode(response, mode);
    const duration = normalizeRouteNumber(option?.durationSeconds);
    if (option?.status !== 'AVAILABLE' || duration === null || duration < 0) continue;
    if (!fastest || duration < fastest.duration) fastest = { mode, duration };
  }
  return fastest?.mode ?? null;
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `cd FE && node --test src/utils/routeComparison.test.js`

Expected: all route comparison utility tests pass.

---

### Task 2: Compact comparison header and rows

**Files:**
- Modify: `FE/src/components/SelectedPlaceRoutePanel.js`
- Test: `FE/src/components/SelectedPlaceRoutePanel.test.js`

**Interfaces:**
- Consumes: existing route/location props plus `originLabel = '광화문'`, `onOpenPlaceDetail`, and `onResolvedModeChange`.
- Produces: compact header, button rows, fastest badge, row-specific secondary metrics, and selected detail.

- [ ] **Step 1: Rewrite component expectations as failing tests**

Change the render tests to require the compact header and route row content:

```js
test('renders compact origin and destination header with route comparison rows', async () => {
  const renderer = await renderPanel();
  const copy = textContent(renderer.toJSON());
  assert.equal(copy.includes('출발광화문'), true);
  assert.equal(copy.includes('도착서울공예박물관'), true);
  assert.deepEqual(modeButtons(renderer).map(textContent), [
    '도보14분960m',
    '대중교통22분환승 1회',
    '택시10분예상 8,700원가장 빠름',
  ]);
});
```

Add assertions that `상세` invokes `onOpenPlaceDetail`, the fastest badge appears only on the fastest available row, hidden transit still falls back through `onResolvedModeChange`, and a click still invokes `onModeChange`.

- [ ] **Step 2: Run the panel test and confirm RED**

Run: `cd FE && node --test src/components/SelectedPlaceRoutePanel.test.js`

Expected: FAIL because the old origin/title and tab markup do not meet the compact contract.

- [ ] **Step 3: Implement compact header and row metrics**

Replace `selected-route-origin`, standalone `h2`, and centered tabs with:

```js
h('header', { className: 'selected-route-header' },
  h('div', { className: 'selected-route-endpoints' },
    h('p', null, h('span', null, '출발'), h('strong', null, originLabel)),
    h('p', null, h('span', null, '도착'), h('strong', { id: 'selected-place-route-title' }, selectedPlace?.name || '선택한 장소')),
  ),
  onOpenPlaceDetail && h('button', { type: 'button', className: 'selected-route-detail-link', onClick: onOpenPlaceDetail }, '상세'),
)
```

Keep `route-mode-tab` as the stable test and focus class but render it as a horizontal comparison row. Add a `routeRowSecondary(option, mode)` helper returning distance, transfer count, or expected fare. Derive the badge with `fastestAvailableRouteMode({ routes: routeList(routeData) }, visibleModes)`. Use `onResolvedModeChange` only in the fallback effect so parent-controlled automatic correction is not mistaken for a manual click.

- [ ] **Step 4: Run the panel test and confirm GREEN**

Run: `cd FE && node --test src/components/SelectedPlaceRoutePanel.test.js`

Expected: all selected-place route panel tests pass.

---

### Task 3: Parent selection policy and selected-place sheet composition

**Files:**
- Modify: `FE/src/pages/ProductFlow.jsx`
- Test: `FE/src/utils/routeComparison.test.js`

**Interfaces:**
- Consumes: `fastestAvailableRouteMode(effectiveRouteData)` and `SelectedPlaceRoutePanel` callbacks.
- Produces: fastest initial selection, manual selection persistence for the current place, compact detail navigation, and explicit route endpoints for the map.

- [ ] **Step 1: Add failing source-contract tests**

Extend the existing `MapHome uses the temporary Jongno origin contract` test with assertions for:

```js
assert.match(mapHomeSource, /const \[hasManuallySelectedRouteMode, setHasManuallySelectedRouteMode\] = useState\(false\)/);
assert.match(mapHomeSource, /fastestAvailableRouteMode\(effectiveRouteData\)/);
assert.match(mapHomeSource, /routeFitCoordinates:\s*\[\s*\[location\.longitude, location\.latitude\],\s*\[routeDestination\.longitude, routeDestination\.latitude\]/);
assert.doesNotMatch(mapHomeSource, /className={`map-location-button/);
assert.match(mapHomeSource, /originLabel="광화문"/);
```

- [ ] **Step 2: Run the source-contract test and confirm RED**

Run: `cd FE && node --test src/utils/routeComparison.test.js`

Expected: FAIL because manual-selection state, endpoint fit props, and compact sheet wiring do not exist.

- [ ] **Step 3: Implement controlled fastest/manual selection**

Add `hasManuallySelectedRouteMode`. Reset it in both `selectPlace` and `clearSelectedPlace`. When current route data becomes ready and no manual choice exists, select the fastest mode:

```js
useEffect(() => {
  if (effectiveRouteStatus !== 'ready' || hasManuallySelectedRouteMode) return;
  const fastestMode = fastestAvailableRouteMode(effectiveRouteData);
  if (fastestMode) setActiveRouteMode(fastestMode);
}, [effectiveRouteData, effectiveRouteStatus, hasManuallySelectedRouteMode, routeSelectionKey]);
```

Pass a click callback that sets both active mode and the manual flag, while `onResolvedModeChange={setActiveRouteMode}` handles hidden/unavailable fallback without setting the flag.

- [ ] **Step 4: Replace the large selected `ScreenSection`**

Render `ScreenSection` and `PlaceRow` only when no place is selected. For a selected place, pass `originLabel="광화문"` and `onOpenPlaceDetail` only when `selectedPlaceDetail` exists. Remove the no-op current-location button and replace the floating sentence with the compact panel copy.

- [ ] **Step 5: Pass explicit origin and destination endpoints**

Add to `mapProps`:

```js
routeFitCoordinates: routeDestination
  ? [[location.longitude, location.latitude], [routeDestination.longitude, routeDestination.latitude]]
  : [],
```

- [ ] **Step 6: Run source-contract and panel tests**

Run: `cd FE && node --test src/utils/routeComparison.test.js src/components/SelectedPlaceRoutePanel.test.js`

Expected: both files pass.

---

### Task 4: Fit route endpoints even without geometry

**Files:**
- Modify: `FE/src/utils/routeGeometry.js`
- Test: `FE/src/utils/routeGeometry.test.js`
- Modify: `FE/src/components/VWorldMap.jsx`

**Interfaces:**
- Consumes: `routeFitCoordinates: Array<[longitude, latitude]>` from `MapHome`.
- Produces: `routeFitPointCoordinates(values, transformCoordinate)` and one-time OpenLayers fit over geometry plus endpoints.

- [ ] **Step 1: Write failing endpoint normalization tests**

```js
test('normalizes valid route fit endpoints and applies the projection transform', () => {
  const transformed = routeFitPointCoordinates([
    [126.9769, 37.5716],
    [127.0276, 37.4979],
    [181, 37.5],
    null,
  ], ([longitude, latitude]) => [longitude * 2, latitude * 2]);
  assert.deepEqual(transformed, [
    [253.9538, 75.1432],
    [254.0552, 74.9958],
  ]);
});
```

- [ ] **Step 2: Run geometry tests and confirm RED**

Run: `cd FE && node --test src/utils/routeGeometry.test.js`

Expected: FAIL because `routeFitPointCoordinates` is not exported.

- [ ] **Step 3: Implement endpoint normalization**

Add a pure helper that accepts only finite longitude/latitude pairs inside geographic bounds and maps them through the provided transform.

- [ ] **Step 4: Merge endpoint and route extents in `VWorldMap`**

Add `routeFitCoordinates = []` to props. In the fit effect, create a `boundingExtent` from `routeFitPointCoordinates(routeFitCoordinates, fromLonLat)`, append it to valid route geometry extents, and fit the combined extent. Do not return early when line features are empty. Mark `fittedRouteKeyRef.current` only after an extent exists, and use:

```js
padding: [112, 28, 420, 28]
```

Include `routeFitCoordinates` in the effect dependencies while retaining the place-based `routeFitKey` guard.

- [ ] **Step 5: Run geometry and route comparison tests**

Run: `cd FE && node --test src/utils/routeGeometry.test.js src/utils/routeComparison.test.js`

Expected: both files pass.

---

### Task 5: Compact responsive styling and full verification

**Files:**
- Modify: `FE/src/styles.css`
- Verify: `FE/src/components/SelectedPlaceRoutePanel.test.js`
- Verify: all `FE/src/**/*.test.js`

**Interfaces:**
- Consumes: compact class names from Tasks 2–3.
- Produces: a content-height sheet above navigation, 48–52px rows, truncation, visible focus, and narrow-screen layout.

- [ ] **Step 1: Replace oversized selected-sheet rules**

Set the selected sheet to sit above navigation and cap its height:

```css
.map-nearby-sheet.has-selected-route {
  bottom: calc(72px + env(safe-area-inset-bottom));
  max-height: min(44dvh, 360px);
  min-height: 0;
  overflow-y: auto;
  padding: 8px 16px 14px;
}
```

Remove the old `calc(100% - 72px)` maximum and the duplicated `72px` bottom padding. Style `.selected-route-header` and `.selected-route-endpoints` as a compact two-row grid, keep destination truncation, and position the close control within the header zone.

- [ ] **Step 2: Convert tabs to comparison rows**

Use a single-column `.route-mode-tabs` grid, 48–52px `.route-mode-tab` rows, left-aligned mode label, right-aligned primary and secondary metrics, and a compact fastest badge. Keep active state, focus ring, 44px touch minimum, and 320px overflow protection.

- [ ] **Step 3: Reduce expanded detail height**

Remove fixed 70px detail minimum, tighten status/detail margins, keep the taxi CTA at least 44px, and let exceptional overflow scroll inside the capped sheet.

- [ ] **Step 4: Run focused tests**

Run: `cd FE && node --test src/components/SelectedPlaceRoutePanel.test.js src/utils/routeComparison.test.js src/utils/routeGeometry.test.js`

Expected: all focused tests pass.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd FE && npm test`

Expected: all frontend tests pass with zero unexpected console errors.

- [ ] **Step 6: Build production assets**

Run: `cd FE && npm run build`

Expected: Vite exits 0 and writes the production bundle.

- [ ] **Step 7: Run the Impeccable manual detector once**

Run the repository detector against the changed UI target after all UI edits, then inspect 320px and 390px layouts in the local browser. Confirm the selected sheet stays at or below 360px, the bottom navigation does not overlap it, and both endpoint markers remain visible for a transit response with no geometry.

- [ ] **Step 8: Check the final diff without staging unrelated changes**

Run:

```bash
git diff --check -- FE/src/utils/routeComparison.js FE/src/utils/routeComparison.test.js FE/src/components/SelectedPlaceRoutePanel.js FE/src/components/SelectedPlaceRoutePanel.test.js FE/src/pages/ProductFlow.jsx FE/src/utils/routeGeometry.js FE/src/utils/routeGeometry.test.js FE/src/components/VWorldMap.jsx FE/src/styles.css
```

Expected: no whitespace errors. Review only owned hunks because several target files already contain user changes.

---

### Task 6: Restore the selected-place card header

**Files:**
- Modify: `FE/src/pages/ProductFlow.jsx`
- Modify: `FE/src/components/SelectedPlaceRoutePanel.js`
- Test: `FE/src/components/SelectedPlaceRoutePanel.test.js`
- Modify: `FE/src/styles.css`

**Interfaces:**
- Consumes: the existing `mapKakaoPlaceToMapCard`, `placeToCardProps`, `PlaceRow`, and `selectedPlaceDetailTarget` flows.
- Produces: the former image/name/address place card above the compact route rows, plus a short `광화문 출발` route context label.

- [ ] **Step 1: Change the panel test to reject the endpoint header**

Require the route panel to render `광화문 출발` and not render `출발`/`도착` endpoint rows or a standalone `상세` button.

- [ ] **Step 2: Run the panel test and confirm RED**

Run: `cd FE && node --test src/components/SelectedPlaceRoutePanel.test.js`

Expected: FAIL because the compact endpoint header still exists.

- [ ] **Step 3: Simplify the route panel header**

Remove `selected-route-header`, `selected-route-endpoints`, and `onOpenPlaceDetail`. Render only:

```js
h('p', { className: 'selected-route-origin' }, `${originLabel} 출발`)
```

- [ ] **Step 4: Restore `PlaceRow` in `MapHome`**

Recreate `selectedPlaceCard` with the existing internal/Kakao mapping. When a place is selected, render `PlaceRow` directly above `SelectedPlaceRoutePanel`; internal cards keep their detail click and Kakao cards remain non-clickable. Do not restore a redundant `선택한 장소` section title.

- [ ] **Step 5: Compact card and close-button styling**

Keep the existing card visual language while reducing selected-sheet spacing. Reserve the top-right close button area and remove obsolete endpoint/detail-link CSS.

- [ ] **Step 6: Verify**

Run: `cd FE && npm test && npm run build`

Expected: all frontend tests and the production build pass.

---

### Task 7: Add map focus mode and a two-snap route sheet

**Files:**
- Create: `FE/src/utils/mapHomeInteraction.js`
- Create: `FE/src/utils/mapHomeInteraction.test.js`
- Modify: `FE/src/components/VWorldMap.jsx`
- Modify: `FE/src/pages/ProductFlow.jsx`
- Modify: `FE/src/styles.css`

**Interfaces:**
- Produces: `mapHomeInteractionReducer(state, action)` for focus and sheet state.
- `VWorldMap` produces an `onMapClick` callback for blank-map interaction.

- [ ] Test map focus, place selection, handle toggle, and drag thresholds.
- [ ] Implement the reducer and watch focused tests pass.
- [ ] Remove the selected-place close button.
- [ ] Wire map click and place selection to focus mode, preserving a search restore button.
- [ ] Increase the handle target to 44px and snap the selected sheet to a 60px peek.
- [ ] Run the full frontend test suite, production build, and design detector.
