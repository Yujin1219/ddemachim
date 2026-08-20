-- Remove only places that can be conservatively identified as blog-trend-only
-- artifacts left by the old loader ordering. Apply manually after reviewing the
-- candidate counts. This script never runs from the collector.
--
-- Candidate audit contract:
--   * tags are exactly ['BLOG_TREND'];
--   * at least one NAVER_MAP place_source exists and no other source exists;
--   * no place_trend_result, source_raw_data link, or known domain relation exists;
--   * the catalog-driven guards below exclude any other place_id column or FK
--     reference (including a future review-like relation) before deletion.

BEGIN;

-- Block new place/source links while the candidate set is audited and removed.
LOCK TABLE place IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE place_source IN SHARE ROW EXCLUSIVE MODE;

-- Exact static candidate audit query. The temporary table is dropped on commit,
-- so a second execution is idempotent and sees no already-deleted candidates.
CREATE TEMP TABLE blog_trend_place_cleanup_candidates
ON COMMIT DROP
AS
SELECT p.id
FROM place AS p
WHERE p.tags @> ARRAY['BLOG_TREND']::text[]
  AND p.tags <@ ARRAY['BLOG_TREND']::text[]
  AND cardinality(p.tags) = 1
  AND EXISTS (
      SELECT 1
      FROM place_source AS blog_source
      WHERE blog_source.place_id = p.id
        AND blog_source.source = 'NAVER_MAP'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM place_source AS non_blog_source
      WHERE non_blog_source.place_id = p.id
        AND non_blog_source.source <> 'NAVER_MAP'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM place_trend_result AS trend_result
      WHERE trend_result.place_id = p.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM source_raw_data AS raw_data
      JOIN place_source AS raw_source
        ON raw_source.id = raw_data.place_source_id
      WHERE raw_source.place_id = p.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM place_operating_hours AS operating_hours
      WHERE operating_hours.place_id = p.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM course_basket_item AS basket_item
      WHERE basket_item.place_id = p.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM event AS event_row
      WHERE event_row.place_id = p.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM filming_location AS filming_row
      WHERE filming_row.place_id = p.id
  );

SELECT 'candidate_places_before_catalog_guards' AS metric,
       count(*) AS row_count
FROM blog_trend_place_cleanup_candidates;

-- Exclude every table with a place_id column, even if an old/manual table did
-- not declare its FK. This is intentionally conservative: false exclusions are
-- safe, while a false inclusion could delete a referenced ordinary place.
DO $$
DECLARE
    table_ref record;
    reference_count bigint;
BEGIN
    FOR table_ref IN
        SELECT namespace.nspname AS table_schema,
               relation.relname AS table_name,
               attribute.attname AS column_name
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation
          ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE attribute.attname = 'place_id'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND relation.relkind IN ('r', 'p')
          AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND relation.oid <> 'public.place'::regclass
          AND relation.oid <> 'public.place_source'::regclass
          AND relation.oid <> 'public.place_trend_result'::regclass
    LOOP
        EXECUTE format(
            'SELECT count(*)
             FROM blog_trend_place_cleanup_candidates AS candidate
             JOIN %I.%I AS referencing_row
               ON referencing_row.%I = candidate.id',
            table_ref.table_schema,
            table_ref.table_name,
            table_ref.column_name
        ) INTO reference_count;

        IF reference_count > 0 THEN
            RAISE NOTICE 'excluding % candidate(s) referenced by %.%',
                reference_count, table_ref.table_schema, table_ref.table_name;
            EXECUTE format(
                'DELETE FROM blog_trend_place_cleanup_candidates AS candidate
                 USING %I.%I AS referencing_row
                 WHERE referencing_row.%I = candidate.id',
                table_ref.table_schema,
                table_ref.table_name,
                table_ref.column_name
            );
        END IF;
    END LOOP;
END $$;

-- Do not delete a place_source row while any table still points at it, even if
-- that table predates the current source_raw_data schema or lacks an FK.
DO $$
DECLARE
    table_ref record;
    reference_count bigint;
BEGIN
    FOR table_ref IN
        SELECT namespace.nspname AS table_schema,
               relation.relname AS table_name,
               attribute.attname AS column_name
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation
          ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE attribute.attname = 'place_source_id'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND relation.relkind IN ('r', 'p')
          AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND relation.oid <> 'public.place_source'::regclass
    LOOP
        EXECUTE format(
            'SELECT count(*)
             FROM blog_trend_place_cleanup_candidates AS candidate
             JOIN place_source AS source_row
               ON source_row.place_id = candidate.id
             JOIN %I.%I AS referencing_row
               ON referencing_row.%I = source_row.id',
            table_ref.table_schema,
            table_ref.table_name,
            table_ref.column_name
        ) INTO reference_count;

        IF reference_count > 0 THEN
            RAISE NOTICE 'excluding % candidate(s) whose source is referenced by %.%',
                reference_count, table_ref.table_schema, table_ref.table_name;
            EXECUTE format(
                'DELETE FROM blog_trend_place_cleanup_candidates AS candidate
                 USING place_source AS source_row,
                      %I.%I AS referencing_row
                 WHERE source_row.place_id = candidate.id
                   AND referencing_row.%I = source_row.id',
                table_ref.table_schema,
                table_ref.table_name,
                table_ref.column_name
            );
        END IF;
    END LOOP;
