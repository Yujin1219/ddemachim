# Inline Congestion Badge Design

## Goal

Place the compact live-congestion badge beside the contextual metadata on place and event detail pages instead of giving it a separate row.

## Layout

- Place detail: render `district · category` and the point-matched congestion badge in one metadata row above the title.
- Event detail: render status, event type, and the point-matched congestion badge in the existing status row above the title.
- Use `flex-wrap` so long metadata wraps without overlap on narrow screens.
- Keep the badge's current color, copy, stale-state wording, and accessible label.

## Behavior

- Matching coordinates show one `지금/최근 + 혼잡 단계` badge.
- Unmatched or invalid coordinates show no badge and leave no empty spacing.
- List badges, map congestion rendering, the five-minute cache, and spatial matching remain unchanged.

## Verification

- A covered place shows the badge on the same metadata row as `종로구 · 카페` or its equivalent.
- A covered event shows the badge inside the status/type row.
- An uncovered detail shows no badge.
- Narrow layouts wrap cleanly without text or badge overlap.
- Frontend tests and production build pass.

## Integration Constraint

Do not stage or commit until the user reviews the completed UI.
