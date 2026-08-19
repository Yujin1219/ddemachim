# Place Trend Discovery Design

## Goal

Show trustworthy blog-derived place trends in the Explore tab and place detail without exposing internal scoring or unsupported claims.

## Product Rules

- The Explore section title is `요즘 이곳에서는`.
- Only `TRENDING` and `WATCH` places are visible to users.
- `INSUFFICIENT_EVIDENCE` remains stored for analysis but is hidden from the UI.
- Search-interest booleans and ratios are internal evidence and are not returned to the frontend.
- Popup/event data is not part of this feature.
- User-facing claims must be limited to repeated public-blog topics and the observation date.

## Explore UI

The Explore tab contains a horizontally scannable trend list consistent with the existing filming-location and place surfaces. Each item shows an image when available, status label, place name, district/category, one evidence-backed summary, and up to three topic keywords. Selecting an item opens the existing place detail route.

The section supports loading skeletons, a quiet empty state, and non-blocking failure behavior. Failure to load trends must not prevent the rest of Explore from working.

## Detail UI

The existing hero, place identity, operating information, congestion, filming scenes, description, reviews, and sticky actions are reused. A new `요즘 주목받는 이유` section appears only when the detail response contains a visible trend.

The trend section contains:

- A user-facing status label derived from `TRENDING` or `WATCH`.
- An evidence-backed summary generated from repeated body topics.
- Up to four topic keywords.
- A source note and snapshot date.

## API Contract

`GET /places/trends?limit=6` returns visible latest snapshots:

```json
[
  {
    "placeId": 152,
    "name": "콘웨이커피 안국점",
    "district": "종로구",
    "categoryLabel": "카페",
    "thumbnailUrl": null,
    "trend": {
      "status": "TRENDING",
      "summary": "최근 공개된 글에서는 크림커피와 조용한 분위기 이야기가 함께 나타나고 있어요.",
      "keywords": ["크림커피", "조용한 분위기"],
      "updatedAt": "2026-08-13"
    }
  }
]
```

`GET /places/{id}` adds the same nullable `trend` object. It is `null` when no visible latest snapshot exists.

## Ordering And Safety

- Use only the latest snapshot per place.
- Order `TRENDING` before `WATCH`, then newest snapshot and strongest recent observation count.
- Cap list size between 1 and 20; default to 6.
- Do not expose post URLs, author identities, internal counts, score thresholds, search ratios, or ad-detection fields.

## Verification

- Frontend component tests cover visible statuses, hidden insufficient evidence, loading, empty, and navigation.
- Backend tests cover latest-snapshot selection, ordering, response projection, limit validation, and nullable detail trend.
- Browser checks cover the Explore section and place detail at mobile and desktop widths with no overlap or horizontal page overflow.
