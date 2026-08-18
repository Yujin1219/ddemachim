# 코스 생성 스키마 설계

- 상태: 사용자 방향 승인 완료, 구현 전 최종 검토
- 작성일: 2026-08-18
- 적용 범위: `data-pipeline/src/db/**`, `BE/src/main/**`, `BE/src/test/**`

## 1. 목표

회원이 장바구니 장소, 출발 위치, 당일 희망 시작·종료 시각, 장소별 체류시간과 도착 마감 시각을 입력하면 서버가 `EASY`, `FAST`, `PLEASANT` 세 방문 순서 후보를 계산한다. 후보 자체는 저장하지 않고 사용자가 선택한 한 결과만 코스로 영속화한다.

생성된 코스는 수정할 수 있다. 사용자 수정 또는 예정 체류시간 초과로 남은 일정을 재조정할 때 기존 결과를 덮어쓰지 않고 새 revision을 추가하며, 계산 실패 시 기존 revision을 그대로 유지한다.

## 2. 범위

### 포함

- 성공한 코스만 저장
- 선택된 방문 순서, 예상 도착·출발 시각, 체류시간 저장
- 현재 위치 또는 검색 장소 출발점 스냅샷 저장
- 사용자 도착 마감 시각과 10분 사전 도착 버퍼 저장
- 실제 운영시간 또는 공통 `DEMO_DEFAULT` 적용 결과 스냅샷 저장
- 선택 전략과 계산에 사용한 이동·DEM·장소 혼잡도 요약값 저장
- 수정·체류시간 초과 재조정을 revision으로 누적
- 코스 목록용 방문 예정 장소 수 저장
- 기존 `event`, `filming_location`, `place`를 사용한 화면 내 근접 콘텐츠 안내

### 제외

- 입력 중 draft 저장
- 선택되지 않은 두 코스 후보 저장
- 실시간 대중교통 혼잡도 재조회, 택시 추천, 백그라운드 위치 추적
- 코스 진행 상태 전용 테이블
- 코스별 근접 콘텐츠 복제 테이블
- TMAP 상세 geometry 및 구간별 내비게이션 영구 저장

## 3. 데이터 흐름

1. 생성 API는 인증 회원의 `basketItemId` 목록과 사용자 편집값을 받는다.
2. 서버는 장바구니 소유권, 장소 좌표, 체류시간, 운영시간, 도착 마감 시각을 검증한다.
3. 세 전략 후보를 메모리에서 계산해 반환한다.
4. 사용자가 한 전략을 선택하면 서버는 해당 전략을 재계산·검증한다.
5. 성공한 경우에만 `course`, `course_revision`, `course_stop`을 한 트랜잭션으로 저장한다.
6. 재조정 시 방문 완료 장소는 고정하고 남은 장소를 계산해 새 revision과 stop을 추가한다.
7. `course.current_revision_id`를 새 revision으로 교체하고 `planned_stop_count`를 새 stop 수로 갱신한다.

## 4. 스키마

### 4.1 `course`

회원이 소유한 코스의 안정적인 식별자와 현재 버전 포인터를 저장한다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `id` | `bigserial` | PK |
| `member_id` | `bigint` | NOT NULL, `member(member_id)` FK, 회원 삭제 시 CASCADE |
| `title` | `varchar(200)` | NOT NULL |
| `status` | `varchar(20)` | `READY`, `IN_PROGRESS`, `COMPLETED`, `ARCHIVED` |
| `current_revision_id` | `bigint` | nullable, 생성 직후 현재 revision 연결 |
| `planned_stop_count` | `integer` | NOT NULL, 0 이상, 현재 revision의 stop 수 요약값 |
| `created_at` | `timestamptz` | NOT NULL, 기본 `now()` |
| `updated_at` | `timestamptz` | NOT NULL, 기본 `now()` |

인덱스는 `(member_id, updated_at DESC)`를 둔다. `current_revision_id` FK는 `course_revision` 생성 후 추가하며 revision 삭제 시 `SET NULL`로 처리한다. 애플리케이션은 현재 revision이 같은 course에 속하는지 검증한다.

### 4.2 `course_revision`

최초 생성과 이후 재조정 결과를 불변 버전으로 저장한다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `id` | `bigserial` | PK |
| `course_id` | `bigint` | NOT NULL, `course(id)` FK, 코스 삭제 시 CASCADE |
| `revision_no` | `integer` | NOT NULL, 1 이상 |
| `route_strategy` | `varchar(20)` | `EASY`, `FAST`, `PLEASANT` |
| `service_date` | `date` | NOT NULL, 코스 진행일 |
| `desired_start_time` | `time` | NOT NULL |
| `desired_end_time` | `time` | NOT NULL, 시작보다 늦어야 함 |
| `start_type` | `varchar(30)` | `CURRENT_LOCATION`, `SEARCHED_PLACE` |
| `start_name` | `varchar(200)` | 검색 장소는 NOT NULL, 현재 위치는 nullable |
| `start_latitude` | `double precision` | NOT NULL, -90..90 |
| `start_longitude` | `double precision` | NOT NULL, -180..180 |
| `algorithm_version` | `varchar(50)` | NOT NULL |
| `replan_reason` | `varchar(30)` | `INITIAL`, `DWELL_OVERRUN`, `USER_EDIT` |
| `created_at` | `timestamptz` | NOT NULL, 기본 `now()` |

