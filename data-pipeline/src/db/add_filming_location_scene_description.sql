-- Store the original scene/place description from filming-location source data.
ALTER TABLE filming_location
    ADD COLUMN IF NOT EXISTS scene_description text;
