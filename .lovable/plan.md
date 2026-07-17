## Phase 2 — UFC hardening + F1 launch

Two parallel tracks. UFC stays where it lives today (`src/lib/ufc*.ts`, `src/routes/_authenticated/ufc.*`, `ufc_*` tables). F1 is built fresh in the same isolated pattern as football (`src/features/f1/`, `f1_*` tables) so it can't destabilise anything else.

Execution order: **F1 foundation first** (schema + sync), then **UFC hardening**, then **F1 UI + admin**, then **cron + polish**. Ship in that order so each layer is verifiable before the next.

---

### Track A — UFC hardening (no rewrite)

Applied to existing files only. No architectural changes; existing routes, tables, and bets stay intact.

1. **Retry + concurrency on the API-Sports MMA adapter** — reuse `src/features/football/services/retry.ts` (`withRetry`) inside `src/lib/apimma.server.ts` for all `apiMmaGet` calls; add a lock table check in `src/lib/ufc-odds.server.ts` `runUfcOddsSync` / `runUfcAutoSettle` to prevent overlapping cron runs.
2. **Quota + sync-run tracking** — record each MMA API call into `apifootball_quota` (rename column-free, just tag `provider='mma'`) and write a row per sync into a new `sports_sync_runs`-style entry so UFC shows up in existing sync-health dashboards. Reuse the football sync-runs table by adding a `sport` discriminator (already present).
3. **Odds-freshness guard** — mark UFC markets stale after N seconds without a snapshot; suppress bet placement on stale odds in `src/lib/ufc.functions.ts` place-bet path.
4. **Admin observability on `/management/admin/ufc`** — add three panels: last 20 sync runs, current MMA quota, and open-bet liability per fight (aggregate stake + potential payout by fight_id).
5. **Settlement safety** — confirmation dialog already exists; add server-side idempotency check (reject settle if `status='finished'`) and audit log entry.
6. **Live trade tape** on the fight details page (`src/routes/_authenticated/ufc.$fightId.tsx`) — anonymised recent bets, reuse pattern from `src/features/football/components/LiveTradeTape.tsx`.
7. **Odds history sparkline** on each UFC market card — reuse `OddsHistoryGraph.tsx` component; new server fn `getUfcOddsHistory`.

No changes to: UFC schema, existing markets, existing bet flow, wallet integration.

---

### Track B — F1 (isolated, new feature folder)

Mirrors the football architecture exactly. Zero touch to football, UFC, or World Cup.

**New folder:** `src/features/f1/`
```text
adapters/apiF1Adapter.server.ts     # API-Sports Formula-1 client + retry
adapters/marketMapper.ts            # provider payload → internal market rows
config/f1Seasons.ts                 # season + race calendar config
services/f1Sync.server.ts           # fixtures, standings, results sync
services/f1Settlement.server.ts     # race + championship settlement
services/f1OddsBuilder.server.ts    # house odds from qualifying + standings
components/F1RaceCard.tsx
components/F1MarketCard.tsx
components/F1BetSlip.tsx
components/F1DriverGrid.tsx
components/F1StandingsPanel.tsx
pages/F1SeasonPage.tsx              # calendar + championship outrights
pages/F1RaceDetailsPage.tsx         # per-race markets
f1.functions.ts                     # server fns for UI + admin
types/f1.ts
```

**New routes:**
- `/f1` — season overview + championship outrights
- `/f1/races/$raceId` — race markets + bet slip
- `/management/admin/f1` — admin dashboard

**Markets shipped:**
- Race winner (outright per GP)
- Podium finish (top-3 per driver)
- Points finish (top-10 per driver)
- Head-to-head matchups (auto-generated from qualifying pairs of teammates + top-10 pairs)
- Championship outrights: Drivers' title + Constructors' title

**House odds model** (API-Sports has no native F1 odds):
- Base probability from championship standings position (softmax over points).
- Adjusted by qualifying grid position when available (linear boost for pole/front row).
- Convert to decimal odds with a fixed 6% overround, floor at 1.05, cap at 50.00.
- Recompute on qualifying result, race start, and post-race for next round.

**Championship outrights:**
- Snapshot after every race weekend.
- Settled when mathematically clinched (points gap > remaining points) or at season end.

---

### Database (Track B only)

New migration creates:
- `f1_seasons` (year, active, name)
- `f1_races` (race_key, season, round, name, circuit, starts_at, status, results_json)
- `f1_drivers` (driver_key, name, team, number, active)
- `f1_constructors` (team_key, name, active)
- `f1_race_markets` (race_id, market_type, selection_key, label, odds, status, opened_at, closed_at)
- `f1_race_odds_snapshots` (market_id, odds, snapshot_at) — powers sparklines
- `f1_bets` (user_id, race_id, market_id, selection_key, stake, odds_locked, potential_payout, status, settled_at)
- `f1_championship_markets` + `f1_championship_bets` (season-long outrights)
- `f1_sync_runs` (provider run log, or reuse `sports_sync_runs` if it already discriminates by sport)

All tables: GRANT to `authenticated`/`service_role`, RLS enabled, policies:
- Drivers/races/markets/snapshots: `SELECT` open to `authenticated`.
- Bets: user sees own only; admins see all via `has_role('admin')`.
- Admin write via `service_role` through server functions using `supabaseAdmin`.

`updated_at` trigger on all mutable tables.

---

### Cron jobs (pg_cron via supabase--insert after routes deploy)

New `/api/public/hooks/*` routes and their schedules:
- `f1-sync` — every 15 min: races, drivers, standings, quali results.
- `f1-odds-rebuild` — every 30 min during race weekends, hourly otherwise: recompute house odds + snapshot.
- `f1-settle` — every 5 min on race day: settle finished races + refresh championship math.
- `ufc-quota-log` — every hour: roll up MMA quota (piggybacks existing UFC cron).

Existing UFC crons untouched; the hardening code plugs into them.

---

### Technical details

- API-Sports F1 base: `https://v1.formula-1.api-sports.io`, same `x-apisports-key` header, same `API_FOOTBALL_KEY` secret.
- Endpoints used: `/races?season=X`, `/rankings/drivers`, `/rankings/teams`, `/rankings/races?race=Y` (results + quali), `/drivers?season=X`, `/teams?season=X`.
- All server work goes through `createServerFn` with `requireSupabaseAuth` for user-facing calls; admin actions verify `has_role('admin')` before touching `supabaseAdmin`.
- Public read endpoints for the season/race pages use the server publishable client behind narrow `TO anon` policies — same pattern as football.
- Cron hooks live under `/api/public/hooks/`; auth via `apikey` header carrying anon key.
- All API calls wrapped in `withRetry` with exponential backoff.
- Vitest coverage: F1 odds-builder unit tests (softmax normalisation, overround, floors/caps) and settlement decider tests (race winner, podium, points, h2h).

---

### Explicitly NOT included

- NBA (skipped as previously agreed).
- Live in-race markets (safety car, next retirement) — provider doesn't feed them cleanly.
- UFC schema migration or route restructure.
- Any change to World Cup, football, wallet ledger, or auth.
