# Blog Body Why-Trending Design

## Goal

Explain a selected trend place with shared topics found in blog body text, while keeping recurrence metrics internal and avoiding claims about all Naver Blog posts.

## Body Context

The body fetcher already downloads the public Naver post HTML to find `v2_map` modules. Extend that pass to collect SmartEditor paragraph blocks and map modules in document order. For a confirmed representative map, assign each text block to its nearest map module; ties prefer the following map because review text commonly precedes its map card.

Only text assigned to the representative map is eligible. If no map-position context can be identified, do not use the full body as a fallback. This prevents menu or atmosphere terms from another venue in a multi-stop post from leaking into the selected place.

The full body and context text remain transient. Persist only normalized topic candidates extracted from that context.

## Shared Topics

Reuse the existing evidence-only topic normalization and stopword removal. Aggregate each candidate by unique post URL and unique author. Repeated observations of the same post under multiple queries count once.

A public topic requires at least three unique authors by default. Sort eligible topics by author support, post support, and phrase specificity. Remove redundant subphrases when a longer phrase has equal or stronger support. Return no explanation when no term meets the minimum instead of guessing.

Do not classify topics with a fixed menu dictionary in this version. Every selected term is an observed body keyword; its text can naturally describe a menu, space, event, or experience.

## Output Contract

Every place evidence result includes:

```json
{
  "whyTrending": {
    "available": true,
    "summary": "최근 수집한 후기에서 ‘말차 크림 라떼’, ‘한옥 정원’ 이야기가 반복해서 등장해요.",
    "keywords": [
      {
        "label": "말차 크림 라떼",
        "supportPosts": 4,
        "supportAuthors": 3
      }
    ],
    "source": "MAP_ADJACENT_BLOG_BODY",
    "minimumAuthors": 3
  }
}
```

When evidence is insufficient, `available` is false, `summary` is null, `keywords` is empty, and `reason` is `not_enough_shared_body_topics`.

This explanation does not participate in WATCH or TRENDING classification. Existing recurrence, author, intent, date, advertisement, and relative Search Trend evidence continues to determine status.

## Verification

Tests must prove that map-adjacent extraction excludes a second venue, full body text is not persisted, duplicate query observations do not inflate support, three authors produce an explanation, two authors do not, and the complete data-pipeline suite still passes.
