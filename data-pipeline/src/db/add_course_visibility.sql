ALTER TABLE course
    ADD COLUMN IF NOT EXISTS visibility varchar(20) NOT NULL DEFAULT 'PRIVATE';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_visibility'
          AND conrelid = 'course'::regclass
    ) THEN
        ALTER TABLE course
            ADD CONSTRAINT chk_course_visibility
            CHECK (visibility IN ('PUBLIC', 'PRIVATE'));
    END IF;
END
$$;