`UNIQUE(course_id, revision_no)`를 두고 `(course_id, revision_no DESC)` 인덱스를 둔다. 당일 일정만 지원하며 `desired_end_time > desired_start_time`을 DB와 서비스에서 검증한다.

### 4.3 `course_stop`

revision에 속하는 방문 장소, 순서, 일정과 계산 입력 스냅샷을 저장한다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `id` | `bigserial` | PK |
| `course_revision_id` | `bigint` | NOT NULL, `course_revision(id)` FK, revision 삭제 시 CASCADE |
| `sequence_no` | `integer` | NOT NULL, 1 이상 |
| `source_basket_item_id` | `bigint` | nullable, 생성 근거 추적용이며 생명주기 FK는 두지 않음 |
| `place_id` | `bigint` | nullable, `place(id)` FK, 삭제 시 SET NULL |
| `user_place_id` | `bigint` | nullable, `user_place(id)` FK, 삭제 시 SET NULL |
| `place_name_snapshot` | `varchar(200)` | NOT NULL |
| `address_snapshot` | `text` | nullable |
| `latitude_snapshot` | `double precision` | NOT NULL, -90..90 |
| `longitude_snapshot` | `double precision` | NOT NULL, -180..180 |
| `default_dwell_minutes` | `integer` | NOT NULL, 1..1440 |
| `dwell_minutes` | `integer` | NOT NULL, 1..1440 |
| `dwell_source` | `varchar(20)` | `DEFAULT`, `USER_MODIFIED` |
| `arrival_deadline` | `time` | nullable, 사용자가 입력한 도착 마감 |
| `arrival_buffer_minutes` | `integer` | NOT NULL, 기본 10, 0..1440 |
| `scheduled_arrival` | `time` | NOT NULL |
| `scheduled_departure` | `time` | NOT NULL, 도착보다 이르지 않아야 함 |
| `travel_minutes_from_previous` | `integer` | NOT NULL, 0 이상 |
| `travel_distance_meters` | `integer` | NOT NULL, 0 이상 |
| `ascent_meters` | `numeric(10,2)` | nullable, `EASY` 계산 근거 |
| `congestion_score_snapshot` | `numeric(5,2)` | nullable, 0..100, `PLEASANT` 계산 근거 |
| `hours_source_type` | `varchar(20)` | `REAL`, `DEMO_DEFAULT` |
| `open_time_snapshot` | `time` | NOT NULL |
| `close_time_snapshot` | `time` | NOT NULL |
| `event_id` | `bigint` | nullable, `event(id)` FK, 삭제 시 SET NULL |
| `event_end_time_snapshot` | `time` | nullable, 재조정에 사용한 팝업 종료 시각 |
| `created_at` | `timestamptz` | NOT NULL, 기본 `now()` |

제약은 다음과 같다.

- `UNIQUE(course_revision_id, sequence_no)`
- `place_id`와 `user_place_id`는 동시에 존재할 수 없다. 원본 삭제 후 둘 다 null이 될 수 있으며 필수 장소 정보는 스냅샷으로 보존한다.
- `arrival_deadline`이 있으면 스케줄러의 목표 도착 시각은 `arrival_deadline - arrival_buffer_minutes`다.
- `scheduled_departure >= scheduled_arrival`
- 실제 운영시간이 없는 장소에는 서버의 공통 `DEMO_DEFAULT`를 적용하되 최종 출처와 시간을 stop에 복사한다.

`(course_revision_id, sequence_no)` 조회는 unique 인덱스를 사용한다.

### 4.4 기존 테이블 변경

`place`와 `user_place`에 아래 컬럼을 추가한다.

| 컬럼 | 타입 | 제약/설명 |
| --- | --- | --- |
| `default_dwell_minutes` | `integer` | NOT NULL, 기본 60, 1..1440 |

기존 `place_operating_hours`는 실제 운영시간 원본으로 유지한다. 실제 운영시간이 없을 때 적용할 공통 `DEMO_DEFAULT`는 애플리케이션 설정으로 관리하고 DB에 장소별 가짜 운영시간 행을 만들지 않는다.

기존 `event`, `event_schedule`, `filming_location`, `media_content`는 변경하지 않는다. 팝업 기간·운영시간과 촬영 장면 설명을 기존 데이터에서 조회한다.

## 5. 엔티티 경계

신규 JPA 엔티티는 `Course`, `CourseRevision`, `CourseStop`이다.

