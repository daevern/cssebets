# Bonus leagues (MLS + Brasileirão Série A)

Ship a new **Bonus** category powered by the same API-Football sports pipeline the EPL/La Liga/UCL routes already use — reusing `sports_events` / `sports_markets` / `sports_bets` end-to-end. **World Cup code paths (`matches` table, `predictions` table, `/matches/*` routes) are not modified.**

Why this shape: `sports_events` + `syncAllFootballFixtures` + odds sync + settlement + `place_sports_bet_atomic` already work for any league in `FOOTBALL_COMPETITIONS` that has a feature flag enabled. Duplicating the 1,685-line World Cup match-detail page byte-for-byte would fork three data stores; instead we reuse the proven `FootballMatchDetailsPage` (same market cards, bet slip, odds-history graph, live trade tape as EPL) and give the section a **World Cup–styled landing page**.

## What ships

**1. Config**
- `src/features/football/config/footballCompetitions.ts`: extend `FootballCompetitionCode` union with `MLS` and `BRA_A`; add entries (leagueIds 253 + 71, season 2026, `routePath: "/bonus/mls" | "/bonus/brasileirao"`, flags `mls_enabled` / `brasileirao_enabled`, new field `group: "world_cup" | "domestic" | "bonus"`).
- `src/features/football/football.functions.ts`: extend the zod `COMPETITION_CODES` tuple to include the two new codes.

**2. Migration** (single call)
- Insert two rows into `sports_feature_flags` (`mls_enabled`, `brasileirao_enabled`, both enabled).

**3. Routes** (new files, World-Cup-styled)
- `src/routes/_authenticated/bonus.tsx` — layout w/ `<Outlet />`.
- `src/routes/_authenticated/bonus.index.tsx` — league switcher tabs (MLS / Brasileirão), Live / Upcoming / Recently finished sections. Reads via `listFootballMatches`. Card visual language mirrors `matches.index.tsx` (stencil header, kick-off chips, odds triple w/ implied %). Own head() metadata.
- `src/routes/_authenticated/bonus.$matchId.tsx` — renders the existing `FootballMatchDetailsPage` (same UX every EPL match already uses: market cards, bet slip, odds graph, trade tape).
- Update the football match card link path helper so cards under `/bonus` navigate to `/bonus/{matchId}` rather than `/football/{code}/matches/{matchId}` when rendered inside the bonus route (small conditional via a new `linkBasePath` prop on `FootballMatchCard`).

**4. Nav**
- `src/components/nav/CategoryRail.tsx`: add a "Bonus" chip pointing to `/bonus` gated on `mls_enabled || brasileirao_enabled`.

**5. Dashboard "Next on the card"**
- `src/lib/dashboard-extras.functions.ts`: add `nextBonusMatch` field — earliest scheduled `sports_events` row where `sport_code='football'` and `competition_code IN ('MLS','BRA_A')`, plus its 1x2 odds from `sports_markets`.
- `src/routes/_authenticated/dashboard.tsx`: render a `NextBonusMatchCard` in the "Next on the card" strip, styled to match `NextRaceCard` / `NextFightCard` (same rounded card, sport badge, implied % row).

**6. My Picks integration**
- `src/routes/_authenticated/my-predictions.tsx`: add a new query calling `listMyFootballBets` (already exists) and render bonus/EPL/etc bets in the existing ticket-shell style. Filter to bets whose `sports_event.competition_code` is MLS/BRA_A for a "Bonus" section header; other football sports_bets slot into their own section so nothing else disappears.

**7. Admin**
- `src/lib/admin-dashboard.functions.ts` `listPredictionsAdmin`: when `sport === 'football' | 'all'`, also fetch from `sports_bets` (already indexed by `sport_code='football'`), joined to `sports_events` for the fixture label + competition. Normalize to the same row shape (id/user_id/market/selection/stake/odds/status). This surfaces MLS + Brasileirão bets (and any other API-Football league bets) in admin predictions.
- `src/routes/management/admin.football.tsx` needs no changes — it iterates `ALL_FOOTBALL_COMPETITIONS` and will auto-list the new leagues.

**8. Cron / sync** — no changes.
- `syncAllFootballFixtures` already loops every entry in `FOOTBALL_COMPETITIONS` and syncs the ones whose flag is enabled.
- `/api/public/hooks/football-sync|live|settle` cron endpoints already cover the new leagues.
- Settlement (`settleFinishedFootballEvents`) is competition-agnostic and pays out through `place_sports_bet_atomic`'s ledger.

## Explicitly NOT touched

- `matches`, `predictions`, `match_market_odds` tables and any `/matches/*` route.
- `src/lib/sync.server.ts` (World Cup football-data.org sync).
- `src/lib/matches.functions.ts`.
- The existing EPL/La Liga/Serie A/UCL routes and their behavior.

## Risks / notes

- The World Cup match-detail page is much richer than `FootballMatchDetailsPage` (1,685 vs 197 lines). Reusing the football detail page means Bonus matches get the same UX as EPL matches — not the World Cup one. If a byte-for-byte World Cup clone is required, that's a separate ~2k-line duplication project that would also fork data storage; call it out and we can plan phase 2.
- API-Football's free tier is 100 req/day. MLS + Brasileirão will consume additional quota during fixture + odds sync windows; the existing throttling in `apifootball_quota` protects the pool.
