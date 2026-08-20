# ODsay Transit Route Integration Implementation Plan


**Goal:** 홈에서 장소를 선택하면 현재 위치 기준 대중교통 최단 예상시간을 ODsay 단일 호출로 계산하고, 기존 장소 행동 행을 이동수단 탭으로 교체하며 ODsay 실패 시 대중교통 탭을 숨긴다.

**Architecture:** 공개 `POST /api/routes/compare` 계약은 유지하고 내부 공급자 포트를 `RoadRouteProviderClient`와 `TransitRouteProviderClient`로 분리한다. TMAP은 도보·택시, ODsay `searchPubTransPathT`는 대중교통만 담당한다. 프런트엔드는 계산 완료 후 `TRANSIT`이 `AVAILABLE`일 때만 대중교통 탭을 표시하고, 선택 장소 카드 아래에서 기존 장소 행동 행 대신 경로 탭 블록 하나만 렌더링한다.

**Tech Stack:** Java 21, Spring Boot `RestClient`, Jackson, JUnit 5, AssertJ, MockRestServiceServer, React 19, Node test runner, OpenLayers, CSS Grid.

## Global Constraints

- ODsay는 좌표쌍별 캐시 미적중 시 `GET /v1/api/searchPubTransPathT`를 정확히 한 번만 호출하고 `/loadLane`은 호출하지 않는다.
- 공개 `/api/routes/compare` 요청·응답 필드와 `WALK`, `TRANSIT`, `TAXI` 순서를 바꾸지 않는다.
- `ODSAY_API_KEY`는 백엔드 환경 변수로만 사용하고 응답·로그·프런트엔드에 노출하지 않는다.
- ODsay 구간의 `geometry`는 정상적으로 `null`이며, 대중교통 탭 선택 시 기존 TMAP 경로선을 제거한다.
- ODsay의 `totalTime`과 `sectionTime`은 분에서 초로 변환하고 가장 작은 유효 `totalTime` 후보를 선택한다.
- ODsay 실패 또는 경로 없음이면 대중교통 탭 자체를 숨기며 도보·택시는 기존 오류·재시도 동작을 유지한다.
- 장소 선택 후 경로 UI는 기존 장소 행동 행을 교체하며 그 위에 중복 패널로 추가하지 않는다.
- 앱 최하단 메인 내비게이션과 장소 미선택 홈 UI는 변경하지 않는다.
- 기존 dirty worktree의 무관한 변경을 보존하고 `.env`, dump, 비밀값을 읽지 않는다.

---

## File Map

- Create `BE/src/main/java/com/ddemachim/server/domain/route/service/RoadRouteProviderClient.java`: 도보·택시 공급자 포트.
- Create `BE/src/main/java/com/ddemachim/server/domain/route/service/TransitRouteProviderClient.java`: 대중교통 공급자 포트.
- Delete `BE/src/main/java/com/ddemachim/server/domain/route/service/RouteProviderClient.java`: 공급자 책임이 섞인 기존 포트.
- Modify `BE/src/main/java/com/ddemachim/server/domain/route/service/TmapRouteClient.java`: 도보·택시만 구현하고 TMAP 대중교통 파싱 제거.
- Create `BE/src/main/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClient.java`: ODsay 단일 호출, 최단 후보 선택과 정규화.
- Create `BE/src/main/java/com/ddemachim/server/global/properties/OdsayProperties.java`: ODsay URL·키·타임아웃 설정.
- Modify `BE/src/main/java/com/ddemachim/server/domain/route/service/RouteComparisonService.java`: 두 공급자를 병렬 조합.
- Modify `BE/src/main/resources/application.yml`: `ddemachim.odsay` 설정 추가.
- Create `BE/src/test/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClientTest.java`: ODsay 공급자 계약 테스트.
- Modify `BE/src/test/java/com/ddemachim/server/domain/route/service/TmapRouteClientTest.java`: TMAP 도보·택시 전용 계약 테스트.
- Modify `BE/src/test/java/com/ddemachim/server/domain/route/service/RouteComparisonServiceTest.java`: 분리 공급자와 부분 성공·캐시 테스트.
- Modify `FE/src/components/SelectedPlaceRoutePanel.js`: 대중교통 탭 조건부 표시와 선택 자동 전환.
- Modify `FE/src/components/SelectedPlaceRoutePanel.test.js`: 탭 숨김·전환·레이아웃 계약 테스트.
- Modify `FE/src/pages/ProductFlow.jsx`: 장소 선택 시 기존 행동 행 대신 경로 블록만 렌더링.
- Modify `FE/src/styles.css`: 2개·3개 탭 자동 그리드와 교체 영역 스타일.

