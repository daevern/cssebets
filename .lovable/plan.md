## Diagnosis

Belgium GP shows pending because settlement never ran, even though the race is over:

- `f1_races` row: `status='finished'`, `settled_at=NULL`, `results=NULL`.
- All 208 markets are still `suspended`; 1 open F1 bet is stuck.
- Root cause: the sync (`f1Sync.server.ts`) flips `status` to `finished` as soon as API-F1 marks the race completed. The auto-settle cron in `f1Settlement.server.ts` (line 126) filters `.neq("status","finished")`, so once sync sets `finished`, the settler skips the race forever. Nothing writes `results` or grades markets.

## Fix

1. **`src/features/f1/services/f1Settlement.server.ts` — `runF1AutoSettle`**
   - Replace the `.neq("status","finished")` filter with `settled_at IS NULL` so any finished-but-ungraded race is picked up.
   - Keep the 2h `starts_at` cutoff and the small batch limit.

2. **Backfill Belgium GP** (SQL via `supabase--insert` migration or one-shot):
   - Call `settleF1RaceById('47fd7f48-…')` by hitting the `/api/public/hooks/f1-live` cron endpoint after the code change, or invoke a small server function once.
   - This will fetch results from API-F1, write `f1_races.results` + `settled_at`, grade the 208 markets (winner/finish_position/podium/points/top_5/fastest_lap/top_constructor/teammate H2H), settle the open bet, and credit the wallet if it won.

3. **No UI changes.** The existing "Race complete — markets closed" banner and Picks list will reflect settled outcomes automatically once markets flip to `settled`.

## Notes
- Auto-settle runs every minute from the `f1-live` cron, so after the code fix Belgium GP settles on the next tick (subject to API-F1 having final classification data).
- If API-F1 returns no results yet, `settleF1RaceById` returns `{ok:false,error:"no results yet"}` and will retry on the next tick — no data loss.
