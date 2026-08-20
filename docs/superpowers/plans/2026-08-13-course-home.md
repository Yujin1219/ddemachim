# Course Home Implementation Plan


**Goal:** Replace the course tab's creation-first landing screen with a mock-data course hub for scheduled, completed, and public courses.

**Architecture:** Add a focused `CourseHome` component backed by a pure mock-data model. Keep hash routing in `ProductFlow`, change only the course root route, and preserve the existing `course-conditions` creation flow behind the plus action.

**Tech Stack:** React, JavaScript, Lucide React, existing CSS and hash navigation.

## Global Constraints

- Work only in `/private/tmp/ddemachim-feat-course` on `feat/course`.
- Preserve the existing visual system and creation flow.
- Use mock data only; do not add backend APIs.
- Do not add dependencies or nested cards.
- Keep all controls keyboard accessible and mobile-safe.

---

### Task 1: Course Home Model and Component

**Files:**
- Create: `FE/src/components/courseHomeModel.js`
- Create: `FE/src/components/courseHomeModel.test.js`
- Create: `FE/src/components/CourseHome.jsx`

**Interfaces:**
- Produces: `scheduledCourses`, `completedCourses`, `publicCourses` arrays.
- Produces: `CourseHome({ go })`, where `go(route, id?)` is the existing navigation callback.

- [ ] Write model tests that verify scheduled/completed separation and required public card metadata.
- [ ] Run `node --test src/components/courseHomeModel.test.js` and verify it fails before implementation.
- [ ] Implement the immutable mock model and accessible `CourseHome` screen.
- [ ] Run the focused model test and verify it passes.

### Task 2: Course Route Integration

**Files:**
- Modify: `FE/src/pages/ProductFlow.jsx`

**Interfaces:**
- Consumes: `CourseHome({ go })`.
- Produces: `course-home` route and `rootRoutes.course = 'course-home'`.

- [ ] Import `CourseHome`.
- [ ] Add `course-home` to the course route group.
- [ ] Change the course root route from `course-conditions` to `course-home`.
- [ ] Render `CourseHome` while preserving all existing creation routes.
- [ ] Verify `rg -n "course-home|CourseHome" FE/src/pages/ProductFlow.jsx` shows all integration points.

### Task 3: Course Home Styling

**Files:**
- Modify: `FE/src/styles.css`

**Interfaces:**
- Consumes: class names emitted by `CourseHome.jsx`.
- Produces: responsive mobile course hub visuals without affecting existing course creation selectors.

- [ ] Add stable layout dimensions for header, tabs, list rows, and horizontal public cards.
- [ ] Add focus-visible, selected, hover, and reduced-motion behavior.
- [ ] Verify at 390px and wide desktop framing that text and controls do not overlap.

### Task 4: Verification

**Files:**
- Test: `FE/src/components/courseHomeModel.test.js`
- Inspect: `FE/src/components/CourseHome.jsx`, `FE/src/pages/ProductFlow.jsx`, `FE/src/styles.css`

- [ ] Run `node --test src/components/courseHomeModel.test.js`.
- [ ] Run `npm run build`.
- [ ] Run the Impeccable detector once over changed UI files.
- [ ] Start Vite on an available port and inspect the course tab at mobile and desktop viewports.
- [ ] Confirm `+` opens `course-conditions`, tabs switch content, and public cards scroll horizontally.
