-- TMDB 원본 이름을 보존하면서 신뢰할 수 있는 한글 별칭을 별도로 저장한다.
ALTER TABLE person
    ADD COLUMN IF NOT EXISTS name_ko varchar(200);
