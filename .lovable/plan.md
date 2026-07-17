## Goal
Remove "Finishing Position" (race winner) tab from the F1 race page and replace it with **Top 5 Finishers**. Add two new markets to **Race Specials**: **Fastest Lap** and **Top Constructor** (best-scoring team in the race).

The `race_winner` market stays in the DB (it's the base probability used by the featured card, RaceChip, and to derive other odds) — it's just removed from the details-page tabs.

## Changes

### 1. Odds builder (`src/features/f1/services/f1OddsBuilder.server.ts`)
Add three new derivation helpers, all anchored to `buildRaceWinnerOdds` probabilities with the shared 6% overround, floor 1.05, cap 50:
- `buildTop5Odds(winnerOdds)` — `p = clamp(winnerP * 4.2, 0.02, 0.97)`.
- `buildFastestLapOdds(winnerOdds)` — softer distribution: `p = clamp(winnerP * 1.4 + 0.02, 0.01, 0.6)`, renormalised so probs sum ≈ 1 across drivers.
- `buildTopConstructorRaceOdds(teamProbs)` — aggregate each team's driver winner-probabilities, renormalise, apply overround.

### 2. Sync writer (`src/features/f1/services/f1Sync.server.ts`)
Inside the per-race loop, in addition to `race_winner`, `podium`, `points_finish`, upsert:
- `top_5_finish` rows per driver.
- `fastest_lap` rows per driver.
- `top_constructor_race` rows per team (`selection_key = team_key`, `label = team name`).

All use the same `f1_race_markets` upsert conflict target (`race_id,market_type,selection_key,secondary_selection_key`) — no migration needed since `market_type` is free-form text.

### 3. Settlement (`src/features/f1/services/f1Settlement.server.ts`)
Extend `settleF1RaceById`:
- `top_5_finish` — winning if driver in `ordered.slice(0,5)`.
- `fastest_lap` — settle from `fetchF1RaceResults`'s per-driver `time`/laps; if provider does not expose a fastest-lap flag on the result payload, call a new adapter `fetchF1FastestLap(raceId)` hitting API-Sports `/rankings/fastestlaps?race=…` and match by driver key. If the endpoint returns empty (early race data), skip settlement for that market and let the auto-settle retry (existing behaviour for null `winning`).
- `top_constructor_race` — sum `points` per team from `ordered`; team with max total wins; ties resolved by best finishing position.

### 4. Race details page (`src/features/f1/pages/F1RaceDetailsPage.tsx`)
- `SubTab` type: `"top_5_finish" | "podium" | "points_finish" | "head_to_head" | "fastest_lap" | "top_constructor_race"`.
- `SUB_TABS_TOP`:
  1. Top 5 Finishers (`top_5_finish`)
  2. Podium Finishers (`podium`)
  3. Top 10 Finishers (`points_finish`)
- `SUB_TABS_SPECIALS`:
  1. Teammate H2H (`head_to_head`)
  2. Fastest Lap (`fastest_lap`)
  3. Top Constructor (`top_constructor_race`)
- `SECTION_TITLES` entries for the new keys ("Which 5 drivers finish top 5?", "Who sets the fastest lap?", "Which team scores the most points?").
- Default `subTab` on load becomes `top_5_finish`; the `topTab` switch effect flips to `top_5_finish` / `head_to_head`.
- Grouping map (`g`) initialised with all six keys.
- `top_constructor_race` rows render with team badge/flag instead of the driver portrait (reuse existing team lookup already loaded from `getF1Race`).

### 5. Backfill for existing scheduled races
Trigger the existing admin "Sync all" once the code ships (no data migration required) so open races gain the new market rows. Races already `finished` are ignored by the sync loop, which is correct.

## Out of scope
- No change to season page / featured card (still driven by `race_winner`).
- No change to championship outrights.
- No new DB migration (schema already accommodates new `market_type` values).