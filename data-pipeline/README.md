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

### 블로그 장소 트렌드 6단계 파이프라인

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
6 JSON+TXT 최종 리포트`다. 각 단계는
`--stage validate|select|aggregate|snapshot|trend|report`로 진입할 수
있고, `--dry-run`은 인증키·네트워크·snapshot append를 하지 않는다.

Kakao client는 프로세스 `KAKAO_REST_API_KEY`만 읽는다. Search Trend client는
`NAVER_API_HUB_CLIENT_ID`/`NAVER_API_HUB_CLIENT_SECRET`가 있으면 API HUB
endpoint/header 계약을 사용하고, legacy `NAVER_SEARCH_TREND_*` 또는
`NAVER_CLIENT_*` 쌍은 기존 endpoint 호환용으로만 사용한다.
새 client들은 `.env`를 자동 로드하지 않으며 키 값과 API 원문 응답은 출력/저장하지
않는다. 키가 없으면 해당 live 단계는 `unavailable`로 명시된다.

기본 결과는 `results/blog_trend_pipeline/`에 저장된다.

- `kakao-validation_*.json`: `matched`, `category_mismatch`, `location_mismatch`, `ambiguous`, `not_found`, `error`
- `selection_*.json`, `metrics_*.json`, `naver-trend_*.json`
- `blog-post-snapshots.jsonl`: schema v1, append-only, `(collected_at, query, link)` idempotency
- `final-report_*.json`와 `final-report_*.txt`: 기준일·근거·상태를 보존하며 관리자 `review_required` 상태를 유지

위 6단계 파일럿의 기본 기준은 local validation `matched`, 최근 unique link ≥ 3,
blogger ≥ 3, weekly-average growth ≥ 2x, absolute delta ≥ 2다. Search Trend
ratio는 절대량이 아닌 상대값이며 corroboration으로만 사용한다. prior가 0이면
`new_candidate`로 분리하고 growth를 임의로 계산하지 않는다. 광고 표현은
title/description의 관찰 가능한 signal/penalty만 남기며 광고라고 확정하지
않는다. 고정 메뉴 목록 대신 장소명·지역명을 제외한 한국어 토큰/구문과
unique blogger support ≥ 3만 evidence term으로 저장한다.

### 반복 관측 기반 장소 발굴

[`scripts/repeated_blog_trend.py`](scripts/repeated_blog_trend.py)는 위 파일럿에서
검증된 본문 지도 추출, 대표 장소 선택, 네이버 지도 주소의 종로구 확인, Naver API
HUB Search Trend를 재사용하면서 여러 query와 여러 수집일의 evidence를 누적한다.

이 시스템은 **네이버 전체 블로그 게시물 수나 전체 언급 증가율을 측정하지
않는다.** 검색 API가 반환한 관측 표본에서 서로 다른 작성자, 검색어, 수집일에
같은 장소가 반복적으로 나타나는지 확인한다. 따라서 결과를 "네이버 전체
블로그에서 3배 증가"와 같이 표현하면 안 된다.

데이터별 역할은 다음과 같다.

- Naver Blog Search: 장소 discovery와 social evidence 관측
- 공개 블로그 본문 `v2_map`: 구조화된 장소 근거 추출
- Naver `v2_map` place ID: 동일 지도 장소의 안정적인 식별자
- 지도 주소: `종로구` 장소만 수집하는 지역 경계
- Naver Search Trend: 절대 검색량이 아닌 검색 관심 상승 보조 신호
- 반복 수집: 동일 게시물의 재노출과 여러 날짜에 걸친 지속성 관측

설정은 [`config/blog_trend_discovery.json`](config/blog_trend_discovery.json)에
있다. 기본 실행은 안국·서촌·익선동·삼청동·혜화·부암동·서순라길·창신동·동묘
9개 대표 지역마다 `카페`, `맛집` query를 각각 1개씩 만들어 총 18개를
수집한다. 북촌·경복궁·종로3가·대학로·종묘·숭인동 등 canonical alias는
지역 그룹 metadata와 집계에만 사용하며 같은 날 별도 query를 만들지 않는다.
query당 최대 500개 metadata를 Naver Blog Search의 `display=100` 제한에 맞춰
`start=1,101,201,301,401` 다섯 페이지로 수집한다. 전체 unique post 중
relevance·cross-query 우선순위로 최대 500개 본문을 조회하고, 후보가 있는 각
지역에 최대 2개를 먼저 배정한다. `authorCap=0`은 무제한이며, 동일 작성자의
서로 다른 URL도 `uniquePosts` 근거에서 제외하지 않는다.

```bash
# query, 최대 metadata, 본문 조회 상한만 확인; 인증·네트워크·파일 쓰기 없음
python3 scripts/repeated_blog_trend.py --date 2026-08-13 --dry-run

