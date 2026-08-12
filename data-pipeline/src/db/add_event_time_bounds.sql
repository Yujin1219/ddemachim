-- Add nullable structured time bounds while preserving the original event_time text.
ALTER TABLE event
    ADD COLUMN IF NOT EXISTS event_start_time time;

ALTER TABLE event
    ADD COLUMN IF NOT EXISTS event_end_time time;
