-- TMDB 작품의 감독 및 출연진 정보를 저장한다.
CREATE TABLE IF NOT EXISTS person (
    id              bigserial PRIMARY KEY,
    tmdb_person_id  integer NOT NULL UNIQUE,
    name            varchar(200) NOT NULL,
    name_ko         varchar(200),
    profile_path    text
);

ALTER TABLE person
    ADD COLUMN IF NOT EXISTS name_ko varchar(200);

CREATE TABLE IF NOT EXISTS media_credit (
    id                  bigserial PRIMARY KEY,
    media_content_id    bigint NOT NULL REFERENCES media_content(id) ON DELETE CASCADE,
    person_id           bigint NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    role                varchar(20) NOT NULL
                        CONSTRAINT chk_media_credit_role CHECK (role IN ('CAST', 'DIRECTOR')),
    character_name      varchar(200),
    character_name_ko   varchar(200),
    cast_order          integer,
    UNIQUE (media_content_id, person_id, role)
);

-- 초기 개발 DB에 media_credit이 먼저 생성된 경우 누락된 표시 필드를 보정한다.
ALTER TABLE media_credit
    ADD COLUMN IF NOT EXISTS character_name varchar(200),
    ADD COLUMN IF NOT EXISTS character_name_ko varchar(200),
    ADD COLUMN IF NOT EXISTS cast_order integer;

CREATE INDEX IF NOT EXISTS idx_media_credit_media_content_id
    ON media_credit (media_content_id);
CREATE INDEX IF NOT EXISTS idx_media_credit_person_id
    ON media_credit (person_id);
