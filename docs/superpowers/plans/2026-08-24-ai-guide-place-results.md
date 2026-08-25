# AI 가이드 장소 추천 결과 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 답변 아래에 중복 없는 접이식 장소 추천 결과 UI를 제공한다.

**Architecture:** 답변 문자열과 기존 `recommendedPlaces`를 순수 표현 유틸리티에서 결합해 `messageContent`와 카드 모델로 분리한다. 상태를 가진 작은 React 컴포넌트가 처음 3개 노출, 펼치기, 접기, 지도 이동, 장소 상세 이동을 담당한다.

**Tech Stack:** React 19, Vite, Node test runner, react-test-renderer, CSS

**Spec:** `docs/superpowers/specs/2026-08-24-ai-guide-place-results-design.md`

## Global Constraints

- AI 채팅 API와 `recommendedPlaceIds` 계약을 변경하지 않는다.
- 기존 메시지 전송과 장소 상세 이동을 유지한다.
- 실제 답변에 존재하는 도보 시간과 거리만 표시한다.
- 처음에는 최대 3개만 표시한다.
- 사용자 소유의 기존 변경을 보존하고 커밋하지 않는다.

---

### Task 1: 추천 결과 표현 모델

**Files:**
- Modify: `FE/src/utils/aiGuidePresentation.js`
- Test: `FE/src/pages/AiGuide.test.js`

**Interfaces:**
- Produces: `buildAiGuidePlacePresentation(content, recommendedPlaces)`
- Returns: `{ messageContent, recommendations }`

- [ ] 답변의 장소 목록 행을 카드 모델로 옮기고 말풍선 본문에서는 제거하는 실패 테스트를 작성한다.
- [ ] `cd FE && node --test src/pages/AiGuide.test.js`로 의도한 실패를 확인한다.
- [ ] 알려진 장소명과 매칭되는 목록 행에서 `walkingMinutes`와 `distanceMeters`를 추출하는 최소 구현을 작성한다.
- [ ] 테스트를 다시 실행해 통과를 확인한다.
- [ ] 실제 근거가 있을 때만 추천 이유를 만드는 실패 테스트와 최소 구현을 같은 주기로 추가한다.

### Task 2: 접이식 추천 결과 컴포넌트

**Files:**
- Create: `FE/src/components/AiGuidePlaceRecommendations.js`
- Create: `FE/src/components/AiGuidePlaceRecommendations.test.js`

**Interfaces:**
- Consumes: Task 1의 `recommendations`
- Produces: `AiGuidePlaceRecommendations({ recommendations, onPlaceClick, onMapClick })`

- [ ] 최초 렌더링에서 3개만 표시하는 실패 테스트를 작성하고 실패를 확인한다.
- [ ] 섹션 헤더, compact 카드, 3개 제한을 최소 구현해 통과시킨다.
- [ ] 펼치기 클릭 후 전체 표시, 접기 클릭 후 3개 복귀를 검증하는 실패 테스트를 작성한다.
- [ ] `aria-expanded`를 포함한 상태 구현으로 테스트를 통과시킨다.
- [ ] 지도보기와 장소 카드 클릭 callback을 실제 렌더러에서 검증한다.

### Task 3: AI 가이드 통합과 시각 스타일

**Files:**
- Modify: `FE/src/pages/ProductFlow.jsx`
- Modify: `FE/src/styles.css`

**Interfaces:**
- Consumes: Task 1의 표현 모델과 Task 2의 컴포넌트

- [ ] 기존 목록 항목 내부 카드 매칭 코드를 제거하고 분리된 컴포넌트를 연결한다.
- [ ] 장소 클릭은 `go('place', id)`, 지도보기는 `go('map')`을 재사용한다.
- [ ] 52px 이미지, 15px radius, neutral border, subtle shadow, 8px gap의 카드 스타일을 작성한다.
- [ ] hover, focus-visible, active와 좁은 모바일 폭을 위한 스타일을 작성한다.
- [ ] `cd FE && npm test`와 `cd FE && npm run build`를 실행한다.

### Task 4: 실제 화면 검증

**Files:**
- Verify only

- [ ] AI 가이드에서 장소 추천 질문을 전송한다.
- [ ] AI 말풍선과 추천 결과가 분리되고 장소 정보가 한 번만 보이는지 확인한다.
- [ ] 최초 3개, 펼치기, 접기, 지도보기, 장소 상세 이동을 확인한다.
- [ ] 390px 이하 화면에서 줄바꿈, 버튼 대비, 입력 영역 겹침을 확인한다.
- [ ] visible copy, em dash, 강한 파란 border, 과도한 gradient 여부를 프리플라이트한다.
