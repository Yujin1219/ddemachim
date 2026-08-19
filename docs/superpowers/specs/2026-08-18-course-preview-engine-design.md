# 코스 미리보기 계산 엔진 설계

- 상태: FAST 미리보기 기준선 구현 완료, EASY/PLEASANT 및 DEM 연동은 후속 범위
- 작성일: 2026-08-18
- 적용 범위: `data-pipeline/**`, `BE/**`, `FE/**`

## 1. 목표

현재 구현된 기준선은 사용자가 코스 장바구니 장소, 출발 위치, 진행 날짜,
희망 시작·종료 시각, 장소별 체류시간과 도착 마감 시각을 제출하면 서버가
`FAST` 방문 순서 후보 하나를 계산해 반환한다. 아래 `EASY`, `PLEASANT`, DEM 및
혼잡도 설계는 후속 구현 목표다.

- `FAST`: 전체 이동시간을 우선 최소화한다.
- `EASY`: 이동시간에 도보거리, 환승, DEM 기반 누적 오르막과 급경사 구간
  페널티를 반영한다.
- `PLEASANT`: 이동시간에 장소별 예상 혼잡도 페널티를 반영한다.

미리보기는 저장하지 않는다. 선택된 전략을 저장하는 API는 별도 후속 범위다.

## 2. 외부 입력과 기존 자산

- 코스 입력 계약: `CoursePreviewRequest`
- 코스 응답 계약: `CoursePreviewResponse`
- 장바구니 장소 검증: `CoursePreviewInputResolver`
- 구간 경로: 기존 TMAP 기반 `RouteProviderClient`
- 장소 운영시간: `place_operating_hours`
- 장소 혼잡도: 기존 Redis 기반 mock 혼잡도 서비스의 좌표 일괄 조회
- DEM 원본: `/Users/yujin/Project/jongro_gu.tif`
  - 6576×7388 픽셀
  - 1m 픽셀 크기
  - 32비트 실수형 고도 밴드와 알파 마스크 밴드
  - 투영 파라미터는 EPSG:5186과 일치하는 것으로 추정되며 적재 전 GDAL/QGIS로
    최종 검증한다.

## 3. API 계약

### 3.1 엔드포인트

`POST /api/courses/preview`

- 인증 회원 ID는 `@AuthenticationPrincipal Long memberId`에서 가져온다.
- `/api/courses/**`는 인증이 필요하다. Authorization 헤더가 없으면 `401
  COMMON401` 공통 오류 응답을 반환하며, 유효하지 않거나 만료된 액세스 토큰은
  인증 도메인의 세부 코드를 반환한다.
- 요청 본문은 `CoursePreviewRequest`를 사용한다. `serviceDate`는 ISO 날짜
  (`yyyy-MM-dd`), 시각은 ISO 로컬 시각(`HH:mm` 또는 초 포함 형식)이다.
- `places`는 1개 이상 5개 이하이며 `basketItemId`는 중복할 수 없다. 각 항목의
  `dwellMinutes`는 1~1440분이다. 종료 희망 시각은 출발 희망 시각보다 늦어야 한다.
- `start.type`이 `SEARCHED_PLACE`이면 비어 있지 않은 `name`이 필요하다. 위도는
  -90~90, 경도는 -180~180 범위여야 한다.
- 응답은 `ApiResponse<CoursePreviewResponse>`로 감싼다.
- HTTP 200 성공 응답은 현재 `options`에 `strategy: FAST`인 항목 하나만 담는다.
- 이 API는 코스, 선택 전략 또는 공급자 응답을 영속화하지 않는다. 선택 코스 저장은
  별도 후속 API 범위다.

요청 예시:

```json
{
  "serviceDate": "2026-08-18",
  "desiredStartTime": "10:00",
  "desiredEndTime": "18:00",
  "start": {
    "type": "CURRENT_LOCATION",
    "name": "현재 위치",
    "latitude": 37.5665,
    "longitude": 126.9780
  },
  "places": [
    {
      "basketItemId": 10,
      "dwellMinutes": 60,
      "arrivalDeadline": "11:00"
    }
  ]
}
```

### 3.2 응답 보강

