-- Replace the old blog observation/snapshot persistence with the minimal
-- weekly run + place-result contract. This migration is intentionally scoped
-- to the obsolete trend tables; it does not touch place or unrelated tables.
-- Apply manually with psql. Do not run this file from the live collector.

BEGIN;

CREATE TABLE IF NOT EXISTS blog_trend_run (
    id                    bigserial PRIMARY KEY,
    run_week              date NOT NULL,
    status                varchar(10) NOT NULL,
    started_at            timestamptz NOT NULL,
    finished_at           timestamptz,
    processed_place_count integer NOT NULL DEFAULT 0,
    result_count          integer NOT NULL DEFAULT 0,
    failure_reason        text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_blog_trend_run_status
        CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    CONSTRAINT chk_blog_trend_run_processed_place_count
        CHECK (processed_place_count >= 0),
    CONSTRAINT chk_blog_trend_run_result_count
        CHECK (result_count >= 0),
    CONSTRAINT uq_blog_trend_run_week UNIQUE (run_week)
);

CREATE TABLE IF NOT EXISTS place_trend_result (
    id                       bigserial PRIMARY KEY,
    run_id                   bigint NOT NULL REFERENCES blog_trend_run(id) ON DELETE CASCADE,
    place_id                 bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    status                   varchar(10) NOT NULL,
    recent_interest_average  double precision,
    previous_interest_average double precision,
    interest_change_percent double precision,
    measured_at              timestamptz NOT NULL,
    expires_at               timestamptz NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_place_trend_result_status
        CHECK (status IN ('WATCH', 'TRENDING')),
    CONSTRAINT uq_place_trend_result_run_place
        UNIQUE (run_id, place_id)
);

DROP TABLE IF EXISTS place_trend_keyword;
DROP TABLE IF EXISTS place_trend_snapshot;
DROP TABLE IF EXISTS blog_trend_observation;

CREATE INDEX IF NOT EXISTS idx_blog_trend_run_week
    ON blog_trend_run (run_week DESC);
CREATE INDEX IF NOT EXISTS idx_place_trend_result_place
    ON place_trend_result (place_id);
CREATE INDEX IF NOT EXISTS idx_place_trend_result_expiry
    ON place_trend_result (expires_at);

COMMIT;
