# CSSEBets Multi-Sport Expansion Plan

Build EPL, La Liga, Serie A, UCL, UFC, F1, NBA as a fully separate architecture. The existing World Cup 2026 system stays frozen — zero modifications to its files, routes, tables, or logic.

## Guardrails (non-negotiable)

- **Protected World Cup file list** (identified up front, not touched):
  - Routes: `src/routes/_authenticated/matches.tsx`, `matches.index.tsx`, `matches.$matchId.tsx`
  - Server libs: `src/lib/apifootball*.{server,functions,ts}`, `src/lib/sim-worldcup.server.ts`, `src/lib/matches.functions.ts`, `src/lib/markets*.ts`, `src/lib/odds*.server.ts`, `src/lib/settlement.server.ts`, `src/lib/sync.server.ts`, `src/lib/match-analytics*.ts`, `src/lib/predictions*.ts`, `src/lib/bet-edit.functions.ts`, `src/lib/market-history.functions.ts`
  - Cron hooks: `src/routes/api/public/hooks/apifootball-*.ts`, `sync-fixtures.ts`, `odds-live.ts`
  - Tables: `matches`, `match_*`, `market_*`, `apifootball_*`, `predictions`, `tournaments`, `tournament_outrights`, `match_pool_transactions`, `match_stake_pools`
  - Existing UFC files remain as-is (already sport-specific).
- No changes to wallet formulas, RLS on WC tables, admin WC pages, or global styles used by WC.
- CategoryRail's `/matches` link (WC) is preserved; new links are added, WC entry unchanged.

## Phase 1 — Football (EPL / La Liga / Serie A / UCL)

### Data model (all NEW, additive)
New tables (prefixed `sports_` — fully isolated from `matches` / WC):
- `sports_events`, `sports_event_provider_mappings`
- `sports_markets`, `sports_market_selections`
- `sports_odds_snapshots`, `sports_results`
- `sports_bets`, `sports_bet_ledger_links`
- `sports_settlement_runs`, `sports_settlement_items`
- `sports_sync_runs`, `sports_sync_errors`
- `sports_feature_flags`, `sports_competitions`

Each table: GRANTs to authenticated/service_role, RLS enabled, policies scoped to `auth.uid()` for bets; admin-only for ops tables via `has_role`. Indexes on `(sport_code, competition_code, scheduled_at)`, unique `(provider, provider_event_id)`.

### Backend
- `src/features/football/adapters/apiFootballAdapter.server.ts` — reuses env `API_FOOTBALL_KEY` via its own quota-aware client (new file, does NOT import existing `apifootball.server.ts`).
- `src/features/football/adapters/oddsApiAdapter.server.ts` — new Odds API client (needs `ODDS_API_KEY` secret).
- `src/features/football/services/footballSync.server.ts` — fixtures, odds, live scores, results.
- `src/features/football/services/footballSettlement.server.ts` — per-market settlement.
- `src/features/football/services/footballBets.functions.ts` — atomic bet placement using existing wallet RPC.
- `src/features/football/services/eventMapping.server.ts` — API-Football ↔ Odds API mapping with confidence scoring; low-confidence → admin review.

### Frontend
- `src/features/football/config/footballCompetitions.ts` — centralized config (league ID, sport key, markets, flags).
- Pages: `FootballCompetitionPage.tsx` (parameterized by competition), `FootballMatchDetailsPage.tsx` (visually mirrors WC match page; copies rather than modifies WC components).
- Components: `FootballMatchCard`, `FootballMatchHeader`, `FootballMarketCard`, `FootballBetSlip`, `FootballMarketGraph`, `FootballLiveTrades` — new copies styled to match WC.
- Hooks: `useFootballCompetition`, `useFootballMatch`, `useFootballMarkets`.

### Routes (all new)
- `/football/epl`, `/football/la-liga`, `/football/serie-a`, `/football/ucl`
- `/football/matches/$matchId`

### Navigation
Update `src/components/nav/CategoryRail.tsx` to:
- Keep World Cup entry pointing to `/matches` (unchanged).
- Point EPL/La Liga/Serie A/UCL/UFC/F1/NBA to new routes, gated by feature flags. Locked = `soon: true` until flag flips.
- Active detection: current pathname + loaded event's `competition_code` on match-detail routes.

### Cron
New public hooks: `/api/public/hooks/football-sync-fixtures`, `football-sync-odds`, `football-sync-live`, `football-settle`. Scheduled via `pg_cron` using `apikey` header pattern.

### Admin
Additive admin page `src/routes/management/admin.sports.tsx` (index) + tabs for events, mappings, sync runs, settlement runs, sync errors. No modifications to existing WC admin pages.

## Phase 2 — UFC (new, separate from existing UFC)
Note: existing `ufc.*` routes already work. Decision needed: extend existing UFC or build parallel via `sports_events`? **Proposal**: leave existing UFC in place; only add link in CategoryRail to existing `/ufc`. Skip rebuilding unless the user wants it merged into new sports pipeline.

## Phase 3 — NBA
Routes `/nba`, `/nba/games/$gameId`. Provider: TBD (BallDontLie free / API-Sports basketball). Needs new secret. Markets: Moneyline, Spread, Totals, Team Totals, half/quarter variants.

## Phase 4 — F1
Routes `/f1`, `/f1/events/$eventId`, `/f1/races/$raceId`. Provider: TBD (API-Sports F1 / OpenF1). Needs new secret. Markets: Race Winner, Podium, Top 6/10, H2H, Constructor, Fastest Lap, Pole.

## Feature flags
DB-backed `sports_feature_flags` + `getFeatureFlags()` server fn cached client-side. Release order EPL → La Liga → Serie A → UCL → UFC → NBA → F1.

## Secrets required (I will request when starting each phase)
- `ODDS_API_KEY` (Phase 1)
- NBA provider key (Phase 3)
- F1 provider key (Phase 4)
- `API_FOOTBALL_KEY` already set — reused read-only.

---

## Scope reality check — please confirm before I start

This is roughly **60–100 new files, 12+ new tables, 4+ cron jobs, 3 new external API integrations**, and 4 phases of work. It will take many turns and burn significant credits. To avoid a runaway build I want to confirm:

1. **Start with Phase 1 only (Football)** and stop for your review before UFC/NBA/F1? (Strongly recommended.)
2. **UFC**: keep the existing `/ufc` implementation as-is and just link it in the rail, or rebuild it into the new `sports_events` architecture? (Rebuilding duplicates working code.)
3. **Providers for NBA and F1**: do you already have accounts/keys, or should I pick free tiers (BallDontLie for NBA, OpenF1 for F1)?
4. **Odds API subscription**: The Odds API requires a paid plan for reasonable request volume across 4 leagues. Do you have a key ready?

Once you confirm, I'll begin Step 1 of Phase 1: the additive DB migration for `sports_*` tables.
