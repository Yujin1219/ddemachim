INSERT INTO place_category (code, label_ko) VALUES
    ('RESTAURANT', '음식점'),
    ('CAFE', '카페'),
    ('DESSERT', '디저트'),
    ('ATTRACTION', '관광지'),
    ('CULTURE', '문화시설'),
    ('EXHIBITION', '전시'),
    ('SHOPPING', '쇼핑'),
    ('POPUP', '팝업스토어'),
    ('PARK', '공원'),
    ('WALK', '산책로'),
    ('PHOTO_SPOT', '포토스팟'),
    ('ETC', '기타')
ON CONFLICT (code) DO NOTHING;
