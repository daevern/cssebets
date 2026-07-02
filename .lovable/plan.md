# Market Movement — Live Tick Fix

## Why the graph is stagnant at ~80h

The chart's "updated" timestamp comes from the most recent odds snapshot in the DB. For the 1X2 (Match Result) market, snapshots ARE fresh (updated minutes ago via the 15-min API-Football cron). But for secondary markets (Over/Under, BTTS, Cards, Corners, Correct Score, HT/FT, Double Chance, To Qualify) most matches only got a single initial snapshot at league seed time — so any of those markets shows "80h ago" and a flat line.

Two independent problems:
1. **Selector behavior** — chart opens on ALL range and picks whichever market has history first, often landing on a stale secondary market.
2. **Sync coverage** — the `apifootball-odds-sync-15m` cron only refreshes 1X2. Secondary markets aren't rotated back through.
3. **Perceived liveness** — even when data is fresh, the line only advances when a new DB snapshot lands (every 15 min at best). Kalshi-feel requires per-second visual movement.

## Fix

### 1. Chart UX (`src/components/matches/MarketAnalyticsCard.tsx`)
- Default `range` to `"1H"` instead of `"ALL"`.
- If the currently selected market has no point in the last 1 hour, auto-fall-back to whichever market IS live (prefer `match_result`) so the user never lands on a dead series.
- Add a "ticking now" line: every 1000 ms, append a synthetic trailing point at `now()` reusing the last known odds/prob for each series. When a new real snapshot arrives via realtime, replace the tail. This makes the x-axis crawl forward every second and the terminal dot pulse — the Kalshi feel — without fabricating price movement.
- Change the "Live · updated Xs ago" pill: if last real snapshot > 5 min, show amber "delayed" state instead of green live dot, so stale data is obvious.

### 2. Live streaming layer
- Add a lightweight interpolation buffer inside the component: keep the last real snapshot per series, and on each 1 s tick push `{ t: now, ...lastValues }` into the chart dataset (capped so it never exceeds the selected window).
- When a realtime INSERT hits `match_odds_snapshots` / `market_odds_snapshots`, invalidate and reseed the buffer from the fresh server payload.

### 3. Sync frequency (server)
- Update the odds sync server function so for matches inside kickoff − 24h it also refreshes the top secondary markets (Over/Under 2.5, BTTS, Double Chance, Cards O/U 3.5, Corners O/U 9.5) on every 15-min tick, not only at seed time.
- Add a second cron `apifootball-odds-sync-3m` scoped to matches within kickoff − 2h and live matches, hitting 1X2 + top secondaries. Respect the existing `apifootball_quota` guard.

### 4. Verification
- Open a scheduled match's analytics page; confirm chart defaults to 1H, terminal dot pulses, x-axis advances every second.
- Force-invalidate a snapshot; confirm the line jumps to the new value.
- Confirm stale-market pill flips to amber when last snapshot > 5 min.

## Files touched
- `src/components/matches/MarketAnalyticsCard.tsx` — default range, market fallback, per-second tick buffer, stale badge.
- `src/lib/apifootball-sync.functions.ts` (or equivalent existing sync server fn) — expand secondary-market refresh set.
- `supabase/migrations/<new>.sql` — add `apifootball-odds-sync-3m` pg_cron entry for near-kickoff + live matches.

No changes to settlement, wallet, or bet-placement logic.
