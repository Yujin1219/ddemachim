# Place Review Preview Implementation Plan


**Goal:** Add a backend-ready, photo-forward visitor review preview to the Place detail UI and remove the standalone body photo gallery.

**Architecture:** A focused presentational component renders a summary and two review items supplied by a small UI model module. `ProductFlow` owns navigation and inserts the component into both Place detail branches. The model remains independent of React so its ordering, limiting, and helpful-toggle rules can be tested with Node's built-in test runner.

**Tech Stack:** React, Vite, Lucide React, CSS, Node `node:test`

## Global Constraints

- Change frontend files only. Do not modify `BE/**` or backend contracts.
- Keep the existing Place hero image and remove only the standalone body section titled `사진`.
- Show review photos but no frequently mentioned keyword block.
- Display at most three ordered photo thumbnails per review in the Place preview.
- Preserve all unrelated working-tree changes.
- Reuse existing design tokens and Lucide icons; add no dependencies.

---

### Task 1: Review Preview Model

**Files:**
- Create: `FE/src/components/placeReviewPreviewModel.js`
- Create: `FE/src/components/placeReviewPreviewModel.test.js`
- Modify: `FE/package.json`

**Interfaces:**
- Produces: `getPreviewPhotos(photos, limit)`, `toggleHelpful(review)`, `PLACE_REVIEW_SUMMARY`, and `PLACE_REVIEW_ITEMS`.
- Consumes: Plain review and photo objects matching the design spec.

- [ ] **Step 1: Add the failing model tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreviewPhotos, toggleHelpful } from './placeReviewPreviewModel.js';

test('orders review photos and limits the preview to three', () => {
  const photos = [
    { id: 2, displayOrder: 2 },
    { id: 0, displayOrder: 0 },
    { id: 3, displayOrder: 3 },
    { id: 1, displayOrder: 1 },
  ];
  assert.deepEqual(getPreviewPhotos(photos).map((photo) => photo.id), [0, 1, 2]);
});

test('toggles helpful state and keeps the count non-negative', () => {
  assert.deepEqual(toggleHelpful({ helpfulCount: 0, isHelpfulByMe: false }), { helpfulCount: 1, isHelpfulByMe: true });
  assert.deepEqual(toggleHelpful({ helpfulCount: 0, isHelpfulByMe: true }), { helpfulCount: 0, isHelpfulByMe: false });
});
```

- [ ] **Step 2: Run the model test and verify RED**

Run: `node --test src/components/placeReviewPreviewModel.test.js` from `FE/`.

Expected: FAIL because `placeReviewPreviewModel.js` does not exist.

- [ ] **Step 3: Implement the minimal model**

```js
export function getPreviewPhotos(photos = [], limit = 3) {
  return [...photos]
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0))
    .slice(0, limit);
}

export function toggleHelpful(review) {
  const isHelpfulByMe = !review.isHelpfulByMe;
  const delta = isHelpfulByMe ? 1 : -1;
  return {
    helpfulCount: Math.max(0, (review.helpfulCount ?? 0) + delta),
    isHelpfulByMe,
  };
}
```

Add backend-shaped fixture exports with two reviews and existing `/assets/figma/*` image URLs. Add `"test": "node --test src/**/*.test.js"` to `FE/package.json`.

- [ ] **Step 4: Run the model test and verify GREEN**

Run: `npm test` from `FE/`.

Expected: 2 tests pass with no warnings.

### Task 2: Presentational Review Component

**Files:**
- Create: `FE/src/components/PlaceReviewPreview.jsx`
- Modify: `FE/src/styles.css`

**Interfaces:**
- Consumes: `summary`, `reviews`.
- Produces: A semantic review summary and grouped list; helpful toggles are local-only.
- Depends on: `getPreviewPhotos` and `toggleHelpful` from Task 1.

- [ ] **Step 1: Build the component**

Render a compact rating summary followed by two `<article>` rows. Each row includes a nickname initial, author metadata, five small stars, review text, a stable photo grid using the first three ordered thumbnails, and a `도움돼요` button using `ThumbsUp`. Use `BadgeCheck` for visit verification and label decorative stars with `aria-hidden="true"`.

- [ ] **Step 2: Add focused Place review styles**

Add `.place-review-*` rules beside the existing Place detail styles. Reuse `--color-*`, `--radius-*`, and `--color-border-default`; use a single grouped white surface, 1px row separators, 12px gaps, square photo cells, and no shadow. Ensure long nicknames and review text wrap without horizontal overflow.

- [ ] **Step 3: Re-run model tests**

Run: `npm test` from `FE/`.

Expected: 2 tests pass.

### Task 3: Place Detail Integration And Verification

**Files:**
- Modify: `FE/src/pages/ProductFlow.jsx`

**Interfaces:**
- Consumes: `PlaceReviewPreview`, `PLACE_REVIEW_SUMMARY`, and `PLACE_REVIEW_ITEMS`.
- Produces: The review preview in both mock and API-backed Place detail branches.

- [ ] **Step 1: Integrate the preview**

Import the new component and fixtures. Add a `ScreenSection` titled `방문자 후기 126` with `전체보기` navigation to the existing `reviews` route. Place it after the live information in the mock branch and after `PlaceDescriptionSection` in the API-backed branch.

- [ ] **Step 2: Remove the standalone photo gallery**

Delete only the API-backed `ScreenSection title="사진"` block. Keep the hero image selection and rendering unchanged.

- [ ] **Step 3: Run automated checks and production build**

Run: `npm test` from `FE/`.

Expected: 2 tests pass.

Run: `npm run build` from `FE/`.

Expected: Vite exits 0 and produces `dist/` without compilation errors.

- [ ] **Step 4: Inspect responsive UI**

Start Vite and inspect `/#/place` at 390x844 and 320x844. Confirm review images are visible, the standalone body photo gallery is absent, text does not overlap, there is no horizontal page overflow, focus rings remain visible, and the sticky action area does not obscure review content.
