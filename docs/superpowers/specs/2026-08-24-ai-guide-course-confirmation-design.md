# AI Guide Course Confirmation Design

## Goal

AI Guide course requests must not immediately render a long textual itinerary. The guide first presents the resolved candidate places and asks for confirmation. Only after the user confirms does the application calculate the course and open the existing course preview screen.

## User flow

1. The user asks for a course.
2. AI Guide gathers the required date, departure time, departure location, available duration, and real place IDs. Destination is intentionally not part of this flow.
3. Once all inputs are available, the backend returns a structured `courseProposal` instead of executing the course planner.
4. The chat renders a short answer, candidate place cards, and an “이대로 코스를 생성할까요?” action.
5. A confirmation button or a clear affirmative reply executes the proposal through `/api/v1/ai-courses/preview`.
6. The full structured preview is adopted by the existing course preview state and the app navigates to `#/compare`.
7. The proposal remains in the existing AI Guide session payload, so leaving and returning to the tab does not discard it.

## Contract changes

- `AiGuideResponse` gains an optional `courseProposal` containing the exact `AiCourseRequest` fields.
- `AiGuideLlmClient.LlmReply` carries the optional proposal.
- A complete `create_ai_course` tool call is intercepted as a proposal. It is not executed during the recommendation turn.
- `AiCourseResponse` gains the original rich `CoursePreviewResponse` so the frontend does not reconstruct routes from prose.

## Frontend behavior

- Proposal place IDs reuse the existing place-fetch and recommendation-card path.
- Only the latest unconfirmed proposal is actionable.
- Explicit affirmative phrases while a proposal is pending trigger the same handler as the confirmation button. Other messages continue through the normal chat endpoint.
- While generation runs, the confirmation action is disabled and exposes a loading label.
- A generated AI course opens the existing preview in read-only mode; Back returns to AI Guide. This avoids incorrectly invoking the basket-backed course-save contract.

## Safety and failure handling

- Only server-normalized structured proposal data is sent to the planner.
- Missing conditions continue to produce focused clarification questions.
- Invalid or failed previews remain on the chat screen and show the existing error presentation.
- Place IDs are deduplicated and limited by existing backend planner validation.

## Verification

- Backend tests prove complete AI course tool calls produce proposals without invoking the planner.
- Backend course tests prove the API response carries the rich preview.
- Frontend API/model tests prove proposal submission and preview adoption.
- AI Guide tests prove confirmation UI and affirmative-reply handling.
