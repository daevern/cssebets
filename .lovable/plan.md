
## Goal

Stop burning API-MMA quota. The paid plan has generous limits, but the current sync fans out enormous numbers of calls per 30s cron tick, which is what's causing the intermittent "rate limit / no data" behaviour.

## What's wasteful today

In `src/lib/ufc-odds.server.ts` → `runUfcOddsSync` runs every 30s inside the event window. For **every fight on the card** it currently calls:

- `upsertFighter` × 2 → `fetchFighter` + `fetchFighterRecordSummary` (2 calls each fighter = 4/fight)
- `syncH2H` → `fetchFighterFightHistory(id, 16)` which loops **16 seasons × 2 fighters = up to 32 calls/fight**
- `fetchOddsForFight` (1/fight)
- `fetchFightStats` when live (1/fight)

For a 10-fight card that's ~370 calls every 30 seconds — the vast majority re-fetching data that doesn't change (fighter bio, career record, past fight history).

Also `src/lib/apimma.server.ts` header comment still says "Free plan: 100 req/day" — misleading now that the account is paid.

## Fix

All edits stay in `src/lib/ufc-odds.server.ts` and `src/lib/apimma.server.ts`. No schema changes — use existing `updated_at` / row timestamps as the freshness signal.

1. **Update the plan comment** in `apimma.server.ts` to reflect the paid tier (remove "Free plan: 100 req/day" note).

2. **Skip fighter enrichment when fresh** in `upsertFighter`:
   - If `existing.updated_at` is < 7 days old AND the row has `record_w`, `height_cm`, `reach_cm` populated → return `existing.id` without calling `fetchFighter` / `fetchFighterRecordSummary` / `searchFighter`.
   - First-time inserts and stale rows still enrich normally.
   - Saves ~4 calls/fight/tick.

3. **Skip H2H when fresh** in `syncH2H`:
   - Before fetching, `SELECT max(created_at) FROM ufc_fight_h2h WHERE fight_id = ?`.
   - If any row exists and is < 24h old, return early. H2H and recent-form data don't change hour-to-hour.
   - Saves up to ~32 calls/fight/tick.

4. **Reduce `fetchFighterFightHistory` default** from `seasonsBack = 16` (which is what the `syncH2H` call currently passes) down to `seasonsBack = 3`. Three seasons already covers >95% of active UFC fighters' recent form and direct H2H. Update the call in `syncH2H` accordingly. Saves ~26 calls/fight even on the first run.

5. **Throttle odds refresh per fight** in `syncOddsForFight`:
   - Read the latest `ufc_market_snapshots.sampled_at` for the fight.
   - If < 3 minutes old AND commence is > 1 hour away → skip the `fetchOddsForFight` call for this tick.
   - Inside the final hour before commence, and once live, keep the current 30s cadence so line moves and closing prices stay accurate.
   - Saves roughly (10 fights − 1) × 1 call every 30s during the pre-event window.

6. **Only sync stats for LIVE fights**, not `FT`/`AFT`. Post-fight stats don't change, and the current code re-pulls them every tick until the fight row flips to `finished`. Change the guard from `["LIVE","FT","AFT"]` to `["LIVE"]` and add a "not already stored" short-circuit for the LIVE case (skip if a stats row exists and was updated in the last 30s).

## Expected result

Pre-event steady state drops from ~370 calls / 30s to well under 20 calls / 30s for a 10-fight card, with no user-visible change: odds still refresh, live stats still stream, H2H still populates on the first sync after an event is loaded. During the final hour before commence and once fights go live, cadence stays at 30s as today.

## Out of scope

- No changes to `runUfcAutoSettle`, market mapping, or settlement RPCs.
- No new tables / migrations.
- No UI changes.
