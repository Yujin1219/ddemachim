# Place Route Comparison Implementation Plan


**Goal:** 메인 지도에서 장소를 선택하면 현재 위치 기준 도보·최단 대중교통·택시 예상 시간과 경로를 보여주고, 택시 탭에서 카카오 T로 이동하게 한다.

**Architecture:** 백엔드의 새 `domain.route` 경계가 TMAP 도보·대중교통·자동차 API를 병렬 호출하고 공급자 응답을 공통 경로 DTO로 정규화한다. 프런트엔드는 한 번 조회한 현재 위치를 공유하고, 선택 장소가 바뀔 때 경로 비교 요청을 취소·재발행하며, 선택 모드의 정규화된 GeoJSON 선을 기존 VWorld 지도 레이어에 그린다.

**Tech Stack:** Java 21, Spring Boot 4.1, Spring `RestClient`, Caffeine, JUnit 5/MockMvc/MockRestServiceServer, React, Vite, OpenLayers 10, Node test runner

## Global Constraints

- 공개 경로는 정확히 `POST /api/routes/compare`이고 기존 `ApiResponse<T>` 봉투를 사용한다.
- 요청은 `origin`과 `destination`의 `latitude`, `longitude`만 받으며 장소명이나 사용자 식별자는 서버에 전송하지 않는다.
- 응답 모드는 `WALK`, `TRANSIT`, `TAXI` 순서이고 상태는 `AVAILABLE` 또는 `UNAVAILABLE`이다.
- 대중교통은 응답 후보 중 `totalTime`이 가장 작은 한 경로만 반환한다.
- 한 모드라도 성공하면 HTTP 200으로 세 모드 상태를 모두 반환하고, 모두 실패하면 HTTP 502, TMAP 설정이 전부 없으면 HTTP 503이다.
- 현재 위치는 `enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 30000`으로 한 번 조회하고 브라우저 메모리에만 둔다.
- 정밀 위치, 공급자 원문 오류, `TMAP_APP_KEY`는 로그·오류 응답·저장소에 남기지 않는다.
- TMAP 결과 캐시는 좌표 소수점 넷째 자리 기준, 최대 2분, 메모리 전용, 최대 1,000개다.
- 카카오 T 버튼은 실제 배차 완료가 아니라 외부 앱 핸드오프이며 `카카오 T로 호출` 문구와 앱 내부 확인 안내를 함께 보여준다.
- 기존 `코스에 담기`, `카카오맵에서 보기`, 내부 장소 상세 이동을 보존한다.
- 현재 작업트리의 요청 외 변경을 되돌리거나 덮어쓰지 않는다. 기존에 수정된 통합 파일은 구현 전 스냅샷과 비교해 이번 기능 변경만 리뷰한다.
- 새 동작은 테스트가 먼저 실패하는 것을 확인한 뒤 최소 구현으로 통과시킨다.
- 기준선: FE 테스트 12개와 FE 빌드는 통과한다. BE 전체 테스트는 기존 상태에서 99개 중 8개가 실패하므로 새 route 테스트와 `compileJava`를 독립 통과 기준으로 삼고 전체 테스트의 기존 실패 수가 늘지 않는지도 마지막에 확인한다.

---

### Task 1: TMAP 공급자 어댑터와 공통 경로 모델

**Files:**
- Create: `BE/src/main/java/com/ddemachim/server/global/properties/TmapProperties.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/enums/RouteMode.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/enums/RouteStatus.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/enums/RouteUnavailableReason.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/dto/RouteComparisonRequest.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/dto/RouteComparisonResponse.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/service/RouteProviderClient.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/service/TmapRouteClient.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/exception/RouteProviderException.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/route/service/TmapRouteClientTest.java`

**Interfaces:**
- Consumes: TMAP `appKey` header and WGS84 coordinates.
- Produces: `RouteProviderClient#findWalking`, `findTransit`, `findTaxi`, each returning a normalized `RouteComparisonResponse.RouteOption`.
- Produces: `RouteComparisonRequest.Coordinate(double latitude, double longitude)`.
- Produces: `RouteComparisonResponse.RouteOption(mode, status, durationSeconds, distanceMeters, fareWon, transferCount, walkDistanceMeters, unavailableReason, legs)`.
- Produces: each `RouteLeg` contains `mode`, nullable `routeName`, `durationSeconds`, `distanceMeters`, and nullable GeoJSON `LineStringGeometry` whose coordinate order is `[longitude, latitude]`.

