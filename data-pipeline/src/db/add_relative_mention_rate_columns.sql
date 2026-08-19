ALTER TABLE place_trend_snapshot
    ADD COLUMN IF NOT EXISTS relative_mention_rate double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sampled_mention_posts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sampled_author_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sampled_query_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS query_mention_rates jsonb NOT NULL DEFAULT '[]'::jsonb;
