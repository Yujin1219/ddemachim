-- Repeated Naver Blog sample observations and daily place trend aggregates.
-- Apply after the existing place/place_source tables are available.

CREATE TABLE IF NOT EXISTS blog_trend_observation (
    id                      bigserial PRIMARY KEY,
    place_id                bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    collection_date         date NOT NULL,
    query                   varchar(300) NOT NULL,
    post_url                text NOT NULL,
    author                  text NOT NULL,
    author_name             varchar(200),
    published_at            date,
    collected_at            timestamptz NOT NULL,
    region                  varchar(50),
    intent                  varchar(100),
    intent_category         varchar(30),
    search_rank             integer,
    observed_place_name     varchar(200),
    is_ad_suspected         boolean NOT NULL DEFAULT false,
    ad_signals              text[],
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_blog_trend_observation_identity
        UNIQUE (collection_date, query, post_url)
);

CREATE INDEX IF NOT EXISTS idx_blog_trend_observation_place_date
    ON blog_trend_observation (place_id, collection_date DESC);
CREATE INDEX IF NOT EXISTS idx_blog_trend_observation_author
    ON blog_trend_observation (author);

CREATE TABLE IF NOT EXISTS place_trend_snapshot (
    id                              bigserial PRIMARY KEY,
    place_id                        bigint NOT NULL REFERENCES place(id) ON DELETE CASCADE,
    snapshot_date                   date NOT NULL,
    status                          varchar(30) NOT NULL,
    aliases                         text[],
    unique_posts                    integer NOT NULL,
    unique_authors                  integer NOT NULL,
    unique_queries                  integer NOT NULL,
    unique_intent_categories        integer NOT NULL,
    relative_mention_rate           double precision NOT NULL DEFAULT 0,
    sampled_mention_posts           integer NOT NULL DEFAULT 0,
    sampled_author_count            integer NOT NULL DEFAULT 0,
    sampled_query_count             integer NOT NULL DEFAULT 0,
    query_mention_rates             jsonb NOT NULL DEFAULT '[]'::jsonb,
    collection_days                 integer NOT NULL,
    recent_observed_posts           integer NOT NULL,
    average_observed_rank           double precision,
    first_observed_at               timestamptz,
    latest_observed_at              timestamptz,
    ad_suspected_ratio              double precision NOT NULL,
    minimum_evidence_passed         boolean NOT NULL,
    watch_signal_count              integer NOT NULL,
    trend_available                 boolean NOT NULL,
    trend_rising                    boolean NOT NULL,
    trend_ratio                     double precision,
    recent_trend_value              double precision,
    previous_trend_value            double precision,
    recent_nonzero_observations     integer,
    baseline_nonzero_observations   integer,
    trend_reason                    varchar(80),
    trend_checked_at                timestamptz,
    trend_status                    varchar(30),
    short_ratio                     double precision,
    six_month_ratio                 double precision,
    recent_search_interest_average  double precision,
    previous_14d_search_interest_average double precision,
    six_month_baseline_search_interest_average double precision,
    recent_valid_observation_days   integer,
    previous_valid_observation_days integer,
    six_month_baseline_valid_observation_days integer,
    trend_source                    varchar(80),
    trend_recent_start              date,
    trend_recent_end                date,
    trend_previous_start            date,
    trend_previous_end              date,
    trend_baseline_start            date,
    trend_baseline_end              date,
    trend_time_unit                 varchar(10),
    trend_baseline_months           integer,
    trend_comparison_label          varchar(120),
    trend_current_month             varchar(7),
    trend_current_month_ratio       double precision,
    trend_current_value             double precision,
    trend_baseline_value            double precision,
    monthly_ratio                   double precision,
    trend_partial_month_adjusted    boolean,
    trend_partial_month_days_used   integer,
    trend_month_values              jsonb,
    trend_missing_months            text[],
    semantics                       text NOT NULL,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_place_trend_snapshot_identity
        UNIQUE (place_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_place_trend_snapshot_status_date
    ON place_trend_snapshot (status, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_place_trend_snapshot_place_date
    ON place_trend_snapshot (place_id, snapshot_date DESC);