- `Course`는 `Member`, 현재 `CourseRevision`을 지연 로딩으로 참조한다.
- `CourseRevision`은 `Course`를 참조하고 생성 이후 계산 조건을 변경하지 않는다.
- `CourseStop`은 `CourseRevision`을 참조하며 원본 `Place`, `UserPlace`, `Event` 참조는 nullable이다.
- `CourseStop`은 원본 참조가 삭제돼도 조회 가능하도록 이름·주소·좌표·운영시간을 필수 스냅샷으로 보존한다.
- 컬렉션 양방향 매핑은 기본으로 만들지 않고 repository 조회로 필요한 stop을 불러와 aggregate 크기를 제한한다.

enum은 `CourseStatus`, `CourseRouteStrategy`, `CourseStartType`, `CourseReplanReason`, `CourseDwellSource`, `CourseHoursSourceType`으로 분리한다.

`Place`, `UserPlace`에는 `defaultDwellMinutes` 필드를 추가한다. `UserPlace.createKakao`는 기본값 60을 명시적으로 설정하거나 DB 기본값에 의존하지 않도록 엔티티 기본값을 사용한다.

## 6. 무결성과 트랜잭션

- 코스 최초 저장: course 생성 → revision 생성 → stop 일괄 생성 → current revision/stop count 갱신을 한 트랜잭션으로 처리한다.
- 재조정: 현재 revision 번호를 낙관적 조건으로 확인하고 새 revision/stop 저장 후 포인터를 교체한다.
- 계산 또는 저장이 실패하면 새 revision 전체를 롤백하고 기존 current revision을 유지한다.
- `course`에 JPA `@Version` 컬럼을 추가해 동시 수정 충돌을 방지한다. DB 컬럼명은 `version`, 초기값은 0이다.
- 장바구니는 입력 소유권 확인에만 사용하며 완성 코스의 생명주기를 장바구니 삭제에 연결하지 않는다.
- `planned_stop_count`는 current revision의 stop 수와 같은 트랜잭션에서 갱신하는 조회 최적화 값이다.

## 7. 근접 콘텐츠와 재조정

코스 화면 진입 시 현재 코스 장소 주변의 활성 `event`와 `filming_location`을 한 번 조회한다. 프론트는 받은 좌표를 메모리에 두고 화면이 열린 동안 현재 위치와 거리를 로컬 계산한다. GPS 갱신마다 DB 공간 쿼리를 실행하지 않는다.

현재 시각이 `course_stop.scheduled_departure`를 초과하면 프론트가 재조정을 제안한다. 사용자가 승인하면 서버는 방문 완료 장소를 고정하고 남은 장소에 대해 운영시간, 팝업 종료시간, 도착 마감, 희망 종료시간을 다시 검증해 새 revision을 만든다. 진행 상태 전용 테이블은 이번 범위에 두지 않는다.

## 8. 마이그레이션

새 SQL 마이그레이션은 additive하고 한 트랜잭션으로 실행 가능해야 한다.

1. `place`, `user_place`에 기본 체류시간 컬럼과 CHECK를 추가한다.
2. `course`, `course_revision`, `course_stop`을 생성한다.
3. 순환 참조를 피하기 위해 마지막에 `course.current_revision_id` FK를 추가한다.
4. 필요한 unique/check/FK/index를 명시적 이름으로 생성한다.
5. 재실행 시 기존 객체를 맹목적으로 신뢰하지 말고 기존 프로젝트 패턴에 맞춰 제약 존재 여부를 검사한다.

기준 `schema.sql`은 현재 `user_place` 확장과 수동 마이그레이션 상태가 일치하지 않는 문제가 있다. 이번 작업에서는 새 코스 마이그레이션 파일을 우선 제공하고, 기존 전체 기준 스키마의 대규모 정리는 별도 작업으로 남긴다.

## 9. 검증

### 데이터

- SQL에 모든 신규 테이블·컬럼·제약·인덱스가 포함되는지 테스트
- 중복 revision 번호, 중복 stop 순서, 잘못된 좌표·시간·체류시간 거부 검증
- 원본 place/event 삭제 시 stop 스냅샷 보존 검증
- 마이그레이션 재실행 가능성 검증

### 백엔드

- 신규 엔티티 매핑 컴파일
- 생성 팩토리의 필수값과 enum 매핑 테스트
- `Course` current revision 교체 시 revision 번호·방문 수·낙관적 버전 갱신 테스트
- `CourseStop`이 내부 장소와 사용자 장소를 각각 스냅샷할 수 있는지 테스트
- 기존 course basket, place, event 테스트 회귀 검증

## 10. 완료 기준

- 신규 마이그레이션으로 세 테이블과 기본 체류시간 컬럼이 생성된다.
- 신규 JPA 엔티티와 repository가 SQL 컬럼·제약 이름과 일치한다.
- 선택되지 않은 후보, 실시간 교통 상태, 프론트 위치는 DB에 저장하지 않는다.
- 코스 수정과 체류시간 초과 재조정 결과를 revision으로 추가할 수 있다.
- 기존 장바구니·장소·이벤트·촬영지 데이터와 생명주기가 분리된다.
- 관련 데이터 테스트와 백엔드 테스트가 통과한다.
