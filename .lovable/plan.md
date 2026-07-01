## Why it's pending
Mexico beat Ecuador 2-0 (finished). All other markets on the match settled. Only `to_qualify` is stuck because the `matches.qualifier` column is NULL, and the to_qualify settler only grades bets when `qualifier` is explicitly set (HOME/AWAY). It was designed that way for knockouts that go to extra time / penalties, where an admin must set who advanced.

But when the 90-minute score is decisive (not a draw), the qualifier is unambiguous — the winner advances. Leaving qualifier NULL in that case is a bug: the settler should auto-derive it.

## Fix (two parts)

### 1. Backfill this match now
- Set `matches.qualifier = 'HOME'` for Mexico vs Ecuador (`4f24352d…`).
- Re-run `settle_match_all_markets_atomic` for that match → grades bet `f8da4ed0…` as WON (10.00 stake → 12.80 payout to druggie777) and debits the platform bankroll.
- Sweep every other `finished` match with pending `to_qualify` bets and a decisive 90-min score, derive qualifier from the scores, and re-settle.

### 2. Patch the settler so this can't recur
Update `settle_match_all_markets_atomic` (and/or the dedicated `settle_to_qualify_for_match` helper) so that, before grading to_qualify:
- If `qualifier` is NULL AND `home_score != away_score`, derive `qualifier` from the winning side, persist it on `matches`, and grade.
- If `qualifier` is NULL AND the match is drawn at 90, leave to_qualify pending (still needs ET/pens qualifier from admin) — same as today.
- Add the derivation to `settleFinishedPending` catch-up path too so the picks-page trigger self-heals.

Also: extend the reconciliation hourly check to flag `finished` matches with pending `to_qualify` bets and a decisive score as DRIFT, so any future gap alerts instead of hiding.

## Technical notes
- Change is a single SQL migration modifying the settlement RPC + a one-shot backfill call.
- No UI changes.
- No new tables, no new secrets, no risk to already-settled bets (the grader is idempotent on non-pending rows).