---

### Task 1: ODsay Transit Provider

**Files:**
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/service/TransitRouteProviderClient.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClient.java`
- Create: `BE/src/main/java/com/ddemachim/server/global/properties/OdsayProperties.java`
- Modify: `BE/src/main/resources/application.yml`
- Test: `BE/src/test/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClientTest.java`

**Interfaces:**
- Consumes: `RouteComparisonRequest.Coordinate`, `RouteComparisonResponse.RouteOption`, `RouteProviderException`.
- Produces: `TransitRouteProviderClient.findTransit(Coordinate origin, Coordinate destination): RouteOption` and Spring component `OdsayTransitRouteClient`.

- [ ] **Step 1: Write failing provider contract tests**

Create tests using `MockRestServiceServer.bindTo(RestClient.Builder)` that assert the query and mapping:

```java
server.expect(requestTo(allOf(
        containsString("/v1/api/searchPubTransPathT"),
        containsString("SX=126.978"),
        containsString("SY=37.5665"),
        containsString("EX=126.9723"),
        containsString("EY=37.5559"),
        containsString("OPT=0"),
        containsString("SearchType=0"),
        containsString("SearchPathType=0"),
        containsString("apiKey=test-key"))))
    .andRespond(withSuccess(TRANSIT_RESPONSE, MediaType.APPLICATION_JSON));

RouteOption route = client.findTransit(ORIGIN, DESTINATION);

assertThat(route.mode()).isEqualTo(RouteMode.TRANSIT);
assertThat(route.durationSeconds()).isEqualTo(1_320);
assertThat(route.distanceMeters()).isEqualTo(4_200);
assertThat(route.fareWon()).isEqualTo(1_500);
assertThat(route.transferCount()).isEqualTo(1);
assertThat(route.walkDistanceMeters()).isEqualTo(1_000);
assertThat(route.legs()).extracting(RouteLeg::mode)
        .containsExactly(RouteMode.WALK, RouteMode.TRANSIT, RouteMode.WALK);
assertThat(route.legs()).allMatch(leg -> leg.geometry() == null);
```

The fixture must contain a slower path before a 22-minute path, with `subPath` traffic types `3, 2, 3` and bus lane `busNo: "종로01"`. Add tests for a subway lane name, first-candidate tie handling, blank key, result path missing/empty, ODsay no-result error code `-99`, malformed numeric fields, HTTP error, and `SocketTimeoutException`.

- [ ] **Step 2: Run the ODsay test to verify RED**

Run:

```bash
cd BE && sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.OdsayTransitRouteClientTest'
```

Expected: compilation fails because `OdsayTransitRouteClient`, `OdsayProperties`, and `TransitRouteProviderClient` do not exist.

- [ ] **Step 3: Add the transit port and configuration**

Create the port:

```java
public interface TransitRouteProviderClient {
    RouteOption findTransit(Coordinate origin, Coordinate destination);
}
```

Create `OdsayProperties` with defaults `https://api.odsay.com`, blank key, 2-second connect timeout, 4-second read timeout, getters/setters, and `hasApiKey()` using `StringUtils.hasText`. Add:

