-- 원본 배역명을 보존하면서 한국식 로마자 인명의 한글 표시명을 저장한다.
ALTER TABLE media_credit
    ADD COLUMN IF NOT EXISTS character_name_ko varchar(200);
