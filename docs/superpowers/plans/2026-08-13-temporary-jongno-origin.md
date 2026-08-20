# Temporary Jongno Route Origin Implementation Plan


**Goal:** 메인 홈 경로 출발지를 광화문 좌표로 임시 고정하고 브라우저 위치 요청을 생략한다.

**Architecture:** `ProductFlow.jsx`에 임시 좌표 상수를 하나 추가하고 `MapHome`이 기존 위치 훅 대신 이 좌표와 `ready` 상태를 사용한다. 공통 위치 훅과 경로 API 계약은 변경하지 않아 상수 사용부를 제거하면 GPS 흐름으로 복귀할 수 있다.

**Tech Stack:** React 19, JavaScript, Node test runner, Vite.

## Global Constraints

- 임시 좌표는 `latitude: 37.5716`, `longitude: 126.9769`다.
- 지도 사용자 위치와 경로 API origin이 동일한 좌표를 사용한다.
- `MapHome`에서 Geolocation API를 호출하지 않는다.
- 기존 위치 훅과 백엔드 코드는 변경하지 않는다.
- 기존 dirty `ProductFlow.jsx` 변경을 보존하고 정확한 hunk만 커밋한다.

---

### Task 1: Fix MapHome Origin to Gwanghwamun

**Files:**
- Modify: `FE/src/pages/ProductFlow.jsx`
- Test: `FE/src/utils/routeComparison.test.js`

**Interfaces:**
- Consumes: 기존 `useRouteComparison({ origin, destination })`와 `VWorldMap.userLocation`.
- Produces: `TEMPORARY_JONGNO_ORIGIN = Object.freeze({ latitude: 37.5716, longitude: 126.9769 })`를 MapHome의 location으로 사용.

- [ ] **Step 1: Add a failing source-contract test**

`routeComparison.test.js`에서 `ProductFlow.jsx` 소스를 읽어 정확한 상수와 `MapHome` 사용을 검증한다.

```js
assert.match(source, /TEMPORARY_JONGNO_ORIGIN\s*=\s*Object\.freeze/);
assert.match(source, /latitude:\s*37\.5716/);
assert.match(source, /longitude:\s*126\.9769/);
assert.match(source, /const location = TEMPORARY_JONGNO_ORIGIN/);
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd FE && node --test src/utils/routeComparison.test.js
```

Expected: missing temporary-origin source contract assertion fails.

- [ ] **Step 3: Implement the single-file temporary override**

Add the frozen constant near the route constants. In `MapHome`, replace the `useCurrentLocation` destructuring with:

```js
const location = TEMPORARY_JONGNO_ORIGIN;
const locationStatus = 'ready';
const locationErrorCode = null;
const locate = useCallback(() => Promise.resolve(TEMPORARY_JONGNO_ORIGIN), []);
```

Remove the now-unused `useCurrentLocation` import. Keep all route request, map marker, retry callback, and close behavior unchanged. Change the ready status copy to `광화문 인근을 출발지로 사용 중이에요`.

- [ ] **Step 4: Run frontend verification**

```bash
cd FE && node --test src/utils/routeComparison.test.js
cd FE && npm test
cd FE && npm run build
```

Expected: focused/full tests pass and production build succeeds.

- [ ] **Step 5: Commit only the focused hunks**

```bash
git diff --cached --check
git commit -m "feat: temporarily fix route origin to Jongno"
```
