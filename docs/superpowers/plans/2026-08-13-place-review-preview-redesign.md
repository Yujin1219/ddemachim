# Place Review Preview Redesign Implementation Plan


**Goal:** Replace the tall generic Place review card with a compact, Naver Map-familiar preview that presents accurate ratings, visible review photos, a clear full-review endpoint, and safe UI behavior for future API payloads.

**Architecture:** Keep the public component boundary as `summary`, `reviews`, and a new optional `onViewAll` callback. Normalize untrusted review data in `placeReviewPreviewModel.js`, then render one featured review with adaptive photo media and one compact supporting review. Preserve the current route and backend boundary; this task makes no backend changes and adds no dependency.

**Tech Stack:** React, Vite, plain CSS, Lucide React, Node test runner

## Global Constraints

- Modify frontend files only under `FE/**`, plus this implementation plan.
- Preserve unrelated working-tree changes.
- Do not add a frequently mentioned keyword block.
- Show real review photos in the preview.
- Display the review count once and keep the average rating visually accurate.
- Use the existing blue brand accent, Pretendard typography, and radius tokens.
- Keep interactive targets at least 44px tall and preserve visible keyboard focus.
- Keep motion restrained to press feedback; no entrance or scroll animation.
- Keep the current fixture boundary until a review API exists.
- Do not create a git commit unless the user requests one.

---

### Task 1: Harden the review view model

**Files:**
- Modify: `FE/src/components/placeReviewPreviewModel.js`
- Test: `FE/src/components/placeReviewPreviewModel.test.js`

**Interfaces:**
- Consumes: raw `summary` and `reviews` props from `PlaceDetail`
- Produces: `normalizeRating(value)`, `normalizeReviewSummary(summary, reviews)`, `normalizePreviewReviews(reviews)`, and null-safe `getPreviewPhotos(photos, limit)`

- [ ] **Step 1: Write failing tests for rating and summary normalization**

```js
test('normalizes numeric strings and rejects invalid ratings', () => {
  assert.equal(normalizeRating('4.7'), 4.7);
  assert.equal(normalizeRating(null), null);
  assert.equal(normalizeRating('bad'), null);
});

test('falls back to the visible review length when the summary count is invalid', () => {
  assert.deepEqual(
    normalizeReviewSummary({ averageRating: null, reviewCount: 'bad' }, [{}, {}]),
    { averageRating: null, reviewCount: 2 },
  );
});
```

- [ ] **Step 2: Run the focused model test and verify RED**

Run: `npm test -- src/components/placeReviewPreviewModel.test.js`

Expected: FAIL because the normalization exports do not exist.

- [ ] **Step 3: Implement minimal normalization**

```js
export function normalizeRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const rating = Number(value);
  return Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : null;
}

export function normalizeReviewSummary(summary, reviews = []) {
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const count = Number(summary?.reviewCount);
  return {
    averageRating: normalizeRating(summary?.averageRating),
    reviewCount: Number.isFinite(count) && count >= 0 ? Math.floor(count) : safeReviews.length,
  };
}
```

- [ ] **Step 4: Add failing tests for null photos and malformed review arrays**

```js
test('returns no photos for null and removes photos without a usable URL', () => {
  assert.deepEqual(getPreviewPhotos(null), []);
  assert.equal(getPreviewPhotos([{ id: 'missing' }, { id: 'ok', url: '/ok.jpg' }]).length, 1);
});

test('normalizes a non-array review payload to an empty list', () => {
  assert.deepEqual(normalizePreviewReviews(null), []);
});
```

- [ ] **Step 5: Run the test and verify the new cases fail for the expected reasons**

Run: `npm test -- src/components/placeReviewPreviewModel.test.js`

Expected: FAIL on null photo spreading and the missing review normalizer.

- [ ] **Step 6: Implement photo and review normalization**

```js
export function normalizePreviewReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  return reviews.filter(Boolean).slice(0, 2).map((review, index) => ({
    ...review,
    uiKey: String(review.id ?? `review-preview-${index}`),
    rating: normalizeRating(review.rating),
    photos: getPreviewPhotos(review.photos),
  }));
}
```

