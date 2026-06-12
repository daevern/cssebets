# Add High-Margin Virtual Prediction Markets

This is a large, multi-layer feature. I'll implement it in safe phases so existing match-winner bets, wallet, bankroll, settlement, and admin flows keep working untouched.

## Scope

Add 5 new markets alongside the existing `result` market:

1. `over_under_2_5` — OVER_2_5 / UNDER_2_5
2. `btts` — YES / NO  *(market key already exists in enum; extend coverage)*
3. `correct_score` — fixed grid + OTHER  *(enum exists; add odds + UI)*
4. `half_time_full_time` — 9 combos *(new)*
5. `exact_total_goals` — GOALS_0..GOALS_5_PLUS *(new; `total_goals` enum already exists but we'll use the new key)*

Existing `result`, `tournament_winner`, `group_winner`, `first_scorer` markets stay as-is.

## Phase 1 — Database

### New table: `match_market_odds`
Server-controlled odds per (match, market, selection).

```
id uuid pk
match_id uuid → matches(id) on delete cascade
market text
selection text
odds numeric(10,2) check (odds >= 1)
source text default 'internal'   -- 'internal' | 'the-odds-api'
active boolean default true
generated boolean default false
created_at, updated_at timestamptz
UNIQUE (match_id, market, selection)
```
RLS: `authenticated` SELECT (only `active=true`); `service_role` ALL. GRANTs included.

### New table: `market_odds_snapshots`
Immutable history for audit/settlement linkage.

```
id uuid pk
match_id uuid
market text, selection text
odds numeric(10,2)
source text
snapshot_at timestamptz default now()
```
RLS: `authenticated` SELECT; `service_role` ALL.

### Extend `predictions`
Add nullable columns (back-compat with existing rows):
- `selection_label text`
- `market_label text`
- `settled_result text`

Existing columns `market`, `outcome`, `reference_odds`, `potential_return`, `reference_odds_snapshot_id` already cover odds-at-prediction.

### Extend `prediction_market` enum
Add `over_under_2_5`, `half_time_full_time`, `exact_total_goals`. Keep existing values.

### Extend `matches`
Add nullable `home_score_ht int`, `away_score_ht int` for HT/FT settlement.

### New SQL functions
- `seed_match_market_odds(p_match_id uuid)` — generates internal odds for all selections of all new markets if missing. Pulled from the spec's suggested odds.
- `place_market_bet_atomic(p_user_id, p_match_id, p_market, p_selection, p_stake, p_client_request_id)` — looks up odds from `match_market_odds` (active only), reuses existing wallet debit + exposure pattern. For `result` market it delegates to existing `place_bet_atomic` to keep that path identical.
- Per-market settlement helpers, all idempotent (skip predictions already non-`pending`):
  - `settle_over_under_2_5(match, h, a)`
  - `settle_btts(match, h, a)` *(already partly covered by `settle_match_atomic`; keep that for `result` and add this for new placements written via new path)*
  - `settle_correct_score(match, h, a)`
  - `settle_exact_total_goals(match, h, a)`
  - `settle_half_time_full_time(match, h_ht, a_ht, h, a)`
- Wrap into `settle_match_all_markets_atomic(p_match_id, p_home, p_away, p_home_ht, p_away_ht)` that calls existing `settle_match_atomic` first (covers `result`/legacy `correct_score`/`total_goals`/`btts`) then the new helpers for any predictions still `pending` on the new markets. Idempotent + reuses `wallet_apply_change` + `platform_apply_change`.

### Exposure
Add view `match_market_exposure` aggregating `sum(potential_return)` grouped by `match_id, market, outcome` over pending predictions. Used by admin dashboard. The hard exposure cap stays on `result` (existing behavior) — new markets are capped per-bet via existing `max_stake_per_bet` / `max_potential_payout` settings.

## Phase 2 — Server functions

New file `src/lib/markets.functions.ts`:
- `getMatchMarkets({ matchId })` — returns grouped odds + labels for tabs Main/Goals/Correct Score/Specials. Auto-calls `seed_match_market_odds` if empty (and match not started). Hides HT/FT for non-simulation matches that have no `home_score_ht`.
- `placeMarketBet({ matchId, market, selection, stake, clientRequestId })` — calls `place_market_bet_atomic`. Snapshot insert into `market_odds_snapshots` before placement; stores returned `id` on the prediction.
- `getMarketExposure()` (admin) — reads the exposure view.
- `setMarketOdds({ matchId, market, selection, odds, active })` (admin) — audited update.

Extend `src/lib/settlement.server.ts` to call `settle_match_all_markets_atomic`. Extend `src/lib/sync.server.ts` to read & store HT score from football-data when available (`score.halfTime`), then run the new settle wrapper.

Existing `submitPrediction` keeps working for `result` and `tournament_winner`. Frontend for new markets uses `placeMarketBet`.

## Phase 3 — UI

`src/routes/_authenticated/matches.tsx` (or the match-detail card already shown there): add a Tabs control per match card with Main / Goals / Correct Score / Specials.
- Main: existing 1X2 buttons (unchanged).
- Goals: O/U 2.5, BTTS, Exact Total Goals as selection cards.
- Correct Score: 5×5 grid + OTHER.
- Specials: HT/FT grid (hidden if odds not available).

Bet slip: existing modal/inline form extended to accept `{market, selection, odds}` and call `placeMarketBet`. Shows stake → potential return live.

Min stake 50 rule (from earlier turn) still applies.

## Phase 4 — Admin

New page `src/routes/management/admin.markets.tsx`:
- Per match: list all markets/selections with odds, toggle `active`, edit odds (locked once kickoff passed).
- Exposure table grouped by match/market/selection, highlighting top liability.
- All edits audited via existing `audit_log`.

Extend `admin.simulation.tsx` to show stake/payout/P&L by market (reads new view).

## Phase 5 — Simulation

`src/lib/sim-worldcup.server.ts` updates:
- Generate HT scores (`pick_odds_weighted_score` extended) for sim matches.
- Seed multi-market bets with the 35/20/15/20/10 distribution.
- Settlement uses `settle_match_all_markets_atomic`.

## Acceptance check

- Existing match-winner bets continue to settle via untouched `place_bet_atomic` / `settle_match_atomic`.
- New markets place + settle through new atomic functions, sharing the same wallet/bankroll helpers (so ledgers stay consistent).
- Odds are server-only (client passes only `selection`).
- Snapshot row written per placement.
- All new tables have RLS + GRANTs.
- Build passes.

## Technical notes

- One migration creates tables, enum values, columns, view, and all functions in dependency order.
- New code paths are additive — no changes to `place_bet_atomic` or `settle_match_atomic` signatures.
- Idempotency: all new settle helpers gate on `status='pending'` with `FOR UPDATE`.
- Settlement wrapper safe to call multiple times.

## Files to be added / changed

**New**
- `supabase/migrations/<ts>_markets.sql` (via migration tool)
- `src/lib/markets.functions.ts`
- `src/lib/markets-catalog.ts` (shared labels + selection lists)
- `src/components/matches/MarketTabs.tsx`
- `src/routes/management/admin.markets.tsx`

**Edited**
- `src/routes/_authenticated/matches.tsx` (add tabs + new bet slip path)
- `src/lib/settlement.server.ts` (use wrapper)
- `src/lib/sync.server.ts` (store HT score, run wrapper)
- `src/lib/sim-worldcup.server.ts` (multi-market seeding/settlement)
- `src/routes/management/admin.simulation.tsx` (per-market analytics)
- `src/routes/management/admin.tsx` (nav entry for Markets)

Confirm and I'll start with the migration (you'll see the SQL before it runs), then ship the code in the order above.
