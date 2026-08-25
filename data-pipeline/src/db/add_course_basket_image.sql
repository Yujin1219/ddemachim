ALTER TABLE course_basket_item
    ADD COLUMN IF NOT EXISTS image_url text;

UPDATE course_basket_item basket
SET image_url = event.main_image
FROM user_place saved_place
JOIN event
  ON event.id::text = saved_place.provider_place_id
WHERE basket.user_place_id = saved_place.id
  AND saved_place.category_group_code = 'EVENT'
  AND basket.image_url IS NULL
  AND event.main_image IS NOT NULL
  AND btrim(event.main_image) <> '';
