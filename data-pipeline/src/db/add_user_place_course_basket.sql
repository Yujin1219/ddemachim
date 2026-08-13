-- Store provider-backed places selected by a member without promoting them to the
-- internal place catalog.
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

ALTER TABLE course_basket_item
    ADD COLUMN IF NOT EXISTS user_place_id bigint;

ALTER TABLE course_basket_item
    ALTER COLUMN place_id DROP NOT NULL;

-- ALTER TABLE lacks ADD CONSTRAINT IF NOT EXISTS, so guard each constraint for
-- safe reruns and recovery after a partially applied migration.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_course_basket_item_user_place'
          AND conrelid = 'course_basket_item'::regclass
    ) THEN
        ALTER TABLE course_basket_item
            ADD CONSTRAINT fk_course_basket_item_user_place
            FOREIGN KEY (user_place_id) REFERENCES user_place(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_basket_item_exactly_one_place'
          AND conrelid = 'course_basket_item'::regclass
    ) THEN
        ALTER TABLE course_basket_item
            ADD CONSTRAINT chk_course_basket_item_exactly_one_place
            CHECK (
                (place_id IS NOT NULL AND user_place_id IS NULL)
                OR (place_id IS NULL AND user_place_id IS NOT NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_course_basket_item_member_user_place'
          AND conrelid = 'course_basket_item'::regclass
    ) THEN
        ALTER TABLE course_basket_item
            ADD CONSTRAINT uq_course_basket_item_member_user_place
            UNIQUE (member_id, user_place_id);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_course_basket_item_member_id
    ON course_basket_item (member_id);

CREATE INDEX IF NOT EXISTS idx_course_basket_item_user_place_id
    ON course_basket_item (user_place_id);