- [ ] **Step 1: Write failing provider contract tests**

Create three successful fixtures and explicit failure cases. The walking and taxi fixtures use TMAP FeatureCollection properties; transit contains two itineraries so the test proves the minimum `totalTime` is selected.

```java
@Test
void walking_normalizesSummaryAndLineString() {
    RouteOption route = client.findWalking(new Coordinate(37.5665, 126.9780), new Coordinate(37.5559, 126.9723));

    assertThat(route.mode()).isEqualTo(RouteMode.WALK);
    assertThat(route.durationSeconds()).isEqualTo(840);
    assertThat(route.distanceMeters()).isEqualTo(920);
    assertThat(route.legs().getFirst().geometry().coordinates().getFirst())
            .containsExactly(126.9780, 37.5665);
}

@Test
void transit_selectsFastestItineraryAndMapsTransferFareAndLegs() {
    RouteOption route = client.findTransit(ORIGIN, DESTINATION);

    assertThat(route.durationSeconds()).isEqualTo(1_320);
    assertThat(route.transferCount()).isEqualTo(1);
    assertThat(route.fareWon()).isEqualTo(1_500);
    assertThat(route.legs()).extracting(RouteLeg::mode)
            .containsExactly(RouteMode.WALK, RouteMode.TRANSIT, RouteMode.WALK);
}

@Test
void taxi_mapsEstimatedFareWithoutConfusingTotalFare() {
    RouteOption route = client.findTaxi(ORIGIN, DESTINATION);

    assertThat(route.durationSeconds()).isEqualTo(610);
    assertThat(route.fareWon()).isEqualTo(8_700);
}
```

Also assert exact paths and request contracts:

```java
server.expect(requestTo(containsString("/tmap/routes/pedestrian?version=1")))
      .andExpect(header("appKey", "test-key"));
server.expect(requestTo(containsString("/transit/routes")));
server.expect(requestTo(containsString("/tmap/routes?version=1")));
```

Add cases for blank key → `NOT_CONFIGURED`, empty itineraries → `NO_ROUTE`, malformed coordinates/geometry → `PROVIDER_UNAVAILABLE`, and an upstream timeout/error → a safe typed provider exception.

- [ ] **Step 2: Run the provider test and verify RED**

Run:

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.TmapRouteClientTest'
```

Expected: compilation fails because the route DTOs and `TmapRouteClient` do not exist.

- [ ] **Step 3: Implement the common model and properties**

Use validated records for the request and immutable records for the response.

```java
public record RouteComparisonRequest(
        @NotNull @Valid Coordinate origin,
        @NotNull @Valid Coordinate destination) {
    public record Coordinate(
            @DecimalMin("-90.0") @DecimalMax("90.0") double latitude,
            @DecimalMin("-180.0") @DecimalMax("180.0") double longitude) {}
}
```

Use these exact enum values:

```java
public enum RouteMode { WALK, TRANSIT, TAXI }
public enum RouteStatus { AVAILABLE, UNAVAILABLE }
public enum RouteUnavailableReason { NO_ROUTE, PROVIDER_UNAVAILABLE, NOT_CONFIGURED, TIMEOUT }
```

`TmapProperties` uses prefix `ddemachim.tmap`, defaults `baseUrl` to `https://apis.openapi.sk.com`, `appKey` to blank, `connectTimeout` to 2 seconds, `readTimeout` to 4 seconds, `cacheTtl` to 2 minutes, and `cacheMaximumSize` to 1,000.

- [ ] **Step 4: Implement the TMAP client minimally**

Build a Spring `RestClient` with a JDK request factory and the configured timeouts. Send these bodies exactly:

```java
Map.of(
    "startX", origin.longitude(), "startY", origin.latitude(),
    "endX", destination.longitude(), "endY", destination.latitude(),
    "startName", "현재 위치", "endName", "선택 장소"
)
```

