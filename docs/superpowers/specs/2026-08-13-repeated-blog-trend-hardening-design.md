# Repeated Blog Trend Hardening Design

## Goal

Make the repeated Naver Blog sample pipeline comparable across collection days and prevent weak or correlated evidence from being labeled as a trend.

The pipeline still measures only recurrence inside collected search-result samples. It must never describe its output as total Naver Blog mentions or absolute search volume.

## Query Sampling

Each configured region produces exactly two queries per collection day:

1. A stable discovery query, `"<region> 요즘 뜨는 곳"`, that is unchanged across days.
2. One deterministic rotating query drawn from the `FOOD`, `PHOTO`, and `EVENT` pools.

The rotation advances with the collection date and remains deterministic for reruns of the same date. Similar discovery phrases are not treated as independent evidence. Raw `uniqueQueries` remains available for traceability, while classification uses `uniqueIntentCategories`.

## Body Selection

The existing total body-fetch cap and author cap remain unchanged. The relevance quota first funds up to two selections per region using round-robin region coverage. If the relevance quota or available posts is insufficient, the selector gives every region one slot before assigning a second slot.

Region-coverage selections obey the same URL deduplication and global author cap as all other buckets. Remaining slots continue through cross-query, diversity, exploration, relevance, and backfill selection.

## Place Evidence And Aliases

Every Kakao-matched evidence row stores both:

- `canonicalPlaceName`: the Kakao Local place name.
- `observedPlaceName`: the representative map name extracted from the blog post.

Aggregation emits a deduplicated `aliases` list and `uniqueIntentCategories`. Search Trend groups contain the canonical name first, followed by observed aliases, with at most five keywords as required by Naver API HUB.

## Search Trend Guard

The relative Search Trend ratio remains corroborating evidence only. The arbitrary `baselineFloor` check is removed because the API value is normalized and is not absolute search volume.

A rising signal requires all of the following:

- baseline average is greater than zero;
- at least 7 non-zero baseline observations in the previous 28-day window;
- at least 3 non-zero recent observations in the recent 7-day window;
- recent average divided by baseline average is at least `2.0`.

Failed coverage checks remain available evidence but produce `rising=false` with a specific reason. The trend summary preserves total observations, non-zero observations, relative-only semantics, and both window averages.

## Classification

`uniqueQueries` is retained in output but removed from status thresholds. `uniqueIntentCategories` replaces it in minimum, WATCH, and TRENDING checks:

- minimum evidence: at least 1 intent category;
- WATCH signal: at least 2 intent categories;
- TRENDING requirement: at least 2 intent categories.

All existing author, collection-day, recent-post, advertisement-ratio, and trend-rising checks remain in force.

## Verification

Focused tests must prove stable-plus-rotating query generation, deterministic regional selection, intent-category aggregation and classification, trend coverage rejection, non-zero trend summary counts, and canonical-name-plus-alias grouping. The complete `data-pipeline` unittest suite and a dry run must pass before completion.
