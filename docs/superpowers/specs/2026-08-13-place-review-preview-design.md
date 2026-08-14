# Place Review Preview Design

## Scope

Build only the Place detail review preview UI. Do not add or change backend APIs, database schemas, authentication, uploads, or review submission behavior in this phase.

Keep the existing hero image. Remove the standalone body section titled `사진`. Review photos remain visible inside each visitor review.

## User Experience

The review preview appears below the existing Place information and description. It follows the compact scanning pattern of a map-based place detail page without copying another product's brand styling.

The section contains:

- A `방문자 후기 126` heading with an `전체보기` action.
- A compact average rating summary showing `4.7` and five stars.
- Two recent review previews.
- For each review: nickname initial, nickname, rating, date, optional visit verification, text, up to three photo thumbnails, and a working local `도움돼요` toggle.
- No frequently mentioned keyword summary and no filters on the Place detail preview.

`전체보기` opens the existing `reviews` route. Sorting and filtering belong on that full review screen when backend integration is added.

## Data Boundary

`PlaceReviewPreview` is a presentational component that receives a summary and review items. UI-only fixture data lives outside the component so it can later be replaced by an API response without redesigning the markup.

The future backend shape is expected to provide:

- Summary: `reviewCount`, `averageRating`.
- Review: `id`, `authorNickname`, `rating`, `createdAt`, `visitVerified`, `text`, `photos`, `helpfulCount`, `isHelpfulByMe`.
- Photo: `id`, `url`, `thumbnailUrl`, `displayOrder`.

The author avatar uses a nickname initial because the current backend exposes a nickname but has no review-profile-image contract. A review may contain up to five uploaded photos later, while the Place preview displays only the first three thumbnails.

## Visual Direction

Use the existing Pretendard type stack, blue brand color, neutral app background, border color, and 12-16px radii. The review list is one grouped white surface with restrained separators instead of multiple floating cards.

Review photos form a stable three-column square grid. Text and controls must fit at 320px and 390px widths. All buttons retain visible keyboard focus, 44px touch targets where practical, and semantic labels.

## Behavior And States

- The helpful toggle updates locally in the UI preview and never calls the backend.
- Toggling helpful adjusts the count by one and never allows a negative count.
- Photo preview order follows `displayOrder` and is limited to three.
- The same preview is shown in the mock Place route and API-backed Place detail until the review API replaces fixture data.
- Existing loading and Place error states remain unchanged.

## Verification

- Test photo ordering, three-photo limiting, and helpful-count toggling with Node's built-in test runner.
- Run the production frontend build.
- Inspect the Place detail at 390x844 and 320x844.
- Confirm the standalone body photo section is gone, review photos render, no horizontal overflow appears, and the sticky actions do not cover the final review.