Transit adds `count: 1`, `lang: 0`, `format: "json"`; taxi adds `reqCoordType: "WGS84GEO"`, `resCoordType: "WGS84GEO"`, `searchOption: "0"`. Parse with `JsonNode`, never expose the raw tree, concatenate valid line strings in response order, and convert the transit `passShape.linestring` text (`"lng,lat lng,lat"`) to GeoJSON coordinates. An absent route becomes `RouteProviderException(NO_ROUTE)`; network and malformed response failures become `PROVIDER_UNAVAILABLE`; socket/read timeout becomes `TIMEOUT`.

- [ ] **Step 5: Run provider tests and backend compilation**

Run:

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.TmapRouteClientTest'
sh ./gradlew compileJava
```

Expected: all new provider tests pass and compilation succeeds.

- [ ] **Step 6: Commit only the new provider boundary**

```bash
git add BE/src/main/java/com/ddemachim/server/global/properties/TmapProperties.java \
  BE/src/main/java/com/ddemachim/server/domain/route \
  BE/src/test/java/com/ddemachim/server/domain/route/service/TmapRouteClientTest.java
git commit -m "feat: add TMAP route provider adapter"
```

### Task 2: 경로 비교 서비스, 캐시, 공개 API

**Files:**
- Modify: `BE/build.gradle`
- Modify: `BE/src/main/resources/application.yml`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/config/RouteExecutionConfig.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/service/RouteComparisonService.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/controller/RouteController.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/exception/RouteException.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/exception/RouteErrorStatus.java`
- Create: `BE/src/main/java/com/ddemachim/server/domain/route/exception/RouteSuccessStatus.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/route/service/RouteComparisonServiceTest.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/route/controller/RouteControllerTest.java`

**Interfaces:**
- Consumes: `RouteProviderClient` from Task 1.
- Produces: `RouteComparisonService#compare(RouteComparisonRequest)`.
- Produces: HTTP `POST /api/routes/compare` with success code `ROUTE2001` and message `경로 비교 조회에 성공했습니다.`.
- Produces: errors `ROUTE4001`, `ROUTE5021`, `ROUTE5031` with safe Korean messages.

- [ ] **Step 1: Write failing service tests**

Use a controllable fake `RouteProviderClient` and a direct executor. Cover fixed result ordering, partial success, all failed, all unconfigured, and rounded cache reuse.

```java
@Test
void compare_keepsWalkTransitTaxiOrderWhenOneProviderFails() {
    provider.transitFailure = new RouteProviderException(RouteUnavailableReason.NO_ROUTE);

    RouteComparisonResponse response = service.compare(request());

    assertThat(response.routes()).extracting(RouteOption::mode)
            .containsExactly(RouteMode.WALK, RouteMode.TRANSIT, RouteMode.TAXI);
    assertThat(response.routes().get(1).status()).isEqualTo(RouteStatus.UNAVAILABLE);
    assertThat(response.routes().get(1).unavailableReason()).isEqualTo(RouteUnavailableReason.NO_ROUTE);
}

@Test
void compare_reusesTwoMinuteCacheForCoordinatesInSameFourDecimalCell() {
    service.compare(request(37.56651, 126.97801, 37.55591, 126.97231));
    service.compare(request(37.56654, 126.97804, 37.55594, 126.97234));

    assertThat(provider.totalCalls()).isEqualTo(3);
}
```

