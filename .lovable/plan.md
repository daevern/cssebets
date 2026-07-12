## Why Norway vs England (and similar knockouts) didn't settle

Football-Data returned this QF as `FINISHED` with FT 1-2 (HT 1-1, England advanced on penalties/ET), but with `duration != "REGULAR"` and no `score.regularTime`. Our sync only fills `home_score`/`away_score` when we can be certain those are the 90-minute goals:

```ts
const homeScore = regHome ?? (duration === "REGULAR" || duration == null ? ftHome : null);
```

So both columns stayed NULL, and the settlement branch:

```ts
if (matchId && status === "finished" && homeScore !== null && awayScore !== null) { ... }
```

was skipped. Auto-settlement will never run for this fixture as-is; every 90-minute market bet stays PENDING. The `to_qualify` market could grade (we have `qualifier = AWAY`) but the current settlement path only runs when both regulation scores are known.

## Fix

### 1. Backfill this match now
- Re-fetch this fixture from Football-Data by external_id and inspect `score.regularTime` / `score.duration`.
- If `regularTime` is present, update the row and call the existing settlement RPC so all 25 pending bets grade.
- If `regularTime` is genuinely missing, use the HT score + goal timing endpoint (`/matches/{id}` returns `goals[]` with minute) to reconstruct the regulation-time score, then update + settle.
- Last resort: leave 90-minute markets for admin manual regrade (already available in Admin > Predictions) but immediately settle the `to_qualify` bets using `qualifier = AWAY`.

### 2. Make the sync robust for future knockouts
Update `src/lib/sync.server.ts` so that when the match is FINISHED and `regularTime` is missing:
  - If provider returns `score.duration === "REGULAR"` → use FT as the regulation score (already handled).
  - If provider returns `duration` of `EXTRA_TIME` / `PENALTY_SHOOTOUT` and `goals[]` is available → sum only goals with `minute <= 90` (plus stoppage) per side to derive regulation score.
  - Otherwise flag the match as `needs_manual_settlement` (audit_log entry + surface in Admin > Predictions filter) so it doesn't silently sit PENDING.

Also settle the `to_qualify` market independently of regulation score whenever `qualifier` is set — it doesn't depend on 90-minute goals.

### 3. Verify
- After backfill, confirm all 25 Norway vs England predictions move out of PENDING (won/lost/void) and wallets are credited.
- Confirm audit_log entries exist for each settlement.
- Add a quick admin query (or extend existing Predictions page) to list any finished matches with pending bets → prevents this from being noticed only by users.

## Technical notes

- File: `src/lib/sync.server.ts` — extend the regulation-score derivation and split `to_qualify` settlement out of the score-null guard.
- File: `src/lib/settlement.server.ts` — ensure `to_qualify` can be settled when only `qualifier` is known (may already work; verify).
- Backfill can run as a one-off server function callable from Admin, or as a psql-safe migration invocation — I'll wire it as a `createServerFn` triggered from Admin > Matches to keep it repeatable for future knockouts.
- No schema changes required for the fix; optional `needs_manual_settlement` boolean can be added later if we want an explicit flag rather than a computed view.