현재 FAST 기준선의 `Option`은 합계와 방문 순서가 정해진 `stops`를 반환한다.

- `totalDurationMinutes`, `totalTravelMinutes`, `travelMinutesFromPrevious`는 초 단위
  공급자 값을 분으로 올림한다.
- 각 stop의 `incomingRoute`는 해당 장소를 선택할 때 TMAP이 반환한 `RouteOption`을
  다시 조회하거나 축약하지 않고 그대로 포함한다.
- `incomingRoute`는 `mode`, `status`, `durationSeconds`, `distanceMeters`, `fareWon`,
  `transferCount`, `walkDistanceMeters`, `unavailableReason`, `legs`를 포함한다.
- 각 leg는 `mode`, `routeName`, `durationSeconds`, `distanceMeters`, GeoJSON
  `LineString` geometry와 `steps`를 포함한다. TMAP 대중교통의 `WALK` leg는 원래
  순서의 도보 step을 보존하며, 각 step은 `streetName`, `distanceMeters`,
  `description`, geometry를 포함할 수 있다. 좌표 순서는 `[longitude, latitude]`다.
- 경로 거리는 우선 `incomingRoute.distanceMeters`를 사용하고, 값이 없을 때 모든
  leg 거리가 있으면 그 합을 사용한다. 한 구간의 거리를 알 수 없으면 코스 전체
  `totalDistanceMeters`도 `null`이다.
- 현재 미구현인 `totalAscentMeters`, `averageCongestionScore`, stop의
  `ascentMeters`, `congestionScore`, `eventId`, `eventEndTime`은 `null`이다.

후속 다중 전략 구현에서는 각 `Option`에 계산 성공 여부와 불가능 사유를 명시하는
아래 계약을 별도로 도입한다. 현재 응답에는 이 필드가 없다.

- `status`: `AVAILABLE`, `UNAVAILABLE`
- `unavailableReasons`: 종료 희망 시각 초과, 운영시간 위반, 도착 마감 위반,
  경로 제공자 실패 등의 안전한 코드 목록
- `explanations`: 전략별 정렬 근거를 사용자 문구로 제공

일부 전략만 계산할 수 없으면 계산 가능한 후보는 그대로 반환한다. 세 전략이 모두
불가능하면 코스 도메인의 typed exception을 반환한다.

## 4. DEM 적재

### 4.1 저장 방식

원본 GeoTIFF의 고도 픽셀을 PostGIS Raster의 `dem_jongno` 테이블에 in-db로
저장한다. 애플리케이션 마이그레이션은 `postgis_raster` 확장과 조회용 SQL 계약을
검증하지만, 371MB 바이너리 데이터 적재 자체는 반복 가능한 운영 스크립트가 맡는다.

원본의 알파 마스크가 0인 픽셀은 실제 고도 0m가 아니라 종로구 범위 밖이다. 적재 전
이 픽셀을 `NoData=-9999`로 물질화하고 고도 밴드 하나만 남긴 정제 GeoTIFF를 만든다.

### 4.2 타일과 인덱스

- SRID: 검증 완료 후 `5186`
- 타일 크기: `256x256`
- 밴드: 고도 밴드 1개
- 저장: in-db (`raster2pgsql -R` 미사용)
- 인덱스: raster convex hull GiST
- 제약: SRID, 픽셀 크기, 밴드 수, extent raster constraints

적재 명령은 `raster2pgsql -s 5186 -b 1 -t 256x256 -I -C -M`을 기준으로
생성한다. 현재 DB에는 `postgis_raster`가 이미 활성화돼 있지만 현재 PostgreSQL
컨테이너에는 `raster2pgsql` 실행 파일이 없으므로, 데이터 파이프라인용 loader
이미지에서 도구를 실행한다.

### 4.3 조회 방식

경로 샘플마다 쿼리하지 않는다. 한 구간의 모든 WGS84 샘플 좌표를 배열 또는
`VALUES` 집합으로 한 번에 전달한다.

