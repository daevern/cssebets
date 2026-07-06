## Why the Brazil–Norway regrade was needed

The bet was auto-settled on a stale corner count (3+4 = 7). API-Football's `/fixtures/statistics` endpoint often keeps updating corner and shot totals for **several minutes to a few hours after the final whistle** (they reconcile with the official match report). Our pipeline treated the first post-whistle stats snapshot as authoritative and then never revisited it.

## The bug chain

1. **Cards/corners settlement runs on the first "fresh" stats snapshot, not the final one.**
   `settle_match_all_markets_atomic` calls `settle_cards_corners_for_match` inside the same transaction that settles the score, as soon as the match flips to `finished`. The RPC's freshness check only requires `match_stats.fetched_at >= kickoff_at`, so a partial post-whistle snapshot (Brazil 3 / Norway 4) passed as "fresh" and locked in the grading.

2. **No re-grading once a prediction leaves `pending`.**
   `settle_cards_corners_for_match` loops only over `status='pending'` rows. When API-Football later revised corners to 5/5, nothing re-ran the grader for the already-settled rows. Silent divergence.

3. **The post-match refresh hook stopped refreshing too early.**
   `apifootball-fulltime` only picked matches finished in the last 60 minutes AND without cached player ratings. Once ratings were cached (usually within the first hour), stats + events were never refreshed again — even if the source data changed.

4. **No score/stats divergence alert for cards & corners.**
   `syncScore` already alerts when regulation vs full-time goal scores diverge on settled bets. Nothing equivalent exists for `match_stats.corners` / `cards` changing after settlement.

5. **No user-facing dispute path.**
   The only way this got fixed was the user spotting it and messaging you. There is no "flag this bet" button on `/my-predictions` and no `flagged_for_review` UI in admin surfaces even though the column exists.

6. **`matches.home_corners` / `away_corners` are permanently NULL.**
   The settlement RPC prefers `matches.home_corners` via `COALESCE`, but the sync code never populates it — everything runs off `match_stats`. Not a functional bug today, but it means the "source of truth" is ambiguous and any admin who manually edits `matches` will find their edits ignored.

7. **`predictions_accounting_trigger` fires only when `status` changes.**
   If a prediction is re-graded won→lost or lost→won via `UPDATE predictions SET status=...` from the wrong path (e.g. an admin form that also passes explicit `gross_payout`), the trigger silently overwrites those values. The trigger has no audit trail of the old vs new accounting. Low severity but easy to trip.

8. **Wallet reconciliation for a wrong grade is fully manual.**
   There is no RPC like `regrade_prediction(pred_id, new_status)` that atomically flips status + issues the wallet delta + writes an audit log. Every correction is bespoke SQL, which is exactly how "half-fixes" happen (status updated, wallet forgotten, or vice versa).

9. **Partial data race window in `apifootball-live`.**
   The live hook syncs score first, then stats, in separate API calls. If the match transitions to `finished` between those two calls, `settlePredictionsForMatch` is triggered from `sync-fixtures` (Football-Data path, different cron) with only the score-time corners snapshot — which is what happened here.

10. **Freshness anchor is `kickoff_at`, not `match ended`.**
    The anchor was moved to `kickoff_at` to fix a previous "stuck as not fresh" bug (comment in the RPC), but it swung too far the other way. Any snapshot fetched after kickoff — including one taken while the match is still being played but the match row was somehow flipped to `finished` — passes as fresh.

## Severity ranking

| # | Bug | Financial risk |
|---|---|---|
| 1 | Grades on first stats snapshot | **High** — this caused the actual loss |
| 2 | No re-grade after later stats revision | **High** — silent, affects every finished cards/corners bet |
| 3 | Fulltime refresh window too tight | **High** — enabler for #2 |
| 4 | No stats-divergence alert | **Medium** — detection gap |
| 5 | No user dispute flow | **Medium** — social/ops |
| 8 | No atomic regrade helper | **Medium** — future correction risk |
| 9 | Race between score-flip and stats sync | **Medium** — root of #1 in practice |
| 10 | Over-permissive freshness anchor | **Medium** |
| 6 | `matches.home_corners` unused | **Low** |
| 7 | Accounting trigger has no audit | **Low** |

## Next step

This plan is diagnostic only — no code changes yet. Approve if the diagnosis matches your understanding; then I can spin up a follow-up plan to actually fix them, sequenced by severity. My recommendation for the first fix batch would be **#2 + #3 + #4** together (auto re-grade window + widened refresh + divergence alert), because they close the recurrence loop without touching the settlement RPC. Bugs #1/#9/#10 need a more careful redesign of the "when is stats data final?" contract and should be a second batch.
