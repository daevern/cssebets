## Problem

On `/matches/:matchId`, markets like Double Chance (20.00x on every selection) and Correct Score (69x, 830x, 1647x, etc.) are showing platform-generated fallback odds — not real bookmaker prices. The DB confirms it: `match_market_odds` has ~4,000 rows with `generated = true, source = 'derived_poisson' / 'derived_poisson_adjusted' / 'derived_from_h2h'` alongside the real `generated = false, source = 'api-football'` rows.

The current reader (`loadMatchMarkets` in `src/lib/markets.functions.ts`) selects `active = true` without filtering `generated`, so real + fake rows are merged and the fake ones surface whenever a selection has no real counterpart.

## Fix

Only surface real bookmaker odds to users. Never render generated/derived-Poisson prices as if they were real.

### 1. `src/lib/markets.functions.ts` — `loadMatchMarkets`
- Add `.eq("generated", false)` to the `match_market_odds` query (both the initial select and the post-seed re-select).
- Keep the simulation auto-seed path intact (simulations legitimately generate their own book — those rows also come from `seed_match_market_odds`; verify seeded rows are inserted with `generated = false` or, if not, gate the filter on `is_simulation = false` so real matches drop generated rows but sim matches keep theirs).
- Result: real matches only expose `source = 'api-football'` / `derived_cards` / `derived_corners` (cards & corners are real derivations from match stats and are already stored with `generated = false`).

### 2. Verify server-side bet placement rejects the same rows
`place_market_bet_atomic` already throws `ODDS_NOT_TRUSTED` for untrusted odds — confirm it also rejects `generated = true` rows for non-simulation matches so a stale client cannot submit a hidden generated selection. If it doesn't, add that check.

### 3. UI resilience (`src/components/matches/MarketTabs.tsx`)
When a market tab (Double Chance, Correct Score, HT/FT, Exact Goals, Draw No Bet, To Qualify, Clean Sheet, Win-to-Nil, Odd/Even, Goals Odd/Even) has zero rows after filtering, hide the tab / render an "Odds unavailable" empty state instead of showing 20.00x fallbacks. No fabrication client-side either.

### 4. Data hygiene (non-blocking cleanup)
Deactivate existing generated rows so they never re-appear if a future query forgets the filter:
```sql
UPDATE public.match_market_odds
SET active = false
WHERE generated = true
  AND match_id IN (SELECT id FROM public.matches WHERE is_simulation = false);
```

## Out of scope
- No change to simulation matches' generated markets (those are intentional).
- No change to the odds sync pipeline, margin logic, or settlement.
- No change to the admin `regenerate_match_market_odds` RPC — admins can still generate for internal/simulation use; users just won't see generated rows.

## Files touched
- `src/lib/markets.functions.ts` (filter)
- `src/components/matches/MarketTabs.tsx` (empty-state)
- one migration for the cleanup UPDATE + optional `place_market_bet_atomic` hardening