- [ ] **Step 2: Run service tests and verify RED**

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.RouteComparisonServiceTest'
```

Expected: compilation fails because the service and route API exceptions do not exist.

- [ ] **Step 3: Add Caffeine and implement orchestration**

Add:

```gradle
implementation 'com.github.ben-manes.caffeine:caffeine'
```

Create a named executor bean with exactly three threads and Spring-managed shutdown. `RouteComparisonService` starts all three calls with `CompletableFuture.supplyAsync`, converts each provider failure to an unavailable `RouteOption`, waits for all three, then returns `List.of(walk, transit, taxi)`. The cache key rounds all four coordinates with `BigDecimal.setScale(4, RoundingMode.HALF_UP)`. Use Caffeine `maximumSize(1000)` and `expireAfterWrite(Duration.ofMinutes(2))` through configured property values.

Build every successful `RouteComparisonResponse` with `Instant.now()` as `generatedAt`; inject a `Clock` into the test-only constructor so the service test asserts a deterministic instant without changing production time.

If every option is unavailable, throw `RouteException(RouteErrorStatus.TMAP_NOT_CONFIGURED)` only when all reasons are `NOT_CONFIGURED`; otherwise throw `RouteException(RouteErrorStatus.ALL_ROUTES_UNAVAILABLE)`.

- [ ] **Step 4: Write failing controller validation tests**

```java
@Test
void compare_wrapsTheNormalizedResponse() throws Exception {
    mockMvc.perform(post("/api/routes/compare")
            .contentType(MediaType.APPLICATION_JSON)
            .content(validRequestJson()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.code").value("ROUTE2001"))
        .andExpect(jsonPath("$.result.routes[0].mode").value("WALK"));
}

@Test
void compare_rejectsOutOfRangeCoordinatesBeforeCallingService() throws Exception {
    mockMvc.perform(post("/api/routes/compare")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""{"origin":{"latitude":91,"longitude":126.9},"destination":{"latitude":37.5,"longitude":127}}"""))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.isSuccess").value(false));

    verifyNoInteractions(service);
}
```

- [ ] **Step 5: Run controller tests and verify RED**

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.controller.RouteControllerTest'
```

Expected: compilation fails because `RouteController` does not exist.

- [ ] **Step 6: Implement controller, success/error codes, and configuration**

```java
@PostMapping("/compare")
public ApiResponse<RouteComparisonResponse> compare(@Valid @RequestBody RouteComparisonRequest request) {
    return ApiResponse.of(RouteSuccessStatus.ROUTE_COMPARISON_SUCCESS, routeComparisonService.compare(request));
}
```

Use `@RequestMapping("/api/routes")`, OpenAPI `@Tag` and `@Operation`, and the existing global `ExceptionAdvice`. Add only environment-backed configuration:

```yaml
ddemachim:
  tmap:
    base-url: ${TMAP_BASE_URL:https://apis.openapi.sk.com}
    app-key: ${TMAP_APP_KEY:}
    connect-timeout: 2s
    read-timeout: 4s
    cache-ttl: 2m
    cache-maximum-size: 1000
```

- [ ] **Step 7: Run focused backend verification**

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.*'
sh ./gradlew compileJava
```

Expected: route tests pass and compilation succeeds.

- [ ] **Step 8: Commit the backend API**

```bash
git add BE/build.gradle BE/src/main/resources/application.yml \
  BE/src/main/java/com/ddemachim/server/domain/route \
  BE/src/test/java/com/ddemachim/server/domain/route
git commit -m "feat: expose route comparison API"
```

### Task 3: 프런트 경로 도메인, 위치 조회, API 클라이언트

**Files:**
- Modify: `FE/src/api/client.js`
- Modify: `FE/src/api/client.test.js`
- Create: `FE/src/utils/routeComparison.js`
- Test: `FE/src/utils/routeComparison.test.js`
- Create: `FE/src/hooks/useCurrentLocation.js`
- Create: `FE/src/hooks/useRouteComparison.js`

**Interfaces:**
- Consumes: Task 2 response contract.
- Produces: `fetchRouteComparison({ origin, destination, signal })`.
- Produces: `requestRoutePosition({ geolocation, signal })` with typed error codes `UNSUPPORTED`, `DENIED`, `TIMEOUT`, `UNAVAILABLE`.
- Produces: formatting and selection helpers used by the panel.
- Produces: `useCurrentLocation({ auto })` and `useRouteComparison({ origin, destination })`.

- [ ] **Step 1: Write failing pure-domain and client tests**

```js
test('fetchRouteComparison sends only origin and destination and preserves abort', async () => {
  await client.fetchRouteComparison({
    origin: { latitude: 37.5665, longitude: 126.978 },
    destination: { latitude: 37.5559, longitude: 126.9723 },
    signal: controller.signal,
  });

  assert.equal(request.url, '/api/routes/compare');
  assert.deepEqual(JSON.parse(request.options.body), {
    origin: { latitude: 37.5665, longitude: 126.978 },
    destination: { latitude: 37.5559, longitude: 126.9723 },
  });
  assert.equal(request.options.signal, controller.signal);
});

test('requestRoutePosition uses the approved one-shot options', async () => {
  const location = await requestRoutePosition({ geolocation });
  assert.deepEqual(location, { latitude: 37.5665, longitude: 126.978 });
  assert.deepEqual(receivedOptions, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000,
  });
});

test('buildKakaoTaxiHref uses destination coordinates only on mobile', () => {
  assert.equal(
    buildKakaoTaxiHref({ latitude: 37.5559, longitude: 126.9723 }, { mobile: true }),
    'https://t.kakao.com/launch?type=taxi&dest_lat=37.5559&dest_lng=126.9723',
  );
});
```

Also test duration rounding (`840 → 14분`, `3660 → 1시간 1분`), distance formatting, unavailable labels, invalid coordinates, less-than-30m destination detection, desktop Kakao Mobility fallback, and ignoring stale geolocation callbacks after abort.

- [ ] **Step 2: Run FE tests and verify RED**

```bash
cd FE
npm test
```

Expected: the new imports/functions fail because they do not exist.

- [ ] **Step 3: Implement route helpers and API call**

`fetchRouteComparison` calls `post('/routes/compare', payload, { signal })`. `routeComparison.js` implements these exact behaviors:

```js
export const ROUTE_MODES = ['WALK', 'TRANSIT', 'TAXI'];

export function normalizeRouteCoordinate(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function distanceBetweenMeters(originValue, destinationValue) {
  const origin = normalizeRouteCoordinate(originValue);
  const destination = normalizeRouteCoordinate(destinationValue);
  if (!origin || !destination) return Number.POSITIVE_INFINITY;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatRouteDuration(secondsValue) {
  const seconds = Number(secondsValue);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

export function formatRouteDistance(metersValue) {
  const meters = Number(metersValue);
  if (!Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1_000) return `${Math.round(meters)}m`;
  return `${Number((meters / 1_000).toFixed(1))}km`;
}

export function formatRouteFare(wonValue) {
  const won = Number(wonValue);
  return Number.isFinite(won) && won >= 0 ? `${Math.round(won).toLocaleString('ko-KR')}원` : null;
}

export function routeOptionByMode(response, mode) {
  return response?.routes?.find((route) => route?.mode === mode) ?? null;
}

export function buildKakaoTaxiHref(destinationValue, { mobile, template } = {}) {
  const destination = normalizeRouteCoordinate(destinationValue);
  if (!destination) return null;
  const isMobile = mobile ?? /Android|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || '');
  if (!isMobile) return 'https://www.kakaomobility.com/service-kakaot';
  const source = template || import.meta.env?.VITE_KAKAO_T_TAXI_URL_TEMPLATE
    || 'https://t.kakao.com/launch?type=taxi&dest_lat={lat}&dest_lng={lng}';
  return source
    .replaceAll('{lat}', encodeURIComponent(destination.latitude))
    .replaceAll('{lng}', encodeURIComponent(destination.longitude));
}
```

`requestRoutePosition` rejects with an `AbortError` on cancellation and a typed `RouteLocationError` for browser failures; it never persists the coordinate. Map browser codes `1 → DENIED`, `2 → UNAVAILABLE`, `3 → TIMEOUT`; absent Geolocation maps to `UNSUPPORTED`. Register a one-time abort listener, remove it on either geolocation callback, ignore callbacks after settlement, and pass the exact approved position options. `buildKakaoTaxiHref` honors `import.meta.env.VITE_KAKAO_T_TAXI_URL_TEMPLATE` when supplied and otherwise uses the exact mobile URL in the test. Desktop falls back to `https://www.kakaomobility.com/service-kakaot`.

- [ ] **Step 4: Implement the two hooks**

`useCurrentLocation` returns:

```js
{
  location, status, errorCode,
  locate, clear,
}
```

`status` is one of `idle`, `locating`, `ready`, `error`. Concurrent `locate()` calls share the active promise; `clear()` invalidates late callbacks. With `auto: true`, the hook starts once for the current selection.

`useRouteComparison` returns:

```js
{
  data, status, error, retry,
}
```

`status` is `idle`, `loading`, `ready`, `error`. It aborts the previous HTTP request whenever either coordinate changes or on unmount, suppresses `AbortError`, and does not request when origin/destination is invalid or within 30m.

- [ ] **Step 5: Run FE unit tests**

```bash
cd FE
npm test
```

Expected: all existing and new tests pass.

- [ ] **Step 6: Commit new domain files and tests without absorbing prior integration edits**

Stage the new `routeComparison` and hook files. Stage only the new `fetchRouteComparison` test/function hunks from the already modified client files; if clean hunk separation is not possible, leave those two files unstaged for the final integration checkpoint.

```bash
git add FE/src/utils/routeComparison.js FE/src/utils/routeComparison.test.js FE/src/hooks
git commit -m "feat: add route comparison frontend state"
```

### Task 4: 선택 장소 패널과 VWorld 경로선 통합

**Files:**
- Create: `FE/src/components/SelectedPlaceRoutePanel.jsx`
- Modify: `FE/src/components/VWorldMap.jsx`
- Modify: `FE/src/pages/ProductFlow.jsx`
- Modify: `FE/src/styles.css`
- Modify: `FE/src/vworld-map.css`

**Interfaces:**
- Consumes: Task 3 hooks/helpers and Task 2 API response.
- Produces: selected-place sheet with WALK/TRANSIT/TAXI mode buttons, detail, retry, and Kakao T CTA.
- Produces: `VWorldMap` props `routeLegs`, `routeMode`, `routeFitKey`.
- Preserves: existing Kakao and internal place secondary actions.

- [ ] **Step 1: Capture dirty-file baselines**

Before edits, copy the four existing integration files into this plan's ignored SDD workspace. These snapshots are the review base because the files already contain user changes.

```bash
cp FE/src/components/VWorldMap.jsx "$SDD_WORKSPACE/VWorldMap.before.jsx"
cp FE/src/pages/ProductFlow.jsx "$SDD_WORKSPACE/ProductFlow.before.jsx"
cp FE/src/styles.css "$SDD_WORKSPACE/styles.before.css"
cp FE/src/vworld-map.css "$SDD_WORKSPACE/vworld-map.before.css"
```

- [ ] **Step 2: Build `SelectedPlaceRoutePanel` against the pure helpers**

Render `현재 위치에서`, then three real buttons in `WALK`, `TRANSIT`, `TAXI` order. Each button uses `aria-pressed`; the status area uses `aria-live="polite"`. Use these labels and details:

```js
const labels = { WALK: '도보', TRANSIT: '대중교통', TAXI: '택시' };
```

- locating: `현재 위치 확인 중…`
- loading: `경로 계산 중…`
- denied/error: `현재 위치를 확인하지 못했어요` with `다시 시도`
- origin and destination within 30m: `이미 목적지 근처예요`
- transit unavailable: `대중교통 경로 없음`
- taxi fare: `예상 8,700원`
- taxi note: `앱에서 출발지와 목적지를 확인한 뒤 호출을 완료해주세요.`

Taxi renders an anchor styled as the yellow primary action, text `카카오 T로 호출`, and the href from `buildKakaoTaxiHref`.

- [ ] **Step 3: Add the map route vector layer**

Create one `VectorLayer` above congestion and below HTML place overlays. When `routeLegs` changes, clear the source, read every valid `LineString` as EPSG:4326 → EPSG:3857, assign `mode` and `routeName`, and add it. Use mode styles:

```js
const ROUTE_STYLES = {
  WALK: new Style({ stroke: new Stroke({ color: '#2563eb', width: 5, lineDash: [3, 8] }) }),
  TRANSIT: new Style({ stroke: new Stroke({ color: '#0f766e', width: 6 }) }),
  TAXI: new Style({ stroke: new Stroke({ color: '#f2b705', width: 6 }) }),
};
```

Fit the combined route extent only when `routeFitKey` changes; use padding that keeps the bottom sheet from covering the destination. A tab change updates the line but does not refit.

- [ ] **Step 4: Integrate selected destination and shared location into `MapHome`**

Replace immutable `searchTarget` display state with `selectedPlace`, initially `readKakaoMapTarget()`. External and internal marker clicks both set `selectedPlace`, expand the sheet, and start the shared one-shot location flow. Do not navigate directly on the first internal marker click.

Pass these props to the map:

```jsx
routeLegs={selectedRoute?.status === 'AVAILABLE' ? selectedRoute.legs : []}
routeMode={activeRouteMode}
routeFitKey={selectedPlace ? `${selectedPlace.externalSource || 'INTERNAL'}:${selectedPlace.id}` : ''}
userLocation={location ? [location.longitude, location.latitude] : null}
```

Keep the place card above `SelectedPlaceRoutePanel`. For Kakao places keep `KakaoPlaceActions`; for internal places show `PlaceBasketAction` and a secondary `장소 상세` button. The map location button calls the same hook rather than creating a second watcher. Closing/clearing selection aborts old route work and removes the line.

- [ ] **Step 5: Apply responsive, accessible panel styling**

The selected sheet sits above the 72px bottom navigation, has a bounded scroll region, and does not overflow at 320px. Tabs stay three equal columns and every action is at least 44px high. Add explicit focus-visible styles, `prefers-reduced-motion` handling, loading skeletons, and an amber Kakao T action without gradients. Preserve the existing neutral place card and secondary action row hierarchy.

- [ ] **Step 6: Run frontend automated verification**

```bash
cd FE
npm test
npm run build
```

Expected: all unit tests pass. The production build succeeds with only the pre-existing chunk-size warning.

- [ ] **Step 7: Run visual detector and browser scenarios**

Run the Impeccable detector against modified UI files, then inspect the live page at 320px, 390px, and desktop width. Verify:

```text
search result → current location → WALK default → TRANSIT tab → TAXI tab → Kakao T href
internal marker → same panel → 장소 상세
location denied → retry + existing place actions still enabled
partial provider response → successful tabs remain usable
new destination during load → old result never appears
```

Expected: no horizontal overflow, no obscured action under bottom navigation, route line changes with the active tab, and no new console errors.

- [ ] **Step 8: Review this task from snapshots**

Generate focused diffs from each `*.before.*` snapshot to the corresponding current file and include the new component in the task review. Do not stage or commit unrelated pre-existing hunks in the four dirty integration files.

### Task 5: Cross-domain verification and operational handoff

**Files:**
- Modify only if required by verified defects from this task: files introduced or changed in Tasks 1-4.

**Interfaces:**
- Consumes: completed backend API and frontend integration.
- Produces: evidence that route tests, FE tests/build, error handling, and configuration contract are coherent.

- [ ] **Step 1: Verify backend route slice and compile**

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.*'
sh ./gradlew compileJava
```

Expected: route slice and compilation pass.

- [ ] **Step 2: Compare full backend baseline**

```bash
cd BE
sh ./gradlew test
```

Expected: no new route failure. If the existing unrelated suite still fails, record the exact count and confirm it does not exceed the 8 baseline failures.

- [ ] **Step 3: Verify frontend again**

```bash
cd FE
npm test
npm run build
```

Expected: all tests pass and build succeeds with no new warning category.

- [ ] **Step 4: Check secrets, markers, and whitespace**

```bash
rg -n "TMAP_APP_KEY|appKey.*[A-Za-z0-9]{20,}|^(<<<<<<<|=======|>>>>>>>)" BE/src FE/src
git diff --check
```

Expected: only the environment-variable name/config binding appears, no credential-like literal or conflict marker appears, and `git diff --check` reports nothing.

- [ ] **Step 5: Document runtime requirement in the final handoff**

Report that production needs `TMAP_APP_KEY` with pedestrian, transit, and automobile product access. State clearly that Kakao T is a best-effort app handoff and actual dispatch/payment completes inside Kakao T.