```yaml
odsay:
  base-url: ${ODSAY_BASE_URL:https://api.odsay.com}
  api-key: ${ODSAY_API_KEY:}
  connect-timeout: 2s
  read-timeout: 4s
```

under `ddemachim` without replacing or reformatting unrelated `application.yml` sections.

- [ ] **Step 4: Implement one-call ODsay normalization**

Implement `OdsayTransitRouteClient implements TransitRouteProviderClient` with production and package-private test constructors matching the TMAP client pattern. Build one GET request with `uri(builder -> builder.path(PATH).queryParam(...).build())` and parse the response without retaining raw causes.

Select the candidate with the smallest non-negative `info.totalTime`, preserving the first on a tie. Use checked helpers so multiplication and double-to-int conversion cannot overflow:

```java
int durationSeconds = Math.multiplyExact(totalTimeMinutes, 60);
int distanceMeters = BigDecimal.valueOf(totalDistance)
        .setScale(0, RoundingMode.HALF_UP)
        .intValueExact();
```

Map `trafficType == 3` to `WALK`, `1` or `2` to `TRANSIT`, reject other values as provider unavailable, choose `lane[0].busNo` for buses and `lane[0].name` for subway, and construct every `RouteLeg` with `geometry = null`. Map known no-result response codes `3, 4, 5, 6, -98, -99` to `NO_ROUTE`; blank key to `NOT_CONFIGURED`; timeout chain to `TIMEOUT`; other invalid/HTTP failures to `PROVIDER_UNAVAILABLE`.

- [ ] **Step 5: Run provider tests and compile**

Run:

```bash
cd BE && sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.OdsayTransitRouteClientTest'
cd BE && sh ./gradlew compileJava
```

Expected: all ODsay tests pass and `compileJava` succeeds.

- [ ] **Step 6: Commit the provider**

```bash
git add BE/src/main/java/com/ddemachim/server/domain/route/service/TransitRouteProviderClient.java BE/src/main/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClient.java BE/src/main/java/com/ddemachim/server/global/properties/OdsayProperties.java BE/src/main/resources/application.yml BE/src/test/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClientTest.java
git commit -m "feat: add ODsay transit route provider"
```

---

### Task 2: Split TMAP Road Routes and Compose Providers

**Files:**
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/service/RoadRouteProviderClient.java`
- Delete: `BE/src/main/java/com/ddemachim/server/domain/route/service/RouteProviderClient.java`
- Modify: `BE/src/main/java/com/ddemachim/server/domain/route/service/TmapRouteClient.java`
- Modify: `BE/src/main/java/com/ddemachim/server/domain/route/service/RouteComparisonService.java`
- Modify: `BE/src/test/java/com/ddemachim/server/domain/route/service/TmapRouteClientTest.java`
- Modify: `BE/src/test/java/com/ddemachim/server/domain/route/service/RouteComparisonServiceTest.java`

**Interfaces:**
- Consumes: `TransitRouteProviderClient.findTransit(...)` from Task 1.
- Produces: `RoadRouteProviderClient.findWalking(...)`, `RoadRouteProviderClient.findTaxi(...)`; service keeps `compare(RouteComparisonRequest): RouteComparisonResponse` unchanged.

- [ ] **Step 1: Rewrite service tests for two explicit providers**

Replace the combined fake with `FakeRoadRouteProvider` and `FakeTransitRouteProvider`. Construct the service with both providers and assert:

```java
service = new RouteComparisonService(
        roadProvider,
        transitProvider,
        directExecutor,
        new TmapProperties(),
        fixedClock);
