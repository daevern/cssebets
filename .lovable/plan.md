## Goal
1. Fix the "This page didn't load" crash when opening a completed F1 race.
2. Add a post-race analytics section on F1 race pages (Belgium GP style) mirroring how `/matches/$matchId` shows post-match analysis in football.

## 1. Fix the crash

The finished-race payload (verified via network trace for Belgium GP) contains driver rows where `abbr` is `null` (e.g. Arvid Lindblad, Franco Colapinto), and the race has zero `open` markets. On `F1RaceDetailsPage`:

- `seriesMeta` builds a short label with `(drv?.abbr ?? m.label).toString().slice(0,3)` — safe.
- `useEffect` on `chartIdsKey` runs even when `chartIds` is empty and calls `setHidden({})` — safe.
- The recharts `LineChart` still renders because we branch on `chartData.length === 0`, but `Customized` is a child of `LineChart` unconditionally; when `visibleSeries` is empty and `yAxisMap` is missing a scale, the callback throws (this is the crash surfaced in the root error boundary).

Fix:
- Skip rendering the entire "Market Movement" chart section when `chartMarkets.length === 0` (i.e. race finished / no open markets). Show the post-race panel instead.
- Guard the `Customized` render callback with `if (!yScale) return null;`.
- Make sure `SECTION_TITLES`/sub-tabs don't render for finished races; hide the top/sub tab bar when there are no markets in either category.

## 2. Post-race analytics section

Data source: `f1_races.results` (JSONB) is already populated on settle with the full ordered classification (position, driver, team, time, gap, laps, pits, grid). We already fetch `fastest lap` in settlement but don't persist it — extend the settle function to also store `race.fastest_lap` on `f1_races` (new JSONB column `fastest_lap`).

### 2a. Migration
- `ALTER TABLE public.f1_races ADD COLUMN IF NOT EXISTS fastest_lap JSONB;`
- Backfill Belgium GP via a one-off UPDATE using API-F1 fastest-lap fetch inside settle (next run) — no manual seed.

### 2b. Server function
Add `getF1RaceAnalytics(raceId)` in `src/features/f1/f1.functions.ts`:
- Reads `f1_races` (results, fastest_lap, status, settled_at) and joins driver/team photos from `f1_drivers` / `f1_constructors`.
- Returns `{ classification, fastestLap, constructorPoints, podium, status }`.
- `constructorPoints`: aggregate `points` per team from `results` and sort desc.

### 2c. UI component `F1PostRaceAnalytics`
New file `src/features/f1/components/F1PostRaceAnalytics.tsx`. Layout follows the football analytics page:
- **Header pill**: "Final Race Classification — Official".
- **Podium** cards (P1/P2/P3) with driver photo, team logo, gap, laps.
- **Full classification table**: Pos · Driver (photo+abbr) · Team (logo) · Grid · Laps · Time/Gap · Pits.
- **Fastest lap** card: driver photo + team + lap time.
- **Constructor points (this race)** bar list: team logo + points bar, sorted.
- Uses the same card/typography tokens as `MarketAnalyticsCard.tsx`.

### 2d. Wire into `F1RaceDetailsPage`
- After the header block, if `race.status === "finished"` render `<F1PostRaceAnalytics raceId={raceId} />` and skip the Market Movement / market tabs entirely.
- Otherwise keep the current pre-race UI.

## Files touched
- `src/features/f1/pages/F1RaceDetailsPage.tsx` — crash guards, branch on finished.
- `src/features/f1/f1.functions.ts` — new `getF1RaceAnalytics`.
- `src/features/f1/components/F1PostRaceAnalytics.tsx` — new.
- `src/features/f1/services/f1Settlement.server.ts` — persist `fastest_lap` on race row.
- Migration: add `fastest_lap` column to `f1_races`.

## Out of scope
- Live in-race telemetry (already handled by `LiveRaceStats`).
- Historical head-to-head stats across seasons.
