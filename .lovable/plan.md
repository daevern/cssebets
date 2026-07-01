
# Redesign O/U markets to line-row layout

Change Goals, Cards, and Corners tabs in `src/components/matches/MarketTabs.tsx` from stacked 2-col sections (one card per line) to a compact row-per-line layout matching the user's spec.

## Target layout (per group)

```
Total Goals
 1.5   [ Over 1.10 ]   [ Under 2.91 ]
 2.5   [ Over 1.65 ]   [ Under 1.56 ]
 3.5   [ Over 2.89 ]   [ Under 1.11 ]
```

Each row: fixed-width **line pill** on the left (e.g. `1.5`), then two `OddsButton`s (Over / Under) sharing the remaining width. On mobile the row stays a single line; on desktop the same 3-column grid scales up.

For BTTS, Odd/Even, Red Card: single row `[ Yes 1.50 ] [ No 1.71 ]` (no line pill) — keep current 2-col but drop the label kicker inside the button, showing `Yes 1.50` / `No 1.71` inline.

For Team Corners/Cards (Home 4.5, Away 4.5): show a small header `Home 4.5` then a single row with Over / Under buttons.

## Changes

1. **New `LineRow` component** in MarketTabs.tsx
   - Props: `line: string`, `overRow?: OddsRow`, `underRow?: OddsRow`, plus click/state.
   - Layout: `grid-cols-[64px_1fr_1fr] gap-2 items-center`.
   - Renders empty stub (`--`) when a side is missing.

2. **New `InlineOddsButton`** variant (or extend `OddsButton` with `inline` prop)
   - Shows label + price on one line: `Over  1.65` with label left, price right (`tabular-nums`), instead of stacked.
   - Reused for both O/U rows and Yes/No rows.

3. **New `renderOverUnderGroup(markets: MarketKey[], title)`** helper
   - Takes multiple O/U lines (e.g. all `over_under_*` for goals), for each existing line builds a `LineRow`.
   - Handles pick/stake state per market key (reusing existing `picks`/`stakes` maps).
   - Renders one shared `StakeSlip` under whichever row is currently picked in that group.

4. **Rewire tab contents**
   - **Goals tab**: 
     - Group header `Total Goals` → `LineRow`s for each active `over_under_X_5`.
     - `BTTS` header → single inline row Yes/No.
     - `Odd / Even` header → single inline row.
     - Keep `exact_total_goals` unchanged (rarely used).
   - **Cards tab**:
     - `Total Cards` → LineRows for `cards_over_under_3_5`, `_4_5`.
     - Team cards → `Home 1.5` / `Away 1.5` header with single O/U row.
     - `Red Card` → inline Yes/No.
   - **Corners tab**:
     - `Total Corners` → LineRows for `corners_over_under_9_5`, `_10_5`.
     - `Team Corners` header, then `Home 4.5` sub-header + O/U row, `Away 4.5` sub-header + O/U row.

5. **StakeSlip placement**: appears directly beneath its row (inside the group container) so the user's context stays visible.

6. Keep `alreadyPlaced`, `suspended`, and error/disabled handling intact.

## Out of scope

- No backend, no market catalog, no settlement logic changes.
- No changes to Score, Extras, or Specials tabs.
- Existing color tokens and stencil aesthetic preserved.

## Files touched

- `src/components/matches/MarketTabs.tsx` (single file)
