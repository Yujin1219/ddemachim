# ODsay 안전 진단 설계

## 목표

직접 `curl` 호출은 정상 경로를 반환하지만 백엔드는 대중교통 경로를
`PROVIDER_UNAVAILABLE`로 축약하는 문제를 진단 가능하게 만든다. 공개 API의 응답 계약과
사용자 화면은 변경하지 않는다.

## 확인된 사실

- 사용자가 제공한 ODsay 성공 응답의 첫 번째 `result.path`는 현재 정규화에 필요한
  `info.totalTime`, `info.totalDistance`, `subPath[].trafficType`, `sectionTime`, `distance`를
  포함한다.
- 같은 응답이 백엔드에 도착했다면 현재 파서에서 `AVAILABLE`로 변환될 수 있다.
- 따라서 우선 조사 대상은 Spring 런타임의 실제 키/요청과 ODsay가 백엔드 요청에 반환한
  응답의 차이다.
- 현재 구현은 HTTP 오류, JSON 파싱 실패, ODsay 인증 오류, 응답 스키마 오류를 대부분
  `PROVIDER_UNAVAILABLE` 하나로 변환하며 내부 진단 근거도 남기지 않는다.

## 설계

`OdsayTransitRouteClient`의 실패 경계마다 비밀정보가 없는 진단 분류를 기록한다.

- `HTTP_ERROR`: ODsay가 성공이 아닌 HTTP 상태를 반환함
- `INVALID_JSON`: 응답 본문이 비었거나 JSON으로 해석되지 않음
- `ODSAY_ERROR_<code>`: ODsay JSON의 `error` 객체 또는 배열에 안전한 숫자 코드가 있음
- `INVALID_RESULT`: 성공 응답이지만 경로 구조가 유효하지 않음
- `TIMEOUT`: 연결 또는 읽기 제한시간 초과

ODsay가 인증 실패 시 사용하는 `error: [{"code":"500", ...}]` 배열과 기존 객체 형태를
모두 인식한다. 클라이언트 응답에는 기존 `RouteUnavailableReason`만 사용하며 ODsay 메시지나
내부 분류는 노출하지 않는다.

## 보안 경계

로그에 다음 값은 절대 기록하지 않는다.

- API 키 및 키의 일부/길이
- 요청 URL과 쿼리 문자열
- 출발지·도착지 좌표
- ODsay 원문 응답 또는 `message`

로그에는 제공자명, 작업명, 안전한 분류 코드만 기록한다.

## 테스트

- 배열 형태 ODsay 오류 코드 `500`이 안전한 인증 실패 분류 로그를 남기고 외부에는
  `PROVIDER_UNAVAILABLE`로 유지되는지 검증한다.
- 객체 형태의 기존 no-route 코드는 기존처럼 `NO_ROUTE`를 유지한다.
- 비정상 JSON, HTTP 오류, 타임아웃의 분류가 서로 구분되는지 검증한다.
- 로그에 API 키, 좌표, 원문 ODsay 메시지가 포함되지 않는지 검증한다.
- ODsay 클라이언트 테스트와 전체 route 테스트, 컴파일을 실행한다.

## 범위 제외

- API 키 또는 IP 설정 자동 변경
- 프론트엔드 응답 계약 변경
- 원문 제공자 오류를 사용자에게 노출
- 재시도, 회로 차단기, 메트릭 시스템 추가

