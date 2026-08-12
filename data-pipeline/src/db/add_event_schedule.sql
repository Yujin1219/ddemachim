-- Idempotent event schedule model migration.
-- Rows are derived data; event_time remains the source-of-truth raw schedule text.
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
        CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

-- CREATE TABLE IF NOT EXISTS does not add a constraint to a table that was
-- created by an interrupted/older migration, so repair that case explicitly.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_event_schedule_identity'
          AND conrelid = 'event_schedule'::regclass
    ) THEN
        ALTER TABLE event_schedule
            ADD CONSTRAINT uq_event_schedule_identity UNIQUE NULLS NOT DISTINCT
            (event_id, day_of_week, start_time, end_time, schedule_kind, duration_minutes, source_text);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_event_schedule_event_id ON event_schedule (event_id);
