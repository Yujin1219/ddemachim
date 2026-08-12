-- Move filming-location-ness from place_category to place.tags.
-- Idempotent manual migration for environments that already seeded FILMING_LOCATION
-- as a category before the category/tag split.

WITH etc_category AS (
    SELECT id
    FROM place_category
    WHERE code = 'ETC'
),
legacy_filming_category AS (
    SELECT id
    FROM place_category
    WHERE code = 'FILMING_LOCATION'
)
UPDATE place p
SET category_id = (SELECT id FROM etc_category),
    tags = ARRAY(
        SELECT DISTINCT merged.tag
        FROM unnest(COALESCE(p.tags, ARRAY[]::text[]) || ARRAY['FILMING_LOCATION']::text[]) AS merged(tag)
        ORDER BY merged.tag
    ),
    updated_at = now()
WHERE p.category_id = (SELECT id FROM legacy_filming_category)
  AND EXISTS (SELECT 1 FROM etc_category)
  AND EXISTS (SELECT 1 FROM legacy_filming_category);

WITH filming_places AS (
    SELECT DISTINCT place_id
    FROM filming_location
)
UPDATE place p
SET tags = ARRAY(
        SELECT DISTINCT merged.tag
        FROM unnest(COALESCE(p.tags, ARRAY[]::text[]) || ARRAY['FILMING_LOCATION']::text[]) AS merged(tag)
        ORDER BY merged.tag
    ),
    updated_at = now()
FROM filming_places fp
WHERE p.id = fp.place_id;

DELETE FROM place_category pc
WHERE pc.code = 'FILMING_LOCATION'
  AND NOT EXISTS (
      SELECT 1
      FROM place p
      WHERE p.category_id = pc.id
  );
