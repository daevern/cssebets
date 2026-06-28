
# Per-User Correlated Exposure Controls

## The problem

Bố Chiou's bet history shows a textbook correlated-stack:
on a single match he places **Over 2.5 + BTTS YES + Exact Goals 4 / 5+ + Correct Score 1-3** simultaneously. These markets are not independent — if the match is high-scoring, most/all win together. Today the platform only checks:

- `max_bets_per_user_per_match` (count, not money)
- `max_stake_per_bet`, `max_potential_payout` (per single bet)
- Pool/bankroll caps (aggregate across all users)

Nothing caps **one user's combined potential payout on one match**, and nothing recognises that "Over 2.5 + BTTS YES + Goals 4" is effectively one bet. Result: a sharp user can extract many multiples of the house's intended per-match risk.

## Rule set to add (bookmaker-style)

### 1. Per-user, per-match potential payout cap
Hard ceiling on the sum of `potential_return` across all of a user's pending bets on the same match.

- New setting: `max_user_match_potential_payout` (default e.g. 1,500 pts).
- Enforced atomically inside `place_market_bet_atomic` / `place_bet_atomic` before debiting the wallet.
- Error: `USER_MATCH_PAYOUT_EXCEEDED` → friendly "You've reached your max potential return on this match."

### 2. Per-user, per-match stake cap
Same idea, but on the sum of stakes (prevents whales from buying past the payout cap with huge stakes on low odds).

- New setting: `max_user_match_stake` (default e.g. 500 pts).
- Error: `USER_MATCH_STAKE_EXCEEDED`.

### 3. Correlated-market grouping (the key fix)
Treat correlated markets as a single risk bucket per user per match. Within a bucket, only the **worst-case** combined payout counts, but a tighter cap applies than the generic per-match cap.

Initial correlation groups (configurable JSON in `platform_settings.correlation_groups`):
- **goals_up**: `over_under_2_5:OVER_2_5`, `btts:YES`, `exact_total_goals:GOALS_3/4/5_PLUS`, `correct_score` with home+away ≥ 3
- **goals_down**: `over_under_2_5:UNDER_2_5`, `btts:NO`, `exact_total_goals:GOALS_0/1/2`, `correct_score` with home+away ≤ 2
- **home_win_strong** / **away_win_strong**: HT/FT same side + matching correct scores
- **draw_lean**: HT/FT DRAW_DRAW + correct score 0-0/1-1/2-2

For each group, compute the **scenario payout** = sum of `potential_return` of the user's pending bets in that group on that match (because in the worst case for the house, all of them resolve together).

- New setting: `max_user_match_correlated_payout` (default e.g. 1,000 pts, stricter than #1).
- Error: `USER_CORRELATED_PAYOUT_EXCEEDED` → "This selection correlates with your other picks on this match. Lower stake or pick a different market."

### 4. Per-user, per-day net exposure cap
Stops the same user spreading the same correlated stack across every match of the day.

- New setting: `max_user_daily_potential_payout` (default e.g. 8,000 pts), evaluated across all pending bets placed in the rolling 24h window.
- Error: `USER_DAILY_PAYOUT_EXCEEDED`.

### 5. Dynamic stake-factor (sharp detection)
Track each user's recent ROI (last N settled bets). When their ROI exceeds a threshold, automatically scale their `max_user_match_stake` and `max_user_match_potential_payout` down by a factor.

- New columns on `profiles`: `risk_factor` numeric default 1.0, `risk_factor_reason` text, `risk_factor_updated_at`.
- Nightly job (or on-settle trigger) recomputes `risk_factor` based on rolling ROI and total profit vs house. Sharps end up at 0.5 / 0.25.
- All per-user caps above are multiplied by `risk_factor` at check time.
- Admin UI: view & override `risk_factor` per user, see why it was set.

### 6. Admin visibility
Extend the existing risk dashboard (`src/lib/risk.functions.ts`) with:
- New "Per-user per-match exposure" table (top 20 worst).
- New "Correlated-group exposure per user" view.
- Highlight users currently bumping any of the new caps.

## Technical sketch

**Migration adds:**
- 5 new columns on `platform_settings` (the four caps + `correlation_groups jsonb`).
- 3 new columns on `profiles` (`risk_factor`, reason, updated_at).
- New SQL function `public.assert_user_match_risk(p_user_id, p_match_id, p_market, p_selection, p_stake, p_odds)` — runs all four checks against pending predictions, respecting `risk_factor`.
- Hook it into `place_market_bet_atomic` and `place_bet_atomic` right after `assert_betting_allowed`, before wallet debit.
- New error codes mapped to friendly messages in `src/lib/markets.functions.ts` and `src/lib/predictions.functions.ts`.

**Admin code:**
- `src/routes/management/admin.risk-settings.tsx`: add inputs for the four new caps + correlation groups editor.
- `src/routes/management/admin.users.tsx`: risk_factor editor.
- `src/lib/risk.functions.ts`: extend `getRiskDashboard` payload with `userMatchExposure` and `userCorrelatedExposure`.
- New admin panel section: "User concentration risk".

**No changes to existing wallet / settlement logic** — these are pre-trade checks only.

## Defaults (proposed — tweakable in admin before rollout)

| Setting | Default |
| --- | --- |
| `max_user_match_potential_payout` | 1,500 pts |
| `max_user_match_stake` | 500 pts |
| `max_user_match_correlated_payout` | 1,000 pts |
| `max_user_daily_potential_payout` | 8,000 pts |
| Sharp ROI threshold → 0.5 factor | +30% ROI over 20 bets |
| Sharp ROI threshold → 0.25 factor | +60% ROI over 20 bets |

With these defaults, Bố Chiou's typical 4-leg goals_up stack on one match (≈ 4,200 pts potential) would have been blocked at leg #2 with `USER_CORRELATED_PAYOUT_EXCEEDED`.

## Out of scope (call out before approving)

- Auto-suspending a user (manual admin action only).
- Changing odds on the fly per user.
- Multi-bet (parlay/accumulator) controls — the platform is single-bet only today.

Approve and I'll ship the migration + server-fn checks + admin UI in one pass.
