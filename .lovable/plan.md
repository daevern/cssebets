## What's happening

The "Take a position" panel shows "Not available" for France vs England (Jul 18, 3rd-place) and Spain vs Argentina (Jul 19, Final) because `match_market_odds` is empty for both — 0 rows. Only the top 1X2 (`reference_odds`) is populated, so nothing feeds the Goals / Cards / Corners / Specials / Score tabs.

## Root cause (verified against logs + DB + code)

The detailed markets (BTTS, O/U, cards, corners, correct score, etc.) come exclusively from **api-football**. Two things combine to break it:

1. **The DB function `regenerate_match_market_odds` intentionally deactivates every generated market for real (non-simulation) matches.** Comment in the SQL: *"Never generate fallback market odds for real matches."* So if api-football doesn't fill them, there is no fallback — the panel goes blank.

2. **The api-football sync has been failing since Jul 15.** Direct invocation returns:
   ```
   { ok:false, error: "api-football error: {\"rateLimit\":\"Too many requests. You have exceeded the limit of requests per minute of your subscription.\"}" }
   ```
   Seven cron jobs (`apifootball-live` 1m, `apifootball-sync-1min-near-kickoff` 1m, `apifootball-lineups` 5m, `apifootball-sync-5min-global-odds` 5m, `apifootball-fulltime` 10m, `apifootball-odds-sync-15m` 15m, `apifootball-prematch` 30m) all fire at the top of the minute and blow past the plan's per-minute cap. `apiFootballGet` throws on the rate-limit response; `syncUpcomingMatchOdds` has no per-match try/catch, so the entire batch aborts with 500 and zero rows are written. The `pace()` throttle is module-scope — meaningless across Cloudflare Worker isolates.

Result: `audit_log` shows no successful `apifootball.sync` since Jul 15 18:52 (the semi-final). Meanwhile the-odds-api keeps refreshing `reference_odds` only, hiding the outage on the match list but leaving detail markets empty.

## Fix

1. **`src/lib/apifootball.server.ts` — treat per-minute rate-limit as a soft skip.** In `apiFootballGet`, detect `json.errors.rateLimit` and return `{ skipped: true, reason: "per-minute rate limit", quota }` instead of throwing. This mirrors the existing daily-quota skip path.

2. **`src/lib/apifootball-sync.server.ts` — isolate per-match failures and bail on rate limit.**
   - Wrap the `syncMatchOddsApiFootball(...)` call in `syncUpcomingMatchOdds` with try/catch so one match's failure can't 500 the whole batch.
   - Break the loop when a call returns `status: "quota_exhausted"` with the new `"per-minute rate limit"` reason (or add a `rate_limited` status).
   - Add a small `await new Promise(r => setTimeout(r, 250))` between matches so a single Worker isolate stays under ~4 req/s.

3. **Reduce cron collisions.** Update the pg_cron schedule so jobs don't all land on `:00`:
   - `apifootball-sync-5min-global-odds`: `2,7,12,17,22,27,32,37,42,47,52,57 * * * *` (offset +2)
   - `apifootball-odds-sync-15m`: `3,18,33,48 * * * *`
   - `apifootball-lineups`: `4,9,14,19,24,29,34,39,44,49,54,59 * * * *`
   - `apifootball-fulltime`: `6,16,26,36,46,56 * * * *`
   Keep `apifootball-live` and `apifootball-sync-1min-near-kickoff` on `* * * * *` (they're the most latency-sensitive) but the two share only a small footprint per call.

4. **Backfill the two open fixtures immediately.** Trigger the single-match odds sync once for each after the fix ships (via the admin "Refresh odds" action or a one-shot invocation of `syncMatchOddsApiFootball` for the France-England and Spain-Argentina match IDs).

5. **Optional durability follow-up (out of scope for this fix but worth noting):** move `pace()` to a DB-backed per-minute counter so the cap holds across all Worker isolates. Not required to restore odds today.

## Files touched

- `src/lib/apifootball.server.ts` — rate-limit soft-skip.
- `src/lib/apifootball-sync.server.ts` — per-match try/catch, inter-match delay, propagate rate-limit break.
- One migration to rewrite the four pg_cron schedules above.
- No client/UI changes required — once markets are written, the existing `MarketTabs` will show them automatically.

## Verification

- After deploy, invoke `POST /api/public/hooks/apifootball-sync?max=2&hours=48&freshness=24` and confirm 200 with `results[].status: "ok"` and non-zero `markets`.
- Confirm `SELECT count(*) FROM match_market_odds WHERE match_id IN ('56960295-...','e7ddf0dd-...')` returns ~90+ rows each.
- Reload `/matches/56960295-...` → Goals / Cards / Corners / Specials / Score tabs render selections.
- Watch worker logs for 15 minutes and confirm no more `apifootball-sync → 500` responses.