1. 입력 좌표를 `ST_Transform(..., 5186)`으로 변환한다.
2. `ST_Intersects(rast, point)`로 공간 인덱스를 사용해 타일을 찾는다.
3. `ST_Value(rast, 1, point, true)`로 고도를 조회한다.
4. NoData 또는 DEM 범위 밖 좌표는 결과를 비워 반환한다.

Repository는 입력 순서를 보존하는 projection을 반환하고, 서비스는 누락 샘플이
있는 구간을 `DEM_UNAVAILABLE`로 표시한다.

## 5. 경사 계산

TMAP 도보 geometry를 거리 기준 약 5m 간격으로 샘플링한다. 샘플 고도에는 3점
이동 중앙값을 적용해 건물 경계와 DEM 노이즈로 인한 단발성 튐을 줄인다.

- 누적 오르막: 연속 고도 차 중 양수만 합산
- 구간 경사도: `고도 차 / 수평거리 × 100`
- 급경사 거리: 절대 경사도 8% 이상인 상승 구간의 수평거리 합
- 1m 미만의 단발성 고도 차는 누적 오르막에서 제외

DEM이 없는 구간은 오류로 전체 미리보기를 중단하지 않는다. 해당 구간의
`ascentMeters`는 `null`이며 `EASY`는 이동시간·도보거리·환승 페널티로
fallback한다. 응답 설명에는 DEM 미지원 구간이 있음을 표시한다.

## 6. 방문 순서 계산

### 6.1 호출량 제한

현재 FAST 기준선은 매 방문 순서에서 남은 장소까지의 대중교통 경로를 순차 조회하고,
가용 후보 중 이동시간이 가장 짧은 장소를 선택하는 greedy nearest-neighbor 방식이다.
따라서 장소 수가 `n`이면 공급자 호출은 최악의 경우 `n(n+1)/2`회이며, 5개 제한에서
최대 15회다. 호출은 순차적이고 기본 TMAP read timeout이 4초이므로 공급자 지연 시
최악 응답 시간이 약 60초에 접근할 수 있다.

이 greedy 방식은 현재 위치에서 선택 가능한 최단 후보를 확정한 뒤 되돌리지 않는다.
따라서 다른 방문 순서는 전체 제약을 만족하더라도 greedy로 선택한 순서의 후속 장소가
운영시간, 도착 마감 또는 희망 종료 시각을 만족하지 못하면 `COURSE4222`가 발생할 수
있다. 아래 후보 생성과 2-opt는 이 한계를 완화할 후속 설계다.

현재 알려진 공급자 숫자 경계 동작은 다음과 같다.

- `durationSeconds`가 0 이하인 경로는 사용할 수 없는 후보로 처리한다.
- 공급자의 top-level `distanceMeters`가 음수이면 현재 별도 정규화 없이 stop 및 코스
  합계에 반영될 수 있다. 운영 모니터링과 후속 입력 강화가 필요하다.

후속 다중 전략에서는 모든 순열이나 모든 장소 쌍에 대해 TMAP을 호출하지 않는다.

1. 출발점과 장소 좌표로 직선거리 행렬을 만든다.
2. 전략별 greedy insertion으로 초기 순서를 만든다.
3. 2-opt 교환으로 되돌아가는 구간을 줄인다.
4. 전략별 상위 후보를 제한된 수만 유지한다.
5. 실제 일정 평가 단계에서만 후보 구간을 TMAP으로 조회한다.

동일 좌표 쌍의 TMAP 결과는 기존 캐시를 공유한다. 공급자 호출 실패는 후보를
불가능 처리하되 다른 전략 계산은 계속한다.

### 6.2 전략별 점수

점수는 낮을수록 좋다.

- `FAST`
  - 실제 총 이동시간
  - 종료 희망 시각 초과에 매우 큰 페널티
  - 되돌아가는 거리 보조 페널티
- `EASY`
  - 실제 총 이동시간
  - 도보거리
  - 누적 오르막
  - 8% 이상 급경사 거리
  - 대중교통 환승 횟수
- `PLEASANT`
  - 실제 총 이동시간
  - 장소 도착 예상 슬롯의 혼잡도 점수
  - 고혼잡 장소에 오래 체류하는 경우의 추가 페널티

