-- ddemachim 장소 마스터 스키마
-- 이 파일은 참고/수동 적용용 DDL이다. 실제 스키마 소유권은 BE(Spring Data JPA, ddl-auto)에 있으므로
-- 운영 환경에서는 BE 엔티티가 테이블을 생성한다. data-pipeline은 이 구조를 전제로 INSERT/UPSERT만 한다.
-- 로컬 개발 중 BE 엔티티가 아직 없을 때 data-pipeline을 단독으로 테스트하기 위해 이 파일로 수동 적용 가능.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- 내부 표준 카테고리
CREATE TABLE IF NOT EXISTS place_category (
    id              bigserial PRIMARY KEY,
    code            varchar(30) NOT NULL UNIQUE, -- RESTAURANT, CAFE, DESSERT, ATTRACTION, CULTURE, EXHIBITION, SHOPPING, POPUP, PARK, WALK, PHOTO_SPOT, ETC
    label_ko        varchar(50) NOT NULL
);

-- 장소 마스터
CREATE TABLE IF NOT EXISTS place (
    id                  bigserial PRIMARY KEY,
    name                varchar(200) NOT NULL,
    normalized_name     varchar(200) NOT NULL,
    category_id         bigint REFERENCES place_category(id),
    road_address        text,
    lot_address         text,
    district            varchar(30),           -- 예: 종로구
    neighborhood        varchar(30),           -- 예: 안국동
    location            geometry(Point, 4326),  -- nullable: 좌표 없는 소스(enrichment 전용)는 null
    phone               varchar(50),
    website             text,
    description         text,
    -- 아래 4개는 구조화 파싱이 어려운 원문을 그대로 보존하는 용도(예: 서울시 관광명소의
    -- 운영시간/휴무일 자유서식 텍스트). 요일별 구조화 값은 place_operating_hours에 별도로 둔다.
    operating_hours_raw text,
    operating_days_raw  text,
    closed_days_raw     text,
    transit_info        text,
    accessibility       text,
    tags                text[],
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_place_location ON place USING gist (location);
CREATE INDEX IF NOT EXISTS idx_place_normalized_name ON place (normalized_name);
CREATE INDEX IF NOT EXISTS idx_place_district ON place (district);

-- 외부 데이터 출처 추적 (place PK를 외부 ID로 쓰지 않기 위한 매핑)
CREATE TABLE IF NOT EXISTS place_source (
    id              bigserial PRIMARY KEY,
    place_id        bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    source          varchar(30) NOT NULL,   -- TOURAPI / REDTABLE / SEOUL_TOUR / FILMING_LOCATION
    source_id       varchar(100) NOT NULL,  -- 원본 시스템의 raw id (문자열로 통일)
    has_coordinates boolean NOT NULL,
    last_synced_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_place_source_place_id ON place_source (place_id);

-- 요일별 운영시간
CREATE TABLE IF NOT EXISTS place_operating_hours (
    id              bigserial PRIMARY KEY,
    place_id        bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    day_of_week     smallint NOT NULL, -- 0=월 .. 6=일
    open_time       time,
    close_time      time,
    is_closed       boolean NOT NULL DEFAULT false,
    UNIQUE (place_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_place_operating_hours_place_id ON place_operating_hours (place_id);

-- 장소 이미지
CREATE TABLE IF NOT EXISTS place_image (
    id              bigserial PRIMARY KEY,
    place_id        bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    source          varchar(30) NOT NULL,
    source_url      text NOT NULL,
    attribution     text
);

CREATE INDEX IF NOT EXISTS idx_place_image_place_id ON place_image (place_id);

-- 전시/축제/행사/팝업 (기간이 있는 이벤트)
CREATE TABLE IF NOT EXISTS event (
    id              bigserial PRIMARY KEY,
    place_id        bigint REFERENCES place(id) ON DELETE SET NULL,
    title           varchar(300) NOT NULL,
    event_type      varchar(30), -- EXHIBITION / FESTIVAL / POPUP 등
    start_date      date,
    end_date        date,
    source          varchar(30) NOT NULL,
    source_id       varchar(100) NOT NULL,
    -- 아래는 서울시 문화행사 정보(OA-15486) 연동 시 추가된 컬럼. place_id가 없어도(장소 매칭 실패)
    -- 행사 자체 정보는 표시할 수 있어야 해서 장소명/좌표를 이 테이블에도 원문으로 들고 있는다.
    venue_name      text, -- 행사 장소명 원문(PLACE)
    org_name        varchar(200), -- 주최/주관 기관명
    use_target      text, -- 이용 대상
    use_fee         text, -- 이용 요금 원문(구조화 안 함 — 요금 표가 다양해서 텍스트로만 보존)
    inquiry         text, -- 문의처
    homepage_url    text, -- 행사 자체 홈페이지
    main_image      text, -- 대표 이미지 URL
    apply_date      date, -- 신청일(RGSTDATE)
    event_time      text, -- 행사 시간 원문(PRO_TIME, "19:30"처럼 구조화 안 된 값도 있어 텍스트로 보존)
    detail_url      text, -- 서울문화포털 상세 페이지 URL(HMPG_ADDR)
    location        geometry(Point, 4326), -- 행사 좌표(LOT=경도, LAT=위도)
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_event_place_id ON event (place_id);

-- 영화/드라마 작품 메타데이터 (TMDB)
CREATE TABLE IF NOT EXISTS media_content (
    id              bigserial PRIMARY KEY,
    tmdb_id         integer NOT NULL,
    media_type      varchar(10) NOT NULL, -- movie / tv
    title           varchar(300) NOT NULL,
    original_title  varchar(300),
    poster_path     text,
    overview        text,
    release_date    date,
    UNIQUE (tmdb_id, media_type)
);

-- 촬영지 <-> 작품 N:M, 매칭 신뢰도 포함
CREATE TABLE IF NOT EXISTS filming_location (
    id                  bigserial PRIMARY KEY,
    place_id            bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    media_content_id    bigint REFERENCES media_content(id) ON DELETE SET NULL, -- null이면 TMDB 매칭 전
    match_confidence    numeric(4,3),  -- 0.000 ~ 1.000, null이면 미계산
    match_status        varchar(20) NOT NULL DEFAULT 'REVIEW_REQUIRED', -- AUTO_MATCH / REVIEW_REQUIRED / NO_MATCH
    source              varchar(30) NOT NULL,
    source_id           varchar(100) NOT NULL,
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_filming_location_place_id ON filming_location (place_id);
CREATE INDEX IF NOT EXISTS idx_filming_location_media_content_id ON filming_location (media_content_id);

-- 배우/감독 등 인물 (TMDB person_id로 중복 방지)
CREATE TABLE IF NOT EXISTS person (
    id              bigserial PRIMARY KEY,
    tmdb_person_id  integer NOT NULL UNIQUE,
    name            varchar(200) NOT NULL,
    profile_path    text
);

-- media_content <-> person N:M (출연/감독)
CREATE TABLE IF NOT EXISTS media_credit (
    id                  bigserial PRIMARY KEY,
    media_content_id    bigint NOT NULL REFERENCES media_content(id) ON DELETE CASCADE,
    person_id           bigint NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    role                varchar(20) NOT NULL, -- CAST / DIRECTOR
    character_name      varchar(200), -- role=CAST일 때만
    cast_order          integer, -- role=CAST일 때만(출연 비중 순서)
    UNIQUE (media_content_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS idx_media_credit_media_content_id ON media_credit (media_content_id);
CREATE INDEX IF NOT EXISTS idx_media_credit_person_id ON media_credit (person_id);

-- 원본 데이터 보존 (raw -> staging 이전 단계 추적용)
CREATE TABLE IF NOT EXISTS source_raw_data (
    id              bigserial PRIMARY KEY,
    source          varchar(30) NOT NULL,
    endpoint        text NOT NULL,
    requested_at    timestamptz NOT NULL,
    query_condition jsonb,
    page            integer,
    raw_payload     jsonb NOT NULL,
    place_source_id bigint REFERENCES place_source(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_source_raw_data_source ON source_raw_data (source);
