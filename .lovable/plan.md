
# Real live probability graph (Smooth, ~15s ticks)

Replace the synthetic LIVE animation with a real, tick-by-tick probability graph driven by live bookmaker odds — the same signal Kalshi / Bet365 use. Polled every ~15 seconds so the graph visibly reacts to goals within seconds.

## What changes for the user

- When a match is in play, the graph actually moves in response to goals, red cards, and market sentiment — within ~15 seconds.
- Before kickoff: unchanged (pre-match odds from The Odds API, as today).
- After full time: the graph freezes at the final probabilities (as today).
- The "LIVE" range shows the last ~90 seconds of real ticks — no more sine-wave animation.

## How it works

### 1. Live odds poller (new cron endpoint)

New server route: `src/routes/api/public/hooks/odds-live.ts` — POST, `/api/public/*` (bypasses auth), verifies Supabase `apikey` header.

For every match currently in play (`kickoff_at` in the past, `status != finished`, kickoff within last ~3h):

1. **Primary source: API-Football `/odds/live`** — one call returns live odds for *all* in-play fixtures at once, so it costs 1 request per poll regardless of how many matches are live. Match by `apifootball_fixture_id`.
2. **Fallback: The Odds API** `/v4/sports/soccer_fifa_world_cup/odds` — only called if API-Football returns nothing for a fixture. In-play events are those where `commence_time` is in the past.
3. For each matched fixture: apply existing house margin (`apply3WayMargin` from `src/lib/odds-margin.server.ts`, respecting `margin_disabled`), write a new row to `match_odds_snapshots`, update `matches.reference_odds` + `odds_updated_at` + `odds_source`, and call `regenerate_match_market_odds` RPC so derived markets (O/U, BTTS, correct score, HT/FT) also update.

### 2. Cron schedule (Smooth: every 15s)

pg_cron runs at 1-minute granularity, so we schedule 4 offset jobs to hit ~15s cadence. Each job just fires the poller, which early-exits cheaply if no matches are in play (near-zero cost outside match windows).

```
select cron.schedule('odds-live-poll-00', '* * * * *',        $$ ... /api/public/hooks/odds-live ... $$);
select cron.schedule('odds-live-poll-15', '* * * * *',        $$ select pg_sleep(15); select net.http_post(...); $$);
select cron.schedule('odds-live-poll-30', '* * * * *',        $$ select pg_sleep(30); select net.http_post(...); $$);
select cron.schedule('odds-live-poll-45', '* * * * *',        $$ select pg_sleep(45); select net.http_post(...); $$);
```

Quota budget at 15s ticks:
- **API-Football Pro (7,500/day)**: 4 requests/minute during live windows = 240/hour. Even 10 hours of live football/day = 2,400/day. Fits comfortably.
- **The Odds API 20K/month**: fallback only, so ~0 in normal operation. If ever hit for a full 2h match at 15s = 480 requests. Well within budget.

### 3. Remove the synthetic animation

In `src/components/matches/MarketAnalyticsCard.tsx`:

- Delete `marketPulse`, `marketDrift`, and the `buildLiveTape` function.
- Change LIVE range rendering to plot *real* snapshots from the last 90 seconds, using the same time-series logic as 1D/1W/1M (just with a smaller window). If there are only 1–2 real ticks yet, show them as-is; no fabricated points between them.
- Keep the realtime channel that already invalidates the query on new `match_odds_snapshots` INSERTs — new ticks surface within a second of the cron write.

### 4. Pre-existing pieces reused (no changes)

- `syncScore` / `syncEvents` / `syncStats` in `apifootball-analytics.server.ts` — already running on the `apifootball-live` cron.
- `apply3WayMargin`, `regenerate_match_market_odds` RPC, `match_odds_snapshots` schema — all unchanged.

## Files touched

- **New**: `src/routes/api/public/hooks/odds-live.ts` (thin route handler)
- **New**: `src/lib/odds-live.server.ts` (fetch + match + persist logic)
- **Edit**: `src/components/matches/MarketAnalyticsCard.tsx` (remove synthetic LIVE tape, plot real ticks)
- **Cron registration** (via supabase insert, not a schema migration): 4 offset pg_cron jobs

## Out of scope for this pass

- No UI redesign of the chart itself — same layout, colors, tabs.
- No changes to pre-match odds sync (`odds.server.ts` stays as-is).
- No changes to how bets are priced/settled — this only affects the *displayed* probability graph and derived market odds.
- No historical backfill — real live ticks start from when the cron is enabled.
