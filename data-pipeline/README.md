# ddemachim data-pipeline

"때마침" 서울 장소/촬영지/문화행사 데이터 파이프라인. 1차 파일럿 범위는 **서울특별시 종로구**로 한정한다.

원칙: 실제 API/공공데이터만 사용(가짜 데이터 생성 금지), 엔드포인트/응답 필드는 실호출로 검증 후 코드에 반영, raw → staging(source_raw_data) → core(place 등) 순서로만 적재, 불확실한 값은 비워두고 절대 지어내지 않는다.

## 목차

- [데이터 소스](#데이터-소스)
- [DB 구조](#db-구조)
- [중복 장소 판별(매칭) 로직](#중복-장소-판별매칭-로직)
- [현재 데이터 현황](#현재-데이터-현황-2026-08-10-기준)
- [알려진 데이터 품질 이슈](#알려진-데이터-품질-이슈)
- [설정](#설정)
- [실행](#실행)
- [스케줄러(주기 수집)](#스케줄러주기-수집)
- [폴더 구조](#폴더-구조)

## 데이터 소스

### 1. RedTable (서울시 모범음식점/인증음식점)

- **API**: RedTable Open API (`REDTABLE_API_KEY` 필요)
- **가져온 데이터**: 종로구 소재 음식점 전체 — 상호명, 주소, 좌표, 전화번호, 업종 분류(한식/중식/일식/카페/제과점 등), 영업시간/휴무일 원문, 이미지(`/api/rstr/img` 엔드포인트로 별도 조회)
- **place로 반영**: 이름·주소·좌표를 가진 원본 소스라 신규 `place`를 직접 생성할 수 있는 소스. 업종은 [`src/config/categories.py`](src/config/categories.py)의 `REDTABLE_CATEGORY_MAP`으로 RESTAURANT/CAFE/DESSERT/ETC 등으로 매핑(명확하지 않은 값은 ETC로 남김, 추측 매핑 안 함)
- **수집**: [`src/collectors/redtable.py`](src/collectors/redtable.py) → [`scripts/run_redtable.py`](scripts/run_redtable.py)

### 2. TourAPI (한국관광공사)

- **API**: `https://apis.data.go.kr/B551011/KorService2` (`TOUR_API_KEY` 필요)
- **가져온 데이터**: `areaBasedList2`(종로구, contentTypeId 12=관광지/14=문화시설/38=쇼핑/39=음식점)로 목록 수집 → `detailCommon2`로 설명(overview) → `detailIntro2`로 운영시간/휴무일(contentTypeId별 필드명이 달라 실호출로 확인 후 매핑: 12→usetime/restdate, 14→usetimeculture/restdateculture, 38→opentime/restdateshopping, 39→opentimefood/restdatefood) → 대표이미지(firstimage/firstimage2)
- **place로 반영**: 좌표 보유 소스라 신규 `place` 직접 생성 가능. `contentTypeId=15`(축제/공연/행사)는 장소가 아니라 [`event`](#4-tourapi-축제공연행사-contenttypeid15)로 별도 처리
- **수집**: [`src/collectors/tour_api.py`](src/collectors/tour_api.py) → [`scripts/run_tourapi.py`](scripts/run_tourapi.py)

### 3. 서울시 관광명소 (서울관광재단 제공, CSV)

- **출처**: [data.seoul.go.kr](https://data.seoul.go.kr) — 사용자가 직접 다운로드해 제공한 CSV(자동화 접근이 사이트 차단으로 막혀 있어 수동 확보)
- **가져온 데이터**: 명소명, 주소, 설명, 홈페이지 등. **이 소스는 좌표를 자체적으로 안 줘서** [`src/collectors/geocoder.py`](src/collectors/geocoder.py)(Kakao 주소 검색 API, `KAKAO_REST_API_KEY`)로 지오코딩해서 좌표를 채운 뒤에만 신규 `place`를 만들 수 있음(좌표 없이는 절대 신규 생성 안 함)
- **알려진 이슈**: CSV 도로명주소 앞에 5자리 우편번호가 붙어 있어 지오코딩이 처음엔 실패했음(1/170 성공) → `strip_leading_zipcode`로 제거 후 164/170으로 개선
- **수집**: [`src/collectors/seoul_tour.py`](src/collectors/seoul_tour.py) → [`scripts/run_seoul_tour.py`](scripts/run_seoul_tour.py)

### 4. TourAPI 축제/공연/행사 (contentTypeId=15)

- 위 TourAPI와 같은 API, 같은 인증키. `areaBasedList2`(contentTypeId=15) + `detailIntro2`(eventstartdate/eventenddate/eventplace)
- **place가 아니라 [`event`](#db-구조) 테이블**로 적재 — 기간이 있는 일회성 정보라 상시 존재하는 place와 성격이 다름
- **필터링**: 종로구 + **오늘 기준 진행중이거나 예정인 것만**(`end_date >= 오늘`, end_date 없으면 `start_date >= 오늘`, 둘 다 없으면 판단 불가로 제외 — 지어내지 않음)
- **수집**: [`src/collectors/tour_api.py`](src/collectors/tour_api.py)의 `collect_events` → [`scripts/run_events.py`](scripts/run_events.py)

### 5. 서울시 문화행사 정보 (OA-15486)

- **출처**: [data.seoul.go.kr/dataList/OA-15486](https://data.seoul.go.kr/dataList/OA-15486/S/1/datasetView.do), Open API `http://openapi.seoul.go.kr:8088/{KEY}/json/culturalEventInfo/{시작}/{끝}/` (`SEOUL_OPENAPI_KEY` 필요, 서울 열린데이터광장 인증키 신청)
- **가져온 데이터**: 분류(CODENAME), 자치구(GUNAME), 공연행사명(TITLE), 장소(PLACE), 기관명(ORG_NAME), 이용대상(USE_TRGT), 이용요금(USE_FEE), 문의(INQUIRY), 홈페이지(ORG_LINK), 대표이미지(MAIN_IMG), 신청일(RGSTDATE), 시작일/종료일(STRTDATE/END_DATE), 좌표(LOT=경도/LAT=위도), 포털 상세 URL(HMPG_ADDR), 행사시간(PRO_TIME) — 전 필드 실호출로 검증 후 반영
- **이 API는 자체 고유 ID를 제공하지 않아서** `(자치구|제목|시작일)` 조합을 소스 내 유일키(`source_id`)로 사용
- **필터링**: 서울 전체(19,488건) → 종로구(4,935건) → 진행중/예정만(90건, 2026-08-10 기준)
- **place 연결**: `event.venue_name`(장소명 원문)이 기존 `place.name`과 정확히 일치할 때만 `place_id` 연결(부분/유사 매칭 안 함) — 90건 중 4건만 연결됨, 나머지는 "OO 대극장"처럼 상위 시설의 세부 공간명이라 매칭 안 됨(place_id NULL이어도 venue_name 원문은 그대로 보존되어 화면 표시엔 문제없음)
- **수집**: [`src/collectors/seoul_culture_event.py`](src/collectors/seoul_culture_event.py) → [`scripts/run_seoul_culture_event.py`](scripts/run_seoul_culture_event.py)

### 6. 한국문화정보원 촬영지 데이터 (CSV)

- **출처**: 공공데이터포털 "한국문화정보원_미디어콘텐츠(영상) 촬영지 데이터" CSV(전국 15,034행)
- **가져온 데이터**: 연번(source_id), 미디어타입(drama/movie/show/artist), 제목, 장소명, 장소타입(playground/restaurant/stay/cafe/store/station), 장소설명, 영업시간/휴무일 원문, 주소, 좌표, 전화번호
- **카테고리/태그 매핑**: 장소타입이 명확한 것만 내부 카테고리로 매핑(restaurant→RESTAURANT, cafe→CAFE, store→SHOPPING), playground/stay/station처럼 애매한 값은 ETC로 유지(추측 매핑 금지). 촬영지 여부는 카테고리가 아니라 `place.tags`의 `FILMING_LOCATION` 태그로 보존
- **수집**: [`src/collectors/filming_location.py`](src/collectors/filming_location.py) → [`scripts/run_filming_location.py`](scripts/run_filming_location.py)

### 7. TMDB (촬영지 ↔ 작품 매칭)

- **API**: `https://api.themoviedb.org/3` (`TMDB_API_KEY`, v3/v4 키 형식 자동 판별)
- **가져온 데이터**:
  - `search/movie`, `search/tv`: tmdb_id, 제목, 원제, 포스터, 줄거리, 개봉/방영일
  - `{kind}/{id}/credits`: 출연진(배우명, 배역명, 출연순서), 감독(job=Director만 저장, 그 외 스태프 직군은 저장 안 함)
- **저장 안 하는 것**: `vote_average`/`vote_count`/`popularity`/`genre_ids`/`backdrop_path`(요청에 따라 컬럼 삭제)/영상(예고편/클립) — 필요성 낮다고 판단해 스키마에서 제외
- **매칭 기준** (연도 정보가 CSV에 없어 제목 유사도만으로 판단): media_type으로 검색 API 자체를 분기(drama/show→tv, movie→movie 검색이라 타입 오매칭은 원천 불가) → 제목 정규화 후 `difflib.SequenceMatcher`로 유사도 계산 → **0.90 이상만 자동 확정(AUTO_MATCH)**, 미만은 REVIEW_REQUIRED로 사람 검토 대기(오매칭보다 검토 대기가 안전하다는 원칙)
- **수동 검토 처리**: REVIEW_REQUIRED 중 후보는 있지만 임계값 미달인 건들은 사람이 직접 검토해서 확정하거나(예: "A-Teen (에이틴)"→"에이틴") 폐기했음. 후보 자체가 없던(TMDB 미등록 예능 코너 등) 건은 삭제
- **artist(인물) 데이터**: 작품이 아니라 인물이라 TMDB 매칭 대상에서 원천 제외. 다른 소스(RedTable/TourAPI 등)와 안 겹치는 단독 장소(방문 정보만 있고 다른 근거 없는 곳)는 삭제, 겹치는 장소는 place 자체는 보존
- **저작권 표기**: [TMDB 이용약관](https://www.themoviedb.org/api-terms-of-use)에 따라 서비스에 "This product uses the TMDB API but is not endorsed or certified by TMDB." 문구와 TMDB 로고를 표기해야 함(FE 작업 시 반영 필요)

## DB 구조

PostgreSQL + PostGIS(`geometry(Point, 4326)`). 스키마는 [`src/db/schema.sql`](src/db/schema.sql) 참고.

| 테이블 | 역할 |
|---|---|
| `place` | 핵심 장소 마스터(식당/카페/관광지 등 상시 존재하는 공간) |
| `place_source` | place ↔ 원본 소스 매핑, `UNIQUE(source, source_id)`로 동일 소스 재수집 시 idempotent 처리 |
| `place_category` | 카테고리 마스터(RESTAURANT/CAFE/DESSERT/ATTRACTION/CULTURE/SHOPPING/ETC 등) |
| `place_image` | 장소 이미지(다건) |
| `place_operating_hours` | 요일별 구조화된 영업시간(모호한 원문은 구조화 안 하고 `place.operating_hours_raw`에만 보존) |
| `event` | 기간이 있는 행사/축제/전시(place와 분리) — TourAPI 15번, 서울시 문화행사 정보 |
| `media_content` | TMDB 작품 메타데이터 |
| `person` | 배우/감독 인물(TMDB person_id로 중복 방지) |
| `media_credit` | media_content ↔ person N:M(배역/감독) |
| `filming_location` | place ↔ media_content N:M(촬영지-작품, 매칭 신뢰도 포함) |
| `source_raw_data` | 모든 API/CSV 원본 응답 보존(raw → staging 단계 추적, 재현/디버깅용) |

## 중복 장소 판별(매칭) 로직

[`src/matchers/place_matcher.py`](src/matchers/place_matcher.py). 이름만으로 절대 병합하지 않는다.

1. 같은 소스 재수집(`place_source`에 동일 `(source, source_id)` 존재)이면 단순 update
2. 새 소스면 `normalized_name + district` 정확 일치 후보를 찾음
   - 후보 0건 → 좌표 있으면 신규 insert, 없으면 REVIEW_REQUIRED로 보류(나중에 좌표 있는 소스가 같은 곳을 만들면 재매칭 대상)
   - 후보 2건 이상(모호함) → REVIEW_REQUIRED
   - 후보 1건, 양쪽 다 좌표 있음 → `ST_DistanceSphere`로 **50m 이내면 AUTO_MATCH**, 초과면 REVIEW_REQUIRED
   - 후보 1건인데 좌표가 한쪽이라도 없음 → REVIEW_REQUIRED(추측 병합 금지)

## 현재 데이터 현황 (2026-08-10 기준)

`scripts/quality_report.py` 실행 결과:

- **총 place: 8,417건** (전부 종로구)
  - source별: REDTABLE 7,899 / FILMING_LOCATION 420 / TOURAPI 224 / SEOUL_TOUR 151 (한 place가 여러 소스에 걸칠 수 있어 합계는 총 place 수보다 큼)
  - category별: RESTAURANT 5,379 / ETC 1,831 / CAFE 844 / ATTRACTION 171 / DESSERT 102 / CULTURE 53 / SHOPPING 37
  - tag별: FILMING_LOCATION 420
- **좌표 없는 place: 0건** (좌표 없으면 애초에 place를 안 만들어서)
- 운영시간 없는 place: 8,277건 / 이미지 없는 place: 7,987건 / 전화번호 없는 place: 2,059건
- `place_image`: 1,768건, `place_operating_hours`: 980행
- **촬영지-작품 연결(`filming_location`)**: 765건 — AUTO_MATCH 717 / REVIEW_REQUIRED 48(전부 artist, 매칭 대상 아님)
- **`media_content`**: 318건(tv 311 / movie 7)
- **`person`**: 2,545명, **`media_credit`**: CAST 4,765 / DIRECTOR 319
- **`event`**: 90건(전부 SEOUL_CULTURE_EVENT, 진행중/예정 필터링됨)
- **검토 대기(REVIEW_REQUIRED) 잔여**: FILMING_LOCATION 116 / REDTABLE 418 / SEOUL_TOUR 18 / TOURAPI 6 — `data/processed/*_review_required.jsonl`에서 확인 가능

## 알려진 데이터 품질 이슈

- **운영시간 커버리지가 낮음**(8,277/8,417 place가 구조화된 운영시간 없음) — 원문 텍스트가 애매하면(예: 여러 시간대 병기, 요일 표현 불명확) 구조화를 포기하고 원문만 보존하는 원칙 때문. 이미지도 마찬가지로 커버리지가 낮음(소스가 이미지를 안 주는 경우가 많음)
- **REVIEW_REQUIRED 잔여 558건**(FILMING_LOCATION 116 + REDTABLE 418 + SEOUL_TOUR 18 + TOURAPI 6)은 사람 검토가 필요한 상태로 아직 처리 안 됨
- **서울시 문화행사 정보의 place 연결률이 낮음**(90건 중 4건만) — venue_name이 "OO 대극장"처럼 상위 시설의 세부 공간명이라 정확 일치 매칭이 잘 안 됨. place 테이블에 세부 공간 단위까지 확장하거나 유사 매칭 로직을 추가하면 개선 가능(현재는 오매칭 위험 때문에 보류)
- **TMDB 매칭은 제목 유사도만으로 판단**(CSV에 방영연도 없음) — 임계값 0.90으로 보수적으로 잡았지만, 동명이작(같은 제목의 다른 작품)이 있으면 오매칭 가능성이 이론상 존재함(현재까진 발견 안 됨)

## 설정

`.env.example`을 복사해 `.env`를 만들고 아래 값을 채운다(`.env`는 gitignore됨, 절대 커밋 금지).

```
NAVER_API_HUB_CLIENT_ID=      # 예약(현재 미사용, Naver Blog 연동 보류 상태)
NAVER_API_HUB_CLIENT_SECRET=
KAKAO_REST_API_KEY=           # 관광명소 지오코딩용
TOUR_API_KEY=                 # 한국관광공사 TourAPI(공공데이터포털)
REDTABLE_API_KEY=
TMDB_API_KEY=                 # themoviedb.org에서 발급
SEOUL_OPENAPI_KEY=            # data.seoul.go.kr 인증키(서울시 문화행사 정보용)
SEOUL_TOUR_CSV_PATH=          # 서울시 관광명소 CSV 로컬 경로
FILMING_LOCATION_CSV_PATH=    # 촬영지 CSV 로컬 경로
DATABASE_URL=postgresql://postgres:{비밀번호}@localhost:5432/ddemachim
```

DB 스키마 최초 적용:

```bash
psql -U postgres -d ddemachim -f src/db/schema.sql
psql -U postgres -d ddemachim -f src/db/migrate_filming_location_category_to_tag.sql
```

(`CREATE TABLE IF NOT EXISTS` 기반이라 재실행해도 안전하지만, 컬럼 추가 등은 별도 `ALTER TABLE`로 처리된 이력이 있어 기존 DB에 재적용 시 일부 컬럼은 수동 확인 필요)

## 실행

```bash
python scripts/run_redtable.py
python scripts/run_tourapi.py
python scripts/run_seoul_tour.py
python scripts/run_filming_location.py
python scripts/backfill_filming_media.py       # TMDB 작품 매칭
python scripts/backfill_media_credits.py       # TMDB 배우/감독
python scripts/run_events.py                   # TourAPI 축제/공연/행사
python scripts/run_seoul_culture_event.py      # 서울시 문화행사 정보
python scripts/quality_report.py               # 전체 통계 리포트
```

### 블로그 장소 트렌드 7단계 파이프라인

기존 `blog_trend_pilot.py`는 검색/본문 파일럿 호환용으로 유지하고, 후속
검증·집계·리포트는 [`scripts/blog_trend_pipeline.py`](scripts/blog_trend_pipeline.py)가
순서대로 orchestration한다.

```bash
# 공개 extracted-places artifact만 사용한 계약/입력 dry-run
python3 scripts/blog_trend_pipeline.py \
  --input /private/tmp/ddemachim-live-pilot/extracted-places_20260812T042424Z.json \
  --dry-run

# 일반 반복 실행: Kakao 키가 없으면 validation만 unavailable로 기록하고
# 나머지 로컬 단계와 관리자 review 리포트는 계속 생성한다.
python3 scripts/blog_trend_pipeline.py \
  --input results/blog_place_pilot/extracted-places_20260812T042328Z.json

# Naver Search Trend를 사용할 때만 명시적으로 네트워크 호출
python3 scripts/blog_trend_pipeline.py \
  --input results/blog_place_pilot/extracted-places_20260812T042328Z.json \
  --fetch-trend
```

실행 순서는 `1 Kakao Local 검증 → 2 raw 선별 점수 → 3 검증 ID 기준
7일/이전 28일 집계 → 4 JSONL snapshot → 5 Search Trend 상대 ratio →
6 반복 화제어 후보 → 7 JSON+TXT 최종 리포트`다. 각 단계는
`--stage validate|select|aggregate|snapshot|trend|topics|report`로 진입할 수
있고, `--dry-run`은 인증키·네트워크·snapshot append를 하지 않는다.

Kakao client는 프로세스 `KAKAO_REST_API_KEY`만 읽고, Search Trend client는
`NAVER_SEARCH_TREND_CLIENT_ID`/`NAVER_SEARCH_TREND_CLIENT_SECRET`를 우선
사용한다(`NAVER_CLIENT_*`, 기존 `NAVER_API_HUB_CLIENT_*`도 호환 fallback).
새 client들은 `.env`를 자동 로드하지 않으며 키 값과 API 원문 응답은 출력/저장하지
않는다. 키가 없으면 해당 live 단계는 `unavailable`로 명시된다.

기본 결과는 `results/blog_trend_pipeline/`에 저장된다.

- `kakao-validation_*.json`: `matched`, `category_mismatch`, `location_mismatch`, `ambiguous`, `not_found`, `error`
- `selection_*.json`, `metrics_*.json`, `topics_*.json`, `naver-trend_*.json`
- `blog-post-snapshots.jsonl`: schema v1, append-only, `(collected_at, query, link)` idempotency
- `final-report_*.json`와 `final-report_*.txt`: 기준일·근거·상태를 보존하며 관리자 `review_required` 상태를 유지

최종 기본 기준은 local validation `matched`, 최근 unique link ≥ 3,
blogger ≥ 3, weekly-average growth ≥ 2x, absolute delta ≥ 2다. Search Trend
ratio는 절대량이 아닌 상대값이며 corroboration으로만 사용한다. prior가 0이면
`new_candidate`로 분리하고 growth를 임의로 계산하지 않는다. 광고 표현은
title/description의 관찰 가능한 signal/penalty만 남기며 광고라고 확정하지
않는다. 고정 메뉴 목록 대신 장소명·지역명을 제외한 한국어 토큰/구문과
unique blogger support ≥ 3만 evidence term으로 저장한다.

모든 스크립트는 `--dry-run` 옵션으로 DB 적재 없이 통계만 미리 확인 가능(`run_seoul_tour.py`, `run_filming_location.py` 등 일부는 옵션 유무가 다를 수 있어 `--help`로 확인).

## 스케줄러(주기 수집)

기간이 있는 이벤트 데이터는 Windows 작업 스케줄러로 주간 자동 재수집 설정됨(`schtasks /Query /TN <이름>`으로 확인):

| 작업명 | 대상 | 주기 |
|---|---|---|
| `ddemachim_event_weekly_sync` | TourAPI 축제/공연/행사(contentTypeId=15) | 매주 월요일 06:00 |
| `ddemachim_seoul_culture_event_weekly_sync` | 서울시 문화행사 정보(OA-15486) | 매주 월요일 06:10 |

실행 로그는 `data/processed/run_events_weekly.log`, `data/processed/run_seoul_culture_event_weekly.log`에 누적됨.

## 폴더 구조

```
data-pipeline/
├── src/
│   ├── collectors/     # 소스별 API/CSV 수집
│   ├── cleaners/       # 공통 정제 유틸(텍스트/전화번호/좌표/주소)
│   ├── normalizers/    # 소스별 원본 → DTO 변환
│   ├── matchers/        # 중복 place 판별, TMDB 작품 매칭
│   ├── loaders/         # DTO → DB 적재(idempotent upsert)
│   ├── config/           # 카테고리 매핑 테이블
│   ├── db/               # 스키마, 커넥션, source_raw_data 기록
│   ├── models/            # DTO 정의
│   └── utils/              # 로깅, HTTP 재시도
├── data/
│   ├── raw/             # 원본 API/CSV 응답 파일
│   ├── staging/           # (예약)
│   └── processed/         # 리뷰 대기 목록, 품질 리포트, 실행 로그
├── scripts/               # 실행 진입점(run_*.py, backfill_*.py, quality_report.py)
└── tests/
```