```

Keep fixed order, partial failure, all-failed, all-not-configured, 2-minute cache, and 1,000-entry cap assertions. Add a test where only transit is `NOT_CONFIGURED` and WALK/TAXI remain available, proving a successful comparison rather than HTTP-level failure.

- [ ] **Step 2: Run service tests to verify RED**

Run:

```bash
cd BE && sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.RouteComparisonServiceTest'
```

Expected: compilation fails because the two-provider constructor and road port do not exist.

- [ ] **Step 3: Narrow the TMAP provider**

Create:

```java
public interface RoadRouteProviderClient {
    RouteOption findWalking(Coordinate origin, Coordinate destination);
    RouteOption findTaxi(Coordinate origin, Coordinate destination);
}
```

Change `TmapRouteClient` to implement it. Remove the TMAP transit endpoint constant, `findTransit`, transit-only parsing helpers, and transit-only fixtures/tests. Preserve all walking/taxi validation, geometry, timeouts, fare, and key behavior. Delete the obsolete broad `RouteProviderClient`.

- [ ] **Step 4: Compose road and transit providers in the service**

Inject both ports:

```java
public RouteComparisonService(
        RoadRouteProviderClient roadRouteProviderClient,
        TransitRouteProviderClient transitRouteProviderClient,
        @Qualifier("routeComparisonExecutor") Executor executor,
        TmapProperties properties) { ... }
