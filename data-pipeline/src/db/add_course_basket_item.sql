-- 로그인 기능이 먼저 배포되지 않은 로컬 DB에서도 재실행 가능하게 회원 테이블을 보장한다.
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