가중치는 코드에 흩어진 숫자로 두지 않고 `CoursePreviewProperties`에 둔다.
초기값은 테스트로 고정하고 운영 설정으로 조정 가능하게 한다.

## 7. 일정 계산과 제약

각 후보 순서에 대해 출발 시각부터 순차적으로 계산한다.

1. 직전 지점에서 현재 장소까지 실제 이동시간을 더한다.
2. 운영 시작 전이면 운영 시작 시각까지 대기한다.
3. 도착 마감이 있으면 목표 시각을 `arrivalDeadline - 10분`으로 본다.
4. 목표 시각보다 늦으면 후보를 불가능 처리한다.
5. 체류시간을 더해 예정 출발 시각을 계산한다.
6. 실제 또는 데모 운영 종료 시각과 희망 종료 시각을 넘는지 검증한다.

실제 장소는 요청 날짜의 `place_operating_hours`를 사용한다. 해당 요일의 구조화된
운영시간이 없거나 사용자 장소라면 현재 고정된 `DEMO_DEFAULT` 09:00~22:00을
적용한다. 휴무 데이터가 명시된 장소는 해당 후보에서 방문 불가다. 환경별 설정 전환은
후속 범위다.

사용자가 입력한 도착 마감보다 일찍 도착하는 것은 허용한다. 정확히 10분 전까지
기다리게 만들지는 않으며, 10분 전은 늦어도 도착해야 하는 상한이다.

## 8. 혼잡도 결합

혼잡도는 후보 일정의 `scheduledArrival`을 Asia/Seoul offset 시각으로 변환해 장소
좌표 전체를 한 번에 조회한다. 격자 범위 밖인 장소는 혼잡도 `null`로 유지하고 중립
점수를 사용한다. Redis 또는 격자 조회 실패를 성공 데이터로 위장하지 않으며 해당
전략을 `UNAVAILABLE`로 표시한다.

코스 도메인은 crowding 내부 repository를 직접 사용하지 않고
`CourseCrowdingProvider` 경계를 통해 좌표·예상 시각별 점수만 받는다.

## 9. 컴포넌트 경계

- `CoursePreviewController`: 인증 principal, `@Valid` 요청 검증, 응답 래핑
- `CoursePreviewService`: 입력 해석 → FAST 계획 → 응답 매핑을 조율하며 추가 공급자
  호출이나 영속화를 하지 않는다.
- `CoursePreviewInputResolver`: 인증 회원 소유 장바구니 항목, 좌표, 체류시간과
  요청 날짜의 운영시간을 해석한다. 운영시간이 없거나 사용자 장소이면
  `DEMO_DEFAULT` 09:00~22:00을 적용한다.
- `CourseFastPlanner`: TMAP 대중교통 경로로 FAST greedy 순서를 계산하고 운영시간,
  도착 마감 10분 버퍼, 체류시간과 희망 종료 시각을 검증한다.

아래 컴포넌트는 EASY/PLEASANT 및 DEM 후속 범위다.

- `CourseRouteCandidateGenerator`: 좌표 기반 후보 순서 생성
- `CourseScheduleEvaluator`: 이동·운영시간·마감·체류시간 일정 계산
- `CourseStrategyScorer`: 세 전략별 점수 계산
- `ElevationProfileService`: 경로 샘플 생성과 경사 요약
- `DemRasterRepository`: PostGIS Raster 고도 일괄 조회
- `CourseOperatingHoursResolver`: 실제/데모 운영시간 결정
- `CourseCrowdingProvider`: 혼잡도 도메인과의 명시적 경계

구간 경로 제공자와 DEM 조회를 인터페이스로 분리해 단위 테스트에서는 실제 TMAP,
PostgreSQL 또는 Redis 없이 결정론적으로 검증한다.

## 10. 프론트 연결

`#/course-conditions`에서 출발 위치·날짜·시간을 확정하고
`#/course-place-times`에서 체류시간·도착 마감을 확정한 뒤
호출할 현재 백엔드 연동 경로는 `POST /api/courses/preview`다.

아래 다중 전략 UI 연결은 후속 범위다.