# 작은 파일럿
python3 scripts/repeated_blog_trend.py \
  --date 2026-08-13 \
  --regions 안국 서촌 \
  --results-per-query 500 \
  --body-limit 500

# 다음 날 같은 명령을 실행하면 기존 기록을 덮어쓰지 않고 observation을 추가한다.
python3 scripts/repeated_blog_trend.py \
  --date 2026-08-14 \
  --regions 안국 서촌 \
  --results-per-query 500 \
  --body-limit 500
```

`search-observations.jsonl`의 idempotency key는
`(collectionDate, query, postUrl)`이다. `place-evidence.jsonl`에는 주소에서
`종로구`가 확인된 네이버 지도 관측과
`NAVER_MAP:<placeId>` 식별자를 저장한다. 동일 URL이 여러 query에
나오면 `uniquePosts=1`, `uniqueQueries=N`이며, 다음 날 다시 나오면 새 게시글로
세지 않고 `collectionDays`가 증가한다. `searchRank`도 원시 관측 근거로 남기지만
이를 네이버 전체의 절대 인기 순위로 해석하지 않는다. 광고 표현 역시 삭제 근거가
아니라 `isAdSuspected`와 `adSignals`로 보존해 최종 광고 의심 비율에만 사용한다.
서로 비슷한 query 문장은 독립 근거로 중복 계산하지 않는다. 상태 판정에는
`uniqueQueries` 대신 `uniqueIntentCategories`를 사용한다. 블로그 지도에서 읽은
장소명은 `observedPlaceName`과 검색 트렌드 keyword로 사용하되 API HUB 제한에
맞춰 장소당 최대 5개로 제한한다.

본문은 `v2_map` 위치를 읽어 장소 근거만 추출한다. 본문 HTML과 본문 원문은
저장하지 않는다. Search Trend의 keyword group은 장소 대표명과 별칭을 네이버
API에 전달하기 위한 입력 계약이며 표시용 본문 키워드가 아니다.

일반 실행은 JSONL 감사 기록을 남긴 뒤 `DATABASE_URL`의 PostgreSQL에도 같은
결과를 한 트랜잭션으로 적재한다. 종로구 네이버 지도 장소는 기존 `place`와
`place_source(source=NAVER_MAP)`에 보수적으로 병합하고 다음 두 테이블을
사용한다.

- `blog_trend_observation`: 검색일·검색어·게시글 URL 단위 원시 관측과 장소·표본 근거
- `place_trend_snapshot`: 장소·기준일 단위 누적 수치, 판정 상태, Search Trend 신호

같은 날짜에 다시 실행하면 관측은 `(collection_date, query, post_url)`, 스냅샷은
`(place_id, snapshot_date)` 기준으로 UPSERT한다. DB 오류가 발생하면 트랜잭션을
롤백하고 프로세스를 실패 처리하므로
Spring 스케줄러에서도 성공으로 오인하지 않는다. 테이블을 수동 생성해야 하는
환경에서는 `src/db/add_blog_trend_tables.sql`을 적용한다. 파일 결과만 확인할 때는
명시적으로 `--skip-db`를 사용한다.

### 기존 evidence의 Search Trend 재평가

블로그를 다시 수집하지 않고 기존 run의 장소 evidence만 Naver API HUB
Search Trend로 다시 조회해야 할 때는 focused 명령을 사용한다.

```bash
python3 scripts/re_evaluate_search_trend.py \
  --input results/repeated_blog_trend/run_2026-08-13.json \
  --output results/repeated_blog_trend/run_2026-08-13_search_trend_api_hub.json
