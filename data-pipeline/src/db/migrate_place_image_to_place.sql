BEGIN;

ALTER TABLE place
    ADD COLUMN IF NOT EXISTS image_url text,
    ADD COLUMN IF NOT EXISTS image_source varchar(30),
    ADD COLUMN IF NOT EXISTS image_attribution text;

DO $$
DECLARE
    missing_count bigint;
    mismatch_count bigint;
BEGIN
    IF to_regclass('public.place_image') IS NULL THEN
        RETURN;
    END IF;

    EXECUTE $migration$
        CREATE TEMP TABLE place_image_migration_representatives
        ON COMMIT DROP
        AS
        SELECT DISTINCT ON (pi.place_id)
               pi.place_id,
               pi.source_url,
               pi.source,
               pi.attribution,
               (p.image_url IS NULL) AS should_migrate
        FROM place_image AS pi
        JOIN place AS p ON p.id = pi.place_id
        ORDER BY pi.place_id, random()
    $migration$;

    EXECUTE $migration$
        UPDATE place AS p
        SET image_url = r.source_url,
            image_source = r.source,
            image_attribution = r.attribution
        FROM place_image_migration_representatives AS r
        WHERE p.id = r.place_id
          AND r.should_migrate
    $migration$;

    EXECUTE $validation$
        SELECT count(*)
        FROM (
            SELECT DISTINCT place_id
            FROM place_image
            WHERE source_url IS NOT NULL
        ) AS imaged_place
        JOIN place AS p ON p.id = imaged_place.place_id
        WHERE p.image_url IS NULL
    $validation$ INTO missing_count;

    IF missing_count <> 0 THEN
        RAISE EXCEPTION 'place image migration left % places without image_url', missing_count;
    END IF;

    EXECUTE $validation$
        SELECT count(*)
        FROM place_image_migration_representatives AS r
        JOIN place AS p ON p.id = r.place_id
        WHERE r.should_migrate
          AND (p.image_url IS DISTINCT FROM r.source_url
               OR p.image_source IS DISTINCT FROM r.source
               OR p.image_attribution IS DISTINCT FROM r.attribution)
    $validation$ INTO mismatch_count;

    IF mismatch_count <> 0 THEN
        RAISE EXCEPTION 'place image migration found % source/attribution mismatches', mismatch_count;
    END IF;

    DROP TABLE place_image;
END $$;

COMMIT;