END $$;

-- Also guard source FKs whose child column is not literally named
-- place_source_id.
DO $$
DECLARE
    fk_ref record;
    reference_count bigint;
BEGIN
    FOR fk_ref IN
        SELECT namespace.nspname AS table_schema,
               relation.relname AS table_name,
               attribute.attname AS column_name
        FROM pg_catalog.pg_constraint AS constraint_row
        JOIN pg_catalog.pg_class AS relation
          ON relation.oid = constraint_row.conrelid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
         AND attribute.attnum = constraint_row.conkey[1]
        WHERE constraint_row.contype = 'f'
          AND constraint_row.confrelid = 'public.place_source'::regclass
          AND array_length(constraint_row.conkey, 1) = 1
          AND array_length(constraint_row.confkey, 1) = 1
          AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND relation.oid <> 'public.place_source'::regclass
    LOOP
        EXECUTE format(
            'SELECT count(*)
             FROM blog_trend_place_cleanup_candidates AS candidate
             JOIN place_source AS source_row
               ON source_row.place_id = candidate.id
             JOIN %I.%I AS referencing_row
               ON referencing_row.%I = source_row.id',
            fk_ref.table_schema,
            fk_ref.table_name,
            fk_ref.column_name
        ) INTO reference_count;

        IF reference_count > 0 THEN
            RAISE NOTICE 'excluding % candidate(s) whose source is referenced by FK %.%',
                reference_count, fk_ref.table_schema, fk_ref.table_name;
            EXECUTE format(
                'DELETE FROM blog_trend_place_cleanup_candidates AS candidate
                 USING place_source AS source_row,
                      %I.%I AS referencing_row
                 WHERE source_row.place_id = candidate.id
                   AND referencing_row.%I = source_row.id',
                fk_ref.table_schema,
                fk_ref.table_name,
                fk_ref.column_name
            );
        END IF;
    END LOOP;
END $$;

-- Also guard FKs whose child column is not literally named place_id.
DO $$
DECLARE
    fk_ref record;
    reference_count bigint;
BEGIN
    FOR fk_ref IN
        SELECT namespace.nspname AS table_schema,
               relation.relname AS table_name,
               attribute.attname AS column_name
        FROM pg_catalog.pg_constraint AS constraint_row
        JOIN pg_catalog.pg_class AS relation
          ON relation.oid = constraint_row.conrelid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
         AND attribute.attnum = constraint_row.conkey[1]
        WHERE constraint_row.contype = 'f'
          AND constraint_row.confrelid = 'public.place'::regclass
          AND array_length(constraint_row.conkey, 1) = 1
          AND array_length(constraint_row.confkey, 1) = 1
          AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND relation.oid <> 'public.place_source'::regclass
          AND relation.oid <> 'public.place_trend_result'::regclass
    LOOP
        EXECUTE format(
            'SELECT count(*)
             FROM blog_trend_place_cleanup_candidates AS candidate
             JOIN %I.%I AS referencing_row
               ON referencing_row.%I = candidate.id',
            fk_ref.table_schema,
            fk_ref.table_name,
            fk_ref.column_name
        ) INTO reference_count;

        IF reference_count > 0 THEN
            RAISE NOTICE 'excluding % candidate(s) referenced by FK %.%',
                reference_count, fk_ref.table_schema, fk_ref.table_name;
            EXECUTE format(
                'DELETE FROM blog_trend_place_cleanup_candidates AS candidate
                 USING %I.%I AS referencing_row
                 WHERE referencing_row.%I = candidate.id',
                fk_ref.table_schema,
                fk_ref.table_name,
                fk_ref.column_name
            );
        END IF;
    END LOOP;
END $$;

SELECT 'candidate_places_after_catalog_guards' AS metric,
       count(*) AS row_count
FROM blog_trend_place_cleanup_candidates;

SELECT 'candidate_place_sources_before_delete' AS metric,
       count(*) AS row_count
FROM place_source AS source_row
JOIN blog_trend_place_cleanup_candidates AS candidate
  ON candidate.id = source_row.place_id;

-- Delete child source rows first, then the now-unreferenced place rows.
WITH deleted_sources AS (
    DELETE FROM place_source AS source_row
    USING blog_trend_place_cleanup_candidates AS candidate
    WHERE source_row.place_id = candidate.id
    RETURNING source_row.id
)
SELECT 'place_source_rows_deleted' AS metric,
       count(*) AS row_count
FROM deleted_sources;

WITH deleted_places AS (
    DELETE FROM place AS place_row
    USING blog_trend_place_cleanup_candidates AS candidate
    WHERE place_row.id = candidate.id
    RETURNING place_row.id
)
SELECT 'place_rows_deleted' AS metric,
       count(*) AS row_count
FROM deleted_places;

SELECT 'candidate_places_after_delete' AS metric,
       count(*) AS row_count
FROM place AS place_row
JOIN blog_trend_place_cleanup_candidates AS candidate
  ON candidate.id = place_row.id;

SELECT 'candidate_place_sources_after_delete' AS metric,
       count(*) AS row_count
FROM place_source AS source_row
JOIN blog_trend_place_cleanup_candidates AS candidate
  ON candidate.id = source_row.place_id;

COMMIT;
