## Why UFC bets stay PENDING

Only **moneyline / three_way** bets settle automatically today. The four fights in your screenshot have a `winner` recorded, and the moneyline bet on Duncan already paid out — but every other market on those fights (`round`, `total_rounds`) is still `open`.

Two concrete bugs in the auto-settle pipeline:

1. **`auto_settle_ufc_winner_atomic` only touches `moneyline` + `three_way`.**
   `round`, `total_rounds`, and future method/round markets are never graded, so those tickets sit as PENDING forever unless an admin opens the fight and hand-settles it via "Settle" (which requires method + round).

2. **After auto-settle runs, `ufc_fights.status` is left as `scheduled` and only `winner` is set.**
   The sweep in `runUfcAutoSettle` filters on `winner IS NULL`, so once the winner is recorded these fights are skipped forever. There is no second pass that ever settles the remaining markets, and the fight never flips to `finished`, which also confuses the dashboard "next fight" query and stats views.

Result today: rows 1–4 are half-graded (moneyline done, round/totals stuck), fight status is stuck at `scheduled`, and admin has to manually void or hand-grade each one.

## Fix plan

### 1. Extend auto-settle to grade every UFC market from the feed

Update `runUfcAutoSettle` in `src/lib/ufc-odds.server.ts`:
- Keep the current daily `/fights` batch to derive `winner`.
- For every finished fight (`status.short` in `FT`/`AFT`), also call the MMA stats endpoint (`/fights/statistics/fighters`, already wrapped as `fetchFightStats`) and/or read `method` + `ending round` from the fight payload. Extend `ApiMmaFight` in `src/lib/apimma.server.ts` with the raw `method` / `round` fields the provider returns and parse them into a normalized `{ method: 'ko_tko' | 'submission' | 'decision'; endingRound: number | null }`.
- Pass those into a new RPC `auto_settle_ufc_fight_atomic(fight_id, winner, method, ending_round)` that:
  - Grades `moneyline` + `three_way` (existing logic, kept verbatim).
  - Grades `total_rounds` (over/under X.5) using `ending_round`, with decisions treated as `scheduled_rounds`.
  - Grades `round` (r1..r5 and `distance`) using `method` + `ending_round`.
  - Updates `ufc_fights` with `status='finished'`, `winner`, `result_method`, `result_round`, `settled_at`.
  - Returns the number of bets settled.
- Change the sweep filter from `winner IS NULL` to `status <> 'finished'` so half-settled legacy rows get re-processed once.

### 2. Backfill the four stuck fights

Ship a one-off admin server fn (or reuse `adminSettleUfcFight` per fight) plus a migration that:
- Re-runs the new auto-settle path for the four fights listed above so their `round` / `total_rounds` open bets grade against the actual result.
- If the feed still doesn't provide method/round for one of them, mark those specific market bets `void` and refund stake (documented reason: `provider_missing_method`) so nothing stays PENDING.

### 3. Keep the "half-settled" case from recurring

- Add an operational alert (`operational_alerts` insert) whenever auto-settle records a winner but has no method/round, so we notice provider gaps instead of silently leaving tickets open.
- Add a Vitest around the new grading helper covering: KO in R1, submission in R2, decision at scheduled distance, draw (moneyline void), and ending-round exactly on the O/U line (push → void).

### Technical notes (for engineers)

- All wallet mutations stay inside the new atomic RPC to preserve `balance_before` / `balance_after` ledger invariants.
- `total_rounds` push rule: if `ending_round == line` and fight went the full time of that round, treat as void (refund) — matches football O/U behavior.
- `round.distance` wins only when `method = 'decision'`; otherwise it loses.
- No UI changes; the admin "Predictions" screen will show these as `won` / `lost` / `void` once graded.

### Out of scope

- No changes to F1 or football settlement.
- No change to manual `adminSettleUfcFight` — it stays as the admin override.
