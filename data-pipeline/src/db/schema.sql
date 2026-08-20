-- ddemachim 장소 마스터 스키마
-- 이 파일은 참고/수동 적용용 DDL이다. 실제 스키마 소유권은 BE(Spring Data JPA, ddl-auto)에 있으므로
-- 운영 환경에서는 BE 엔티티가 테이블을 생성한다. data-pipeline은 이 구조를 전제로 INSERT/UPSERT만 한다.
-- 로컬 개발 중 BE 엔티티가 아직 없을 때 data-pipeline을 단독으로 테스트하기 위해 이 파일로 수동 적용 가능.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- 종로구 50 m 혼잡도 격자
CREATE TABLE IF NOT EXISTS crowding_grid (
    id                  bigserial PRIMARY KEY,
    grid_code           varchar(64) UNIQUE NOT NULL,
    grid_x              integer NOT NULL,
    grid_y              integer NOT NULL,
    geometry            geometry(Polygon, 4326) NOT NULL,
    center_latitude     double precision NOT NULL,
    center_longitude    double precision NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_crowding_grid_coordinates UNIQUE (grid_x, grid_y)
);

CREATE INDEX IF NOT EXISTS idx_crowding_grid_geometry
    ON crowding_grid USING gist (geometry);

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
    image_url           text,
    image_source        varchar(30),
    image_attribution   text,
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
    source          varchar(30) NOT NULL,   -- TOURAPI / REDTABLE / SEOUL_TOUR / FILMING_LOCATION / NAVER_MAP
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

-- 로그인 회원
CREATE TABLE IF NOT EXISTS member (
    member_id       bigserial PRIMARY KEY,
    email           varchar(254) NOT NULL UNIQUE,
    password        varchar(100) NOT NULL,
    nickname        varchar(30) NOT NULL UNIQUE,
    role            varchar(20) NOT NULL
);

-- 로그인 회원이 외부 검색 제공자에서 직접 담은 장소
CREATE TABLE IF NOT EXISTS user_place (
    id                  bigserial PRIMARY KEY,
    member_id           bigint NOT NULL REFERENCES member(member_id) ON DELETE CASCADE,
    provider            varchar(20) NOT NULL,
    provider_place_id   varchar(100) NOT NULL,
    name                varchar(200) NOT NULL,
    category_name       varchar(300),
    category_group_code varchar(20),
    road_address        text,
    lot_address         text,
    longitude           double precision NOT NULL,
    latitude            double precision NOT NULL,
    phone               varchar(50),
    place_url           text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_place_longitude
        CHECK (longitude BETWEEN -180.0 AND 180.0),
    CONSTRAINT chk_user_place_latitude
        CHECK (latitude BETWEEN -90.0 AND 90.0),
    CONSTRAINT uq_user_place_member_provider_place
        UNIQUE (member_id, provider, provider_place_id)
);

CREATE INDEX IF NOT EXISTS idx_user_place_member_id
    ON user_place (member_id);

-- 로그인 회원별 코스 장바구니의 장소 항목
CREATE TABLE IF NOT EXISTS course_basket_item (
    id              bigserial PRIMARY KEY,
    member_id       bigint NOT NULL REFERENCES member(member_id) ON DELETE CASCADE,
    place_id        bigint REFERENCES place(id) ON DELETE CASCADE,
    user_place_id   bigint REFERENCES user_place(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_course_basket_item_exactly_one_place
        CHECK (
            (place_id IS NOT NULL AND user_place_id IS NULL)
            OR (place_id IS NULL AND user_place_id IS NOT NULL)
        ),
    CONSTRAINT uq_course_basket_item_member_place
        UNIQUE (member_id, place_id),
    CONSTRAINT uq_course_basket_item_member_user_place
        UNIQUE (member_id, user_place_id)
);

CREATE INDEX IF NOT EXISTS idx_course_basket_item_member_id
    ON course_basket_item (member_id);

CREATE INDEX IF NOT EXISTS idx_course_basket_item_user_place_id
    ON course_basket_item (user_place_id);

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

-- 네이버 블로그 추세 수집의 주간 논리 실행. 검색 표본이나 중간 근거는 저장하지 않는다.
CREATE TABLE IF NOT EXISTS blog_trend_run (
    id                    bigserial PRIMARY KEY,
    run_week              date NOT NULL,
    status                varchar(10) NOT NULL,
    started_at            timestamptz NOT NULL,
    finished_at           timestamptz,
    processed_place_count integer NOT NULL DEFAULT 0,
    result_count          integer NOT NULL DEFAULT 0,
    failure_reason        text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_blog_trend_run_status
        CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    CONSTRAINT chk_blog_trend_run_processed_place_count
        CHECK (processed_place_count >= 0),
    CONSTRAINT chk_blog_trend_run_result_count
        CHECK (result_count >= 0),
    CONSTRAINT uq_blog_trend_run_week UNIQUE (run_week)
);

CREATE INDEX IF NOT EXISTS idx_blog_trend_run_week
    ON blog_trend_run (run_week DESC);

-- 프론트엔드 Naver Search Trend 표시에 필요한 장소별 최종 결과만 보존한다.
CREATE TABLE IF NOT EXISTS place_trend_result (
    id                       bigserial PRIMARY KEY,
    run_id                   bigint NOT NULL REFERENCES blog_trend_run(id) ON DELETE CASCADE,
    place_id                 bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    status                   varchar(10) NOT NULL,
    recent_interest_average  double precision,
    previous_interest_average double precision,
    interest_change_percent double precision,
    measured_at              timestamptz NOT NULL,
    expires_at               timestamptz NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_place_trend_result_status
        CHECK (status IN ('WATCH', 'TRENDING')),
    CONSTRAINT uq_place_trend_result_run_place
        UNIQUE (run_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_place_trend_result_place
    ON place_trend_result (place_id);
CREATE INDEX IF NOT EXISTS idx_place_trend_result_expiry
    ON place_trend_result (expires_at);

-- 종로구 MOCK 혼잡도 조회를 위한 EPSG:4326 50m 격자
CREATE TABLE IF NOT EXISTS crowding_grid (
    id                  bigserial PRIMARY KEY,
    grid_code           varchar(64) UNIQUE NOT NULL,
    grid_x              integer NOT NULL,
    grid_y              integer NOT NULL,
    geometry            geometry(Polygon, 4326) NOT NULL,
    center_latitude     double precision NOT NULL,
    center_longitude    double precision NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_crowding_grid_coordinates UNIQUE (grid_x, grid_y)
);

CREATE INDEX IF NOT EXISTS idx_crowding_grid_geometry
    ON crowding_grid USING gist (geometry);
