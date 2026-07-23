# Bonus Leagues (MLS + Brasileirão) — full World Cup clone

Goal: ship a self-contained "Bonus" section for MLS and Brasileirão Série A that mirrors the World Cup `/matches` experience to the pixel, with its own data pipeline (API-Football), admin risk tools, picks integration, and dashboard cards. The existing World Cup section stays untouched.

## 1. Data model (new tables, isolated from `matches`)

New Supabase tables (kept separate from `matches`, `predictions`, `sports_events` so nothing about the World Cup flow changes):

- `bonus_leagues` — catalog row per league (`code` MLS / BRA_A, display name, API-Football `league_id`, `season`, `enabled`).
- `bonus_matches` — fixture rows (external_id from API-Football, league_code, teams, crests, kickoff, status, scores incl. HT/FT, reference_odds JSON, odds_updated_at, odds_status, margin_disabled).
- `bonus_match_market_odds` — per-market odds rows (same shape as `match_market_odds`, keyed by `bonus_match_id`).
- `bonus_match_odds_snapshots` — history for the market-movement graph.
- `bonus_predictions` — user picks (mirrors columns/statuses of `predictions`).
- `bonus_wallet_transactions` are NOT introduced — reuse existing `wallets` / `wallet_transactions` with `context = 'bonus'`.

Migration adds: GRANTS (authenticated CRUD, service_role all), RLS (owner-only on `bonus_predictions`, read-only on the rest for authenticated), settlement RPC `settle_bonus_predictions_for_match`, and a `regenerate_bonus_match_market_odds` RPC parallel to the existing one.

## 2. Sync pipeline (API-Football, server-only)

New folder `src/features/bonus/` mirroring `src/features/football/`:

- `config/bonusLeagues.ts` — MLS (league 253, season 2026) and Brasileirão Série A (league 71, season 2026).
- `services/bonusSync.server.ts` — `syncAllBonusFixtures`, `syncBonusOddsBatch`, `syncBonusLiveScores` using the existing `apiFootballAdapter.server.ts` helpers (rate-limited, throttled, `sports_sync_runs` audit rows).
- `services/bonusSettlement.server.ts` — reuses `decideWinningKeys` + adapter for goal/BTTS/CS/HT-FT markets on the new tables.
- `services/oddsFreshness.server.ts` — suspends stale bonus markets.
- Public hooks under `src/routes/api/public/hooks/`: `bonus-sync.ts`, `bonus-live.ts`, `bonus-settle.ts`. pg_cron entries added in the migration (sync every 15 min, live every 1 min while any match is live, settle every 5 min).

## 3. UI clone (World Cup template, forked verbatim)

Fork the World Cup files into a new `bonus` namespace so nothing on `/matches` changes:

- `src/routes/_authenticated/bonus.tsx` (layout with `<Outlet />`).
- `src/routes/_authenticated/bonus.index.tsx` — clone of `matches.index.tsx`, adds a league toggle (MLS | Brasileirão). Reads from `bonus_matches`.
- `src/routes/_authenticated/bonus.$matchId.tsx` — clone of `matches.$matchId.tsx` (1685 lines), swapped to new server fns and tables. Keeps every tab, chart, analytics, live tape, market card and bet slip identical.
- `src/lib/bonus.functions.ts` — server fns mirroring `matches.functions.ts` / `predictions.functions.ts` (list, detail, place bet with duplicate-bet guard, cash-out, market history).
- Category rail (`src/components/nav/CategoryRail.tsx`) gets a "Bonus" chip routing to `/bonus`; top-nav breadcrumbs updated.

Duplicate-bet prevention, live suspension, keyboard-focus fix, and "no-picks" summary state all carry over from the fork.

## 4. Picks integration

`src/routes/_authenticated/my-predictions.tsx` gains a `bonus` source alongside football/ufc/f1: new `listBonusPicks` server fn plus a `BonusTicketShell` component (clone of `F1TicketShell`) so bets appear immediately in "My Picks" and settle into the same wallet ledger.

## 5. Admin

New admin routes cloned from the football/f1 pattern:

- `src/routes/management/admin.bonus.tsx` — fixture list, force sync, resettle, void, market-suspend/resume, margin toggle, per-match risk exposure (uses existing `match_exposure_scenarios` shape wired to `bonus_matches`).
- `src/routes/management/admin.bonus-risk.tsx` — correlated exposure + bankroll view scoped to Bonus.
- `admin.predictions.tsx` — add `bonus` source filter and columns so staff can see and manually place/void Bonus predictions (mirrors the F1 addition done recently).
- Nav entry added in `admin.tsx` sidebar.

## 6. Dashboard

`src/routes/_authenticated/dashboard.tsx` — extend the "Next on the card" strip with a `NextBonusMatchCard` (clone of the F1/UFC card styling) that shows the next kickoff across enabled Bonus leagues, driven by a new `nextBonusMatch` field returned from `dashboard-extras.functions.ts`.

## 7. Verification

- Run `bunx tsgo --noEmit`.
- Vitest for `decideWinningKeys` reused; add a smoke test for `bonusSync` mapping.
- Playwright: load `/bonus`, open a fixture, place a guarded bet, verify it lands in `/my-predictions`, verify admin sees it in `admin.predictions` filtered to Bonus.

## Technical notes

- API-Football league IDs: MLS = 253, Brasileirão Série A = 71. Season string `2026`.
- Reuses existing `FOOTBALL_DATA_API_KEY` is NOT applicable — API-Football key already stored as `APIFOOTBALL_KEY` (used by `apifootball.server.ts`); reuse it.
- Odds provider inside API-Football: bookmaker aggregate; same margin pipeline (`apply3WayMargin`) as `/matches`.
- All new tables get `GRANT ... TO authenticated`, `GRANT ALL ... TO service_role`, RLS on, and policies scoped to `auth.uid()` on `bonus_predictions`. Snapshot tables are NOT added to the realtime publication (matches the security stance we set for `market_odds_snapshots`).
- No changes to `matches`, `predictions`, `match_market_odds`, or the World Cup routes.
