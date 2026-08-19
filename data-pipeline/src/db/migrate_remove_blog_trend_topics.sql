-- Remove the body-topic explanation contract from an existing blog-trend schema.
-- The whole change is transactional and safe to re-run.

BEGIN;

DROP TABLE IF EXISTS place_trend_keyword;

ALTER TABLE blog_trend_observation
    DROP COLUMN IF EXISTS body_topic_candidates;

ALTER TABLE place_trend_snapshot
    DROP COLUMN IF EXISTS explanation_available;

ALTER TABLE place_trend_snapshot
    DROP COLUMN IF EXISTS explanation_summary;

ALTER TABLE place_trend_snapshot
    DROP COLUMN IF EXISTS explanation_source;

ALTER TABLE place_trend_snapshot
    DROP COLUMN IF EXISTS explanation_minimum_authors;

ALTER TABLE place_trend_snapshot
    DROP COLUMN IF EXISTS explanation_reason;

COMMIT;