- [ ] **Step 7: Run focused and full tests**

Run: `npm test -- src/components/placeReviewPreviewModel.test.js`

Expected: PASS with all model cases.

---

### Task 2: Build the compact map-style review preview

**Files:**
- Modify: `FE/src/components/PlaceReviewPreview.jsx`
- Modify: `FE/src/pages/ProductFlow.jsx`
- Modify: `FE/src/styles.css`

**Interfaces:**
- Consumes: normalized summary and two preview reviews from Task 1
- Produces: `PlaceReviewPreview({ summary, reviews, onViewAll })`

- [ ] **Step 1: Replace the five-star average with one star and an exact numeric value**

Render `4.7` as `4.7`, never as five filled stars. Review-level values use the same one-star numeric treatment so decimal ratings remain truthful.

- [ ] **Step 2: Flatten the outer card**

Remove the outer bordered card treatment. Use spacing and a single divider to align the block with the existing Place detail sheet.

- [ ] **Step 3: Render one featured review**

Keep author, visit verification, numeric rating, semantic `<time>`, review text, adaptive photos, and the helpful control. Remove the generic initial avatar so the trust hierarchy starts with the author and verification evidence.

- [ ] **Step 4: Make photo layout adaptive and actionable**

Use `data-count` rules:

```css
.place-review-photos[data-count='1'] { grid-template-columns: 1fr; }
.place-review-photos[data-count='2'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.place-review-photos[data-count='3'] { grid-template-columns: 1.35fr .65fr; grid-template-rows: 1fr 1fr; }
.place-review-photos[data-count='3'] > :first-child { grid-row: 1 / -1; }
```

Each photo is a button only when `onViewAll` exists. A failed image shows a stable inline fallback instead of collapsing the grid.

- [ ] **Step 5: Render the second review compactly**

Clamp its copy to two lines and show at most one 72px photo thumbnail. Keep the same metadata and helpful control without repeating a full gallery.

- [ ] **Step 6: Add a clear endpoint**

Place a full-width, minimum 44px `후기 전체보기` button after the reviews. Remove the small top-right section action and pass `onViewAll={() => go('reviews')}` from both Place detail branches.

- [ ] **Step 7: Add empty and accessibility states**

Use a semantic labelled region, show `아직 방문자 후기가 없어요` when the normalized list is empty, announce helpful state changes politely, and retain global focus behavior.

- [ ] **Step 8: Add restrained interaction feedback**

Use exact-property transitions and `scale(.98)` on press for photo, helpful, and full-review buttons. Disable transform motion under the existing reduced-motion media query.

---

### Task 3: Verify behavior and visual integrity

**Files:**
- Verify: `FE/src/components/PlaceReviewPreview.jsx`
- Verify: `FE/src/components/placeReviewPreviewModel.js`
- Verify: `FE/src/components/placeReviewPreviewModel.test.js`
- Verify: `FE/src/pages/ProductFlow.jsx`
- Verify: `FE/src/styles.css`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 implementation
- Produces: tested build and a visually reviewed Place detail route

- [ ] **Step 1: Run all frontend tests**

Run: `npm test`

Expected: all tests pass with no warnings.

- [ ] **Step 2: Build the frontend**

Run: `npm run build`

Expected: Vite build succeeds; the existing large-chunk warning may remain but no new error is introduced.

- [ ] **Step 3: Run mechanical checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Run the Impeccable detector over changed UI targets**

Run: `node .agents/skills/impeccable/scripts/detect.mjs --json FE/src/components/PlaceReviewPreview.jsx FE/src/pages/ProductFlow.jsx`

Expected: `[]` or only reviewed false positives.

- [ ] **Step 5: Inspect the Place route at phone width**

Verify the average score is exact, review count appears once, two-photo and three-photo layouts have no empty cell, all tap targets fit, text does not overlap, and the bottom sticky actions do not cover `후기 전체보기`.

- [ ] **Step 6: Review the final diff**

Confirm no backend file changed, no keyword block was introduced, and unrelated working-tree changes remain untouched.