```

Dispatch WALK and TAXI through the road provider and TRANSIT through the transit provider. Preserve `safelyCall`, response order, partial failure normalization, cache key, TTL and size. Keep existing public error codes; all three `NOT_CONFIGURED` still maps to `TMAP_NOT_CONFIGURED` for response compatibility.

- [ ] **Step 5: Run focused backend suites**

Run:

```bash
cd BE && sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.TmapRouteClientTest' --tests 'com.ddemachim.server.domain.route.service.OdsayTransitRouteClientTest' --tests 'com.ddemachim.server.domain.route.service.RouteComparisonServiceTest' --tests 'com.ddemachim.server.domain.route.controller.RouteControllerTest'
cd BE && sh ./gradlew compileJava
```

Expected: route provider, service, controller tests and compilation pass.

- [ ] **Step 6: Commit provider composition**

```bash
git add BE/src/main/java/com/ddemachim/server/domain/route/service BE/src/test/java/com/ddemachim/server/domain/route/service
git commit -m "refactor: split road and transit route providers"
```

---

### Task 3: Replace Selected-Place Actions with Available Route Tabs

**Files:**
- Modify: `FE/src/components/SelectedPlaceRoutePanel.js`
- Modify: `FE/src/components/SelectedPlaceRoutePanel.test.js`
- Modify: `FE/src/pages/ProductFlow.jsx`
- Modify: `FE/src/styles.css`

**Interfaces:**
- Consumes: unchanged route response where `TRANSIT.status` can be `AVAILABLE` or `UNAVAILABLE`, and ODsay legs can have `geometry: null`.
- Produces: `visibleRouteModes(routeStatus, routeData): string[]` and `resolveAvailableRouteMode(activeMode, modes): string` as exported pure helpers for tests.

- [ ] **Step 1: Write failing pure component tests**

Add tests that lock these rules:

```js
assert.deepEqual(visibleRouteModes('ready', {
  routes: [
    { mode: 'WALK', status: 'AVAILABLE' },
    { mode: 'TRANSIT', status: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' },
    { mode: 'TAXI', status: 'AVAILABLE' },
  ],
}), ['WALK', 'TAXI']);

assert.equal(resolveAvailableRouteMode('TRANSIT', ['WALK', 'TAXI']), 'WALK');
assert.deepEqual(visibleRouteModes('loading', null), ['WALK', 'TRANSIT', 'TAXI']);
```

Also test that all four transit unavailable reasons hide only TRANSIT, while unavailable WALK/TAXI remain visible for their existing error/retry UI.

- [ ] **Step 2: Run component tests to verify RED**

Run:

```bash
cd FE && node --test src/components/SelectedPlaceRoutePanel.test.js
```

Expected: imports fail because `visibleRouteModes` and `resolveAvailableRouteMode` do not exist.

- [ ] **Step 3: Implement conditional tabs and safe selection**

Implement pure helpers:

```js
export function visibleRouteModes(routeStatus, routeData) {
  if (routeStatus !== 'ready') return ROUTE_MODES;
  const transit = routeOption(routeData, 'TRANSIT');
  return transit?.status === 'AVAILABLE'
    ? ROUTE_MODES
    : ROUTE_MODES.filter((mode) => mode !== 'TRANSIT');
}

export function resolveAvailableRouteMode(activeMode, modes) {
  return modes.includes(activeMode) ? activeMode : modes[0] || 'WALK';
}
```

Render tabs from `visibleModes`. Add an effect that calls `onModeChange(resolvedMode)` when the controlled active mode disappears. Use `resolvedMode` for details and status so a failed TRANSIT response never leaves stale transit detail visible.

- [ ] **Step 4: Replace the existing selected-place action row**

In `MapHome`, keep `SelectedPlaceRoutePanel` after the selected place card, but remove the selected-place branches that simultaneously render `KakaoPlaceActions` or `.map-internal-actions`. Keep the no-selection `map-live-link` branch. Do not delete the reusable action components because other screens may consume them.

The selected-place branch must have exactly one post-card block:

```jsx
{selectedPlace
  ? <SelectedPlaceRoutePanel {...routeProps} />
  : <button type="button" className="map-live-link" ...>...</button>}
```

Preserve the app bottom navigation and the internal place card/detail navigation outside this replacement scope.

- [ ] **Step 5: Make tab columns follow the visible count**

Change `.route-mode-tabs` from a fixed three-column declaration to:

```css
.route-mode-tabs {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
}
```

Remove only selected-place action-row spacing that becomes dead; preserve styles used elsewhere. Ensure the route panel does not add a second top-level card/background above the replacement row.

- [ ] **Step 6: Run frontend tests and build**

Run:

```bash
cd FE && node --test src/components/SelectedPlaceRoutePanel.test.js src/utils/routeComparison.test.js src/utils/routeGeometry.test.js
cd FE && npm test
cd FE && npm run build
```

Expected: focused and full tests pass; production build succeeds. Geometry-null ODsay legs are ignored without throwing.

- [ ] **Step 7: Commit frontend behavior without absorbing unrelated hunks**

Use an explicit patch or interactive staging to stage only this task's hunks from dirty shared files, then verify the staged diff:

```bash
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: show available route tabs for selected places"
```

---

### Task 4: Integrated Verification

**Files:**
- Verify only; change source only for defects exposed by these checks.

**Interfaces:**
- Consumes: completed backend and frontend tasks.
- Produces: evidence that provider calls, contracts, UI behavior, and builds are coherent.

- [ ] **Step 1: Run complete route backend verification**

```bash
cd BE && sh ./gradlew test --tests 'com.ddemachim.server.domain.route.*'
cd BE && sh ./gradlew compileJava
```

Expected: all route tests and compilation pass.

- [ ] **Step 2: Run complete frontend verification**

```bash
cd FE && npm test
cd FE && npm run build
```

Expected: all frontend tests pass and production build succeeds. Record an existing bundle-size warning separately rather than treating it as an ODsay regression.

- [ ] **Step 3: Inspect diff safety**

```bash
git diff --check
rg -n '^(<<<<<<<|=======|>>>>>>>)' BE FE docs/superpowers
git status --short
```

Expected: no whitespace errors or conflict markers. Confirm unrelated dirty files remain untouched and no `.env`, dump, key, raw provider body, or generated data is staged.

- [ ] **Step 4: Run local UI smoke checks**

At 320px and 390px widths verify: no selected place keeps the original home action; selected place shows one route block; successful ODsay shows three equal tabs; unavailable ODsay shows two equal tabs; switching from transit after a failed refresh falls back to walk; transit clears the previous road polyline; the bottom navigation remains fixed.

- [ ] **Step 5: Final commit only if verification required a focused fix**

If a defect was found, stage only its files/hunks and commit:

```bash
git diff --cached --check
git commit -m "fix: harden ODsay route integration"
```

If no defect was found, do not create an empty commit.