```

장소마다 대표명과 별칭을 합쳐 최대 5개 keyword를 하나의 group으로 만들고,
API HUB의 요청당 최대 5 groups 계약에 따라 모든 장소를 batch 처리한다. 한
batch의 인증·요청·결과 누락은 해당 장소에 `API_ERROR:<ErrorClass>` 또는
`MISSING_RESPONSE` 같은 명시적 `reason`으로
기록하며 `trend_missing`으로 숨기지 않는다.

재평가는 `timeUnit=month`로 기준일과 직전 완료 3개월을 함께 조회한다. 예를
들어 기준일이 2026-08-13이면 조회 범위는 `2026-05-01..2026-08-13`이고,
응답의 월별 `ratio`는 해당 월의 포함 일수로 나눠 월별 일평균 상대 검색
관심도로 보정한다. 완료 월은 달력 일수, 현재 월은 `as_of.day`를 사용한다.
`baseline`은 직전 완료 3개월 보정값 평균, `current`는 현재 월 보정값,
`ratio=current/baseline`이다. `ratio>=2.0`이면 `SURGING`, baseline이 0이고
current가 양수면 `NEWLY_EMERGING`, baseline이 양수이고 ratio가 2 미만이면
`STABLE`, 둘 다 0이면 `INSUFFICIENT_DATA`다. 유효 관측일 최소 조건은
적용하지 않는다.

이 값은 절대 검색량이 아니라 Naver API HUB의 상대적 검색 관심도 지수다.
`trend.rising`은 기존 `WATCH`/`TRENDING` 호환을 위해 `SURGING` 또는
`NEWLY_EMERGING`일 때만 true로 저장한다. 재평가 결과는 JSON의 `searchTrend`,
각 evidence의 `trend`에 `monthValues`, `partialMonthAdjusted`,
`baselineMonths=3`, `comparisonLabel`을 남기고, 같은 값을
`place_trend_snapshot`의 월간 상태·ratio·window 컬럼에 idempotent upsert한다.

이 파이프라인의 기본 검색 의도는 대표 지역의 `카페`·`맛집` 발견으로
고정한다. 수집 날짜에 따라 query를 바꾸지 않으며, 이벤트성 발견은
별도 파이프라인과 데이터 계약에서 처리한다.

본문 표본은 활성 검색어마다 균등하게 배정한다. 기본 18개 검색어와 본문 상한
500개에서는 검색어별 27~28개의 고유 게시글을 선택한다. 같은 URL이 여러
검색어에 노출돼도 하나의 검색어 표본에만 배정하고 본문은 한 번만 조회한다.

```text
검색어별 언급률 = 해당 검색어 표본에서 장소가 확인된 고유 글 수 / 실제 본문 표본 수
장소 상대 언급률 = 장소가 확인된 검색어별 언급률의 평균
```

`relativeMentionRate`, `sampledMentionPosts`, `sampledAuthorCount`, `sampledQueryCount`,
`queryMentionRates`는 결과 JSON과 `place_trend_snapshot`에 저장한다. 절대
게시글·작성자 수는 순위가 아니라 최소 2개 게시글·2명 작성자 신뢰도 검증과
감사 근거로만 보존한다.

```bash
python3 scripts/repeated_blog_trend.py \
  --date 2026-08-13 \
  --regions 안국 서촌 \
  --results-per-query 500 \
  --body-limit 500 \
  --skip-db
```

상태는 설정 가능한 threshold로 판정한다.

- `INSUFFICIENT_EVIDENCE`: 실제 장소는 확인됐지만 독립 근거가 부족함
- `WATCH`: 작성자·intent category·수집일·검색 관심 상승 신호 중 설정된 개수 이상 충족
- `TRENDING`: 작성자, intent category, 수집일, 최근 게시글, 검색 관심 상승, 광고 의심 비율 기준을 모두 충족

Search Trend는 상대값이므로 임의의 절대 floor를 적용하지 않는다. 대신 이전
28일의 0보다 큰 관측이 7개 이상, 최근 7일의 0보다 큰 관측이 3개 이상일 때만
최근 평균/이전 평균 배율을 평가한다. 현재 설정에서는 이 배율이 2.0 이상이어야
상승 보조 신호가 된다. 내부 결과에는 `uniquePosts`, `uniqueAuthors`,
`uniqueQueries`, `uniqueIntentCategories`, `aliases`, `collectionDays`,
`recentObservedPosts`, `averageObservedRank`, 관측 시각, `adSuspectedRatio`와 원시
evidence를 함께 보존한다.

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
