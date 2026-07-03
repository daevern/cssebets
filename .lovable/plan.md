
# Pre-publish verification audit

I can't honestly answer "yes, publish" without checking each area you named against the current code and live data. Here is the audit I will run before recommending publish. No app behavior changes — this is read-only verification. Anything that fails, I'll list with a proposed fix for your approval.

## 1. Odds sourcing (real API, not synthetic)
- Confirm `matches.reference_odds` on upcoming matches is populated by `apifootball-sync.server.ts` (API-Football) and not by `sim-worldcup.server.ts` or any generator path.
- Query DB: sample 10 upcoming matches → check `reference_odds` timestamps, `apifootball_odds_raw` rows, and `apifootball_quota` usage.
- Trace read path: `markets.functions.ts` + `odds.server.ts` → verify every market (1X2, O/U, BTTS, CS, HT/FT, first scorer, tournament/group winner) reads from `reference_odds` / `match_market_odds` and applies `compute3WayOdds` / `applyOutrightMargin` (house margin), never a random/fallback generator.
- Verify cron hooks (`apifootball-sync`, `apifootball-live`, `apifootball-fulltime`, `apifootball-lineups`, `apifootball-prematch`) are scheduled in pg_cron and running (check `apifootball_quota` + recent snapshot timestamps).

## 2. Wallet / points / win-loss payouts
- Read `settle_match_all_markets_atomic` and `void_match_atomic` RPCs — confirm they credit wins = stake × odds, debit losses correctly, and update `platform_bankroll` atomically.
- Cross-check `wallet_transactions` vs `predictions` for a few recently settled matches: sum(credits) − sum(debits) matches expected P/L.
- Verify `payout_requests` flow end-to-end (user request → admin approve → wallet debit) still lines up with `payout.functions.ts` and admin route.

## 3. Referral token economics
- Re-read `referrals.functions.ts` + `csse_token_transactions` + `csse_token_wallets`.
- For `daev@admin.local`: query referral rows, cumulative wagered, stage1/2/3 flags, `total_tokens_awarded`, and the wallet balance in `csse_token_wallets`. Confirm awarded tokens actually credit the wallet (the earlier bug you flagged).
- Confirm each user's referral code in `profiles.referral_code` is unique and the share link uses that code (not a shared default).

## 4. Free bets scope
- Read `place_free_bet_atomic` RPC + `freebets.functions.ts` `PlaceSchema`.
- Currently the Zod schema allows markets `["result","correct_score","total_goals","btts","first_scorer","tournament_winner","group_winner"]`. You said free bets must be **result / 90-min 1X2 only**. This is a mismatch — I'll flag it and propose tightening the schema + RPC guard to only accept `market = "result"` with outcome in `HOME|DRAW|AWAY`.

## 5. Admin surface sanity
- Load each `/management/admin.*` route file to confirm they compile, guard with `has_role('admin')`, and their server fns work (spot-check bankroll, payouts, referrals, settlements, market rules, store).
- Run `supabase--linter` for RLS/policy warnings on new tables.

## 6. Security + publish gate
- `security--get_scan_results` — must have no unresolved critical findings.
- `supabase--linter` — review any RLS-off / permissive-policy warnings.

## Deliverable
A short report per section: PASS / FAIL with evidence. If everything is PASS except the free-bet market scope (which I already expect to fail), I'll propose the tightening fix and — after you approve — apply it and then publish.

Approve this plan and I'll run the audit and come back with the findings.
