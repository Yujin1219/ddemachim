ALTER TABLE filming_location
    ADD COLUMN IF NOT EXISTS content_type varchar(20);

WITH latest AS (
    SELECT raw_payload
    FROM source_raw_data
    WHERE source = 'FILMING_LOCATION'
    ORDER BY requested_at DESC, id DESC
    LIMIT 1
), source_rows AS (
    SELECT row ->> '연번' AS source_id,
           CASE lower(trim(row ->> '미디어타입'))
               WHEN 'drama' THEN 'DRAMA'
               WHEN 'show' THEN 'VARIETY'
               WHEN 'movie' THEN 'MOVIE'
               ELSE NULL
           END AS content_type
    FROM latest
    CROSS JOIN LATERAL jsonb_array_elements(raw_payload -> 'rows') AS row
)
UPDATE filming_location AS fl
SET content_type = source_rows.content_type
FROM source_rows
WHERE fl.source = 'FILMING_LOCATION'
  AND fl.source_id = source_rows.source_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_filming_location_content_type'
          AND conrelid = 'filming_location'::regclass
    ) THEN
        ALTER TABLE filming_location
            ADD CONSTRAINT chk_filming_location_content_type
            CHECK (content_type IN ('DRAMA', 'VARIETY', 'MOVIE'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_filming_location_content_type
    ON filming_location (content_type);
