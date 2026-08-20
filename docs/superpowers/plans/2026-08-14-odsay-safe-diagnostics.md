# ODsay Safe Diagnostics Implementation Plan


**Goal:** ODsay 호출 실패를 비밀정보 없이 서버 로그에서 구분하고 배열 형태의 ODsay 오류 응답을 정상 해석한다.

**Architecture:** `OdsayTransitRouteClient`의 외부 통신 및 응답 경계에서만 안전한 진단 분류를 SLF4J로 기록한다. 공개 route 응답과 `RouteUnavailableReason` 계약은 유지하고 API 키, URL, 좌표, 응답 원문은 기록하지 않는다.

**Tech Stack:** Java 21, Spring Boot 4.1, Spring `RestClient`, SLF4J, JUnit 5, AssertJ, Spring Boot output capture.

## Global Constraints

- 공개 API 응답 계약과 프론트엔드 코드는 변경하지 않는다.
- 로그에는 API 키, 키 일부/길이, URL, 쿼리, 좌표, ODsay 원문 응답 및 메시지를 기록하지 않는다.
- ODsay `error` 객체와 배열을 모두 지원한다.
- 기존 no-route 코드 `3`, `4`, `5`, `6`, `-98`, `-99`는 `NO_ROUTE`를 유지한다.
- HTTP, JSON, ODsay 코드, 결과 구조, timeout 실패를 안전한 분류로 구분한다.

---

### Task 1: Parse and Log Safe ODsay Failure Categories

**Files:**
- Modify: `BE/src/main/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClient.java`
- Test: `BE/src/test/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClientTest.java`

**Interfaces:**
- Consumes: ODsay JSON `error` as either an object or an array whose first item contains numeric/string `code`.
- Produces: unchanged `RouteProviderException.reason()` plus safe WARN messages containing only `provider=odsay operation=transit category=<CATEGORY>`.

- [x] **Step 1: Add failing array-error and log-redaction tests**

Add `OutputCaptureExtension` to the test class. Return `{"error":[{"code":"500","message":"[ApiKeyAuthFailed] secret-provider-message"}]}` and assert that `findTransit` throws `PROVIDER_UNAVAILABLE`. Assert captured output contains `provider=odsay operation=transit category=ODSAY_ERROR_500` and excludes the test key, coordinates, provider message, and request path.

- [x] **Step 2: Run the focused test to verify RED**

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.OdsayTransitRouteClientTest'
```

Expected: the diagnostic assertion fails because the current implementation emits no safe category log.

- [x] **Step 3: Implement array/object error extraction and safe logging**

Add a class logger and fixed-template helper:

```java
private static void logFailure(String category) {
    log.warn("provider=odsay operation=transit category={}", category);
}
```

Normalize `error` to the object itself or the first object in a non-empty array. Read only its numeric code. Log `ODSAY_ERROR_<code>` before mapping known no-route codes to `NO_ROUTE` and all others to `PROVIDER_UNAVAILABLE`. Never read or log `message`.

- [x] **Step 4: Add failing boundary-category tests**

Use output capture to assert malformed JSON logs `INVALID_JSON`, HTTP 5xx logs `HTTP_ERROR`, socket timeout logs `TIMEOUT`, and a successful envelope whose candidates are invalid logs `INVALID_RESULT`. Each test also checks sensitive values are absent.

- [x] **Step 5: Run focused tests to verify RED**

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.OdsayTransitRouteClientTest'
```

Expected: the new boundary assertions fail because those classifications are not logged yet.

- [x] **Step 6: Add minimal boundary logging**

Log exactly once at the boundary: empty body/JSON parse failure as `INVALID_JSON`, non-timeout `RestClientException` as `HTTP_ERROR`, detected timeout as `TIMEOUT`, and malformed result/no valid candidate as `INVALID_RESULT`. Do not log documented `NO_ROUTE` responses as provider malfunctions.

- [x] **Step 7: Verify focused and route suites**

```bash
cd BE
sh ./gradlew test --tests 'com.ddemachim.server.domain.route.service.OdsayTransitRouteClientTest' --tests 'com.ddemachim.server.domain.route.service.RouteComparisonServiceTest' --tests 'com.ddemachim.server.domain.route.controller.RouteControllerTest'
sh ./gradlew compileJava
```

Expected: all selected tests and compilation pass.

- [x] **Step 8: Check diff safety and commit**

```bash
git diff --check -- BE/src/main/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClient.java BE/src/test/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClientTest.java
git add BE/src/main/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClient.java BE/src/test/java/com/ddemachim/server/domain/route/service/OdsayTransitRouteClientTest.java
git commit -m "fix: expose safe ODsay failure diagnostics"
```
