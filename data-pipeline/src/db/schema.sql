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

-- 로그인 회원
CREATE TABLE IF NOT EXISTS member (
    member_id       bigserial PRIMARY KEY,
    email           varchar(254) NOT NULL UNIQUE,
    password        varchar(100) NOT NULL,
    nickname        varchar(30) NOT NULL UNIQUE,
    role            varchar(20) NOT NULL
);

-- 로그인 회원별 코스 장바구니의 장소 항목
CREATE TABLE IF NOT EXISTS course_basket_item (
    id              bigserial PRIMARY KEY,
    member_id       bigint NOT NULL REFERENCES member(member_id) ON DELETE CASCADE,
    place_id        bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (member_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_course_basket_item_member_id
    ON course_basket_item (member_id);

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
    event_start_time time, -- 원문에서 보수적으로 추출한 첫 행사 시작 시각
    event_end_time   time, -- 명시적 범위/"HH:mm까지"에서만 추출한 종료 시각
    detail_url      text, -- 서울문화포털 상세 페이지 URL(HMPG_ADDR)
    location        geometry(Point, 4326), -- 행사 좌표(LOT=경도, LAT=위도)
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_event_place_id ON event (place_id);

-- Structured schedule rows derived only from reliable event_time text. A null
-- day_of_week means every/unspecified day; source_text keeps the parser input
-- available for traceability while event.event_time remains the original field.
CREATE TABLE IF NOT EXISTS event_schedule (
    id               bigserial PRIMARY KEY,
    event_id         bigint NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    day_of_week      smallint,
    start_time       time NOT NULL,
    end_time         time,
    schedule_kind    varchar(20) NOT NULL,
    duration_minutes integer,
    source_text      text NOT NULL,
    CONSTRAINT chk_event_schedule_day_of_week
        CHECK (day_of_week IS NULL OR day_of_week BETWEEN 1 AND 7),
    CONSTRAINT chk_event_schedule_kind
        CHECK (schedule_kind IN ('OPEN_WINDOW', 'SESSION')),
    CONSTRAINT chk_event_schedule_duration
        CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    CONSTRAINT uq_event_schedule_identity UNIQUE NULLS NOT DISTINCT
        (event_id, day_of_week, start_time, end_time, schedule_kind, duration_minutes, source_text)
);

CREATE INDEX IF NOT EXISTS idx_event_schedule_event_id ON event_schedule (event_id);

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
    content_type        varchar(20) CONSTRAINT chk_filming_location_content_type
                        CHECK (content_type IN ('DRAMA', 'VARIETY', 'MOVIE')),
    scene_description   text,
    source              varchar(30) NOT NULL,
    source_id           varchar(100) NOT NULL,
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_filming_location_place_id ON filming_location (place_id);
CREATE INDEX IF NOT EXISTS idx_filming_location_media_content_id ON filming_location (media_content_id);
CREATE INDEX IF NOT EXISTS idx_filming_location_content_type ON filming_location (content_type);

-- 배우/감독 등 인물 (TMDB person_id로 중복 방지)
CREATE TABLE IF NOT EXISTS person (
    id              bigserial PRIMARY KEY,
    tmdb_person_id  integer NOT NULL UNIQUE,
    name            varchar(200) NOT NULL,
    name_ko         varchar(200),
    profile_path    text
);

-- media_content <-> person N:M (출연/감독)
CREATE TABLE IF NOT EXISTS media_credit (
    id                  bigserial PRIMARY KEY,
    media_content_id    bigint NOT NULL REFERENCES media_content(id) ON DELETE CASCADE,
    person_id           bigint NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    role                varchar(20) NOT NULL, -- CAST / DIRECTOR
    character_name      varchar(200), -- role=CAST일 때만
    character_name_ko   varchar(200), -- 한국식 로마자 인명만 한글 표시
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

-- 네이버 블로그 검색 표본에서 관측한 장소별 원시 근거. 본문 HTML/원문은 저장하지 않는다.
CREATE TABLE IF NOT EXISTS blog_trend_observation (
    id                      bigserial PRIMARY KEY,
    place_id                bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    collection_date         date NOT NULL,
    query                   varchar(300) NOT NULL,
    post_url                text NOT NULL,
    author                  text NOT NULL,
    author_name             varchar(200),
    published_at            date,
    collected_at            timestamptz NOT NULL,
    region                  varchar(50),
    intent                  varchar(100),
    intent_category         varchar(30),
    search_rank             integer,
    observed_place_name     varchar(200),
    is_ad_suspected         boolean NOT NULL DEFAULT false,
    ad_signals              text[],
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_blog_trend_observation_identity
        UNIQUE (collection_date, query, post_url)
);

CREATE INDEX IF NOT EXISTS idx_blog_trend_observation_place_date
    ON blog_trend_observation (place_id, collection_date DESC);
CREATE INDEX IF NOT EXISTS idx_blog_trend_observation_author
    ON blog_trend_observation (author);

-- 해당 날짜까지 누적된 장소별 집계 스냅샷. 같은 날짜 재실행은 UPSERT하고 날짜가
-- 바뀌면 새 이력이 생성된다.
CREATE TABLE IF NOT EXISTS place_trend_snapshot (
    id                              bigserial PRIMARY KEY,
    place_id                        bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    snapshot_date                   date NOT NULL,
    status                          varchar(30) NOT NULL,
    aliases                         text[],
    unique_posts                    integer NOT NULL,
    unique_authors                  integer NOT NULL,
    unique_queries                  integer NOT NULL,
    unique_intent_categories        integer NOT NULL,
    relative_mention_rate           double precision NOT NULL DEFAULT 0,
    sampled_mention_posts           integer NOT NULL DEFAULT 0,
    sampled_author_count            integer NOT NULL DEFAULT 0,
    sampled_query_count             integer NOT NULL DEFAULT 0,
    query_mention_rates             jsonb NOT NULL DEFAULT '[]'::jsonb,
    collection_days                 integer NOT NULL,
    recent_observed_posts           integer NOT NULL,
    average_observed_rank           double precision,
    first_observed_at               timestamptz,
    latest_observed_at              timestamptz,
    ad_suspected_ratio              double precision NOT NULL,
    minimum_evidence_passed         boolean NOT NULL,
    watch_signal_count              integer NOT NULL,
    trend_available                 boolean NOT NULL,
    trend_rising                    boolean NOT NULL,
    trend_ratio                     double precision,
    recent_trend_value              double precision,
    previous_trend_value            double precision,
    recent_nonzero_observations     integer,
    baseline_nonzero_observations   integer,
    trend_reason                    varchar(80),
    trend_checked_at                timestamptz,
    trend_status                    varchar(30),
    short_ratio                     double precision,
    six_month_ratio                 double precision,
    recent_search_interest_average  double precision,
    previous_14d_search_interest_average double precision,
    six_month_baseline_search_interest_average double precision,
    recent_valid_observation_days   integer,
    previous_valid_observation_days integer,
    six_month_baseline_valid_observation_days integer,
    trend_source                    varchar(80),
    trend_recent_start              date,
    trend_recent_end                date,
    trend_previous_start            date,
    trend_previous_end              date,
    trend_baseline_start            date,
    trend_baseline_end              date,
    trend_time_unit                 varchar(10),
    trend_baseline_months           integer,
    trend_comparison_label          varchar(120),
    trend_current_month             varchar(7),
    trend_current_month_ratio       double precision,
    trend_current_value             double precision,
    trend_baseline_value            double precision,
    monthly_ratio                   double precision,
    trend_partial_month_adjusted    boolean,
    trend_partial_month_days_used   integer,
    trend_month_values              jsonb,
    trend_missing_months            text[],
    semantics                       text NOT NULL,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_place_trend_snapshot_identity
        UNIQUE (place_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_place_trend_snapshot_status_date
    ON place_trend_snapshot (status, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_place_trend_snapshot_place_date
    ON place_trend_snapshot (place_id, snapshot_date DESC);