- 입력 상태는 두 화면 사이에서 상위 코스 흐름 상태로 보존한다.
- 로딩 중 중복 요청을 막는다.
- 전략별 `AVAILABLE`/`UNAVAILABLE`을 구분해 표시한다.
- 세 전략 카드에서 방문 순서, 예상 종료, 이동시간, 오르막, 혼잡도와 설명을 비교한다.
- 사용자가 전략을 선택하기 전에는 DB에 코스를 저장하지 않는다.

## 11. 오류 처리

- 인증 누락: HTTP 401, `COMMON401`
- Bean Validation 실패: HTTP 400, `COMMON400`, `result`에 필드별 안전한 메시지
- 잘못된 JSON 또는 날짜·시각 역직렬화 실패: HTTP 400, `COMMON400`, `result` 생략
- 서비스 계층의 잘못된 미리보기 입력: HTTP 400, `COURSE4001`
- 인증 회원 소유 장바구니 항목 누락: HTTP 404, `COURSE4041`
- 장소 좌표 누락: HTTP 422, `COURSE4221`
- FAST 경로 제공 실패 또는 현재 greedy 순서에서 제약을 만족하는 다음 장소가 없음:
  HTTP 422, `COURSE4222`

모든 오류는 다음 공통 envelope를 사용하고 내부 예외나 공급자 원문은 노출하지 않는다.
`result`가 `null`이면 JSON에서 생략되며, Bean Validation 실패일 때만 필드별 메시지
객체가 포함될 수 있다.

```json
{
  "isSuccess": false,
  "code": "COMMON400",
  "message": "잘못된 요청입니다."
}
```

다음 항목은 후속 다중 전략 및 DEM 구현 범위다.

- DEM 테이블 미적재: `EASY`만 fallback하고 경고 설명 제공
- TMAP 전체 실패: 해당 후보 `UNAVAILABLE`
- 운영시간/도착 마감/종료 희망 위반: 안전한 불가능 사유 코드 제공
- 혼잡도 공급자 실패: `PLEASANT`만 `UNAVAILABLE`
- 세 후보 모두 불가능: `422 Unprocessable Entity`의 typed course exception

내부 SQL, 공급자 응답 본문, 파일 경로, 인증정보는 클라이언트 오류에 노출하지 않는다.

## 12. 테스트와 검증

### 데이터

- 알파 마스크가 NoData로 변환되는지 검증
- raster SRID, 픽셀 크기, 밴드 수, 타일 크기 검증
- 경계 안/밖 좌표 및 NoData 조회 검증

### 백엔드

- 고도 배치 조회가 입력 순서를 보존하는지 검증
- 평지, 연속 오르막, 노이즈, 급경사, DEM 누락 프로필 검증
- 운영 시작 대기, 휴무, 운영 종료, 도착 마감 10분 버퍼 검증
- 각 전략이 의도한 후보를 선택하는지 검증
- 일부/전체 공급자 실패와 부분 성공 응답 검증
- 인증 principal과 요청 validation controller 테스트

### 프론트

- 두 설정 화면의 입력이 하나의 요청 DTO로 결합되는지 검증
- 로딩, 부분 실패, 전체 실패, 세 전략 비교 렌더링 검증
- 중복 제출 방지 및 재시도 검증

## 13. 범위 제외

- 자체 보행 도로망에서 평탄한 골목을 새로 탐색하는 라우팅
- TMAP이 반환하지 않은 대체 도보 geometry 생성
- 실시간 대중교통 혼잡도 재조회
- 미리보기 후보 영속화
- 선택 코스 저장, 수정, 체류 초과 재조정 API

## 14. 완료 기준

- DEM이 PostGIS Raster 타일로 반복 가능하게 적재된다.
- 한 경로의 고도는 단일 배치 쿼리로 조회된다.
- 세 전략 후보가 운영시간, 체류시간, 도착 마감 10분 버퍼를 반영한다.
- `EASY`가 실제 DEM 누적 오르막과 급경사를 점수에 반영한다.
- `PLEASANT`가 예상 도착 슬롯의 장소 혼잡도를 점수에 반영한다.
- 프론트가 장바구니 및 사용자 입력을 미리보기 API로 전송하고 세 후보를 비교한다.
