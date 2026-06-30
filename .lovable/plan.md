
# Match Analytics Page — Plan

Goal: when a user opens a fixture (from Matches, Picks, or anywhere a match is clickable), instead of the current odds-history / "bets closed" placeholder, render a dedicated analytics page for that specific match. Same dark scoreboard / stencil aesthetic as the rest of the app. Mobile-first. No new data sources beyond what API-Football and football-data.org already give us.

## What the page shows (by phase)

The page adapts to the match clock. Sections appear/disappear based on what data is actually available — never show empty stencil panels.

### Phase A — Pre-match, no lineup yet (T-∞ → T-60min)
1. **Header block** — flags, team names, kickoff countdown, stage label (Round of 16 etc.), venue, referee (if API-Football has it).
2. **Form guide** — last 5 matches per team (W/D/L pills with score + opponent). From `/teams/statistics` + `/fixtures?team=&last=5`.
3. **Head-to-head** — last 5 H2H meetings with scores. From `/fixtures/headtohead`.
4. **Season stats side-by-side** — goals for/against, clean sheets, BTTS %, avg corners, avg cards, win % by venue (home/away split). From `/teams/statistics`.
5. **Tournament standing / path** — for knockouts, show the bracket path (who they beat to get here); for groups, group table snippet.
6. **Odds movement** — keep existing odds-history chart but downsize it to one panel, not the whole page.
7. **Place bet CTA** — sticky on mobile, links into the existing bet flow.

### Phase B — Lineups released (T-60 → kickoff)
8. **Confirmed lineups** — both XI with formation label (4-3-3 etc.). From `/fixtures/lineups`.
9. **Formation pitch diagram** — SVG pitch with player dots positioned by API-Football grid coords. Tap a dot → mini player card (number, position, season goals/assists/cards from `/players?team=&season=`).
10. **Bench** — list of substitutes with numbers.
11. **Coach** — names per side.
12. **Missing / predicted absences** — players in the squad but not in the 18, with a "rotation / injury / suspension" note if API-Football flags it via `/injuries`.

### Phase C — In-play (kickoff → final whistle)
13. **Live score + clock** — from `/fixtures?id=&live=all` polling cadence we already set up.
14. **Event timeline** — goals, cards, subs, VAR. From `/fixtures/events`. Stencil ticker style.
15. **Live stats** — possession %, shots, shots on target, corners, cards, xG if available. From `/fixtures/statistics`.
16. **Live formation** — same pitch diagram, swaps in subs as they happen.
17. **Momentum bar** — derived from recent events (last 10 min weighted) — pure client-side calc, no extra API.

### Phase D — Full time
18. **Final score banner** with HT score, ET / pens breakdown if applicable.
19. **Full match stats** — same panel as live, frozen.
20. **Player ratings** — from `/fixtures/players` (API-Football provides ratings & per-player stats).
21. **Settlement summary** — which markets paid, which voided, list of user's own bets on this match with outcome (only for signed-in user).

## Data sources & API-Football endpoints used

All net-new endpoints. Each is added to the quota tracker before first call.

| Endpoint | When | Cache TTL | Quota notes |
|---|---|---|---|
| `/fixtures?id=` | On open + every 60s if live | 60s pre, 60s live | low |
| `/fixtures/lineups?fixture=` | Every 5 min in T-90→T-30 window, then frozen | until kickoff | 1×/fixture once published |
| `/fixtures/events?fixture=` | Every 90s during live | 90s | live-only |
| `/fixtures/statistics?fixture=` | Every 2 min during live + once at FT | 2 min | live-only |
| `/fixtures/players?fixture=` | Once at FT | permanent | 1×/fixture |
| `/fixtures/headtohead?h2h=A-B` | First open per match, cached 24h | 24h | 1×/match |
| `/teams/statistics?team=&league=&season=` | Once per team per tournament, cached | 7d | 2×/match max |
| `/injuries?fixture=` | Once 24h pre + once 2h pre | 12h | 2×/fixture |
| `/standings?league=&season=` | Once daily | 24h | 1×/day |

Already-used `/odds?fixture=` stays as-is for bet pricing.

Football-data.org stays as the settlement source-of-truth for goals (90-min rule we already enforce).

## Database additions (one migration)

- `match_lineups` (match_id, side, formation, coach, starters jsonb [{number, player_id, name, pos, grid}], substitutes jsonb, fetched_at) — unique on (match_id, side).
- `match_events` (id, match_id, minute, extra_minute, type, team_side, player_name, assist_name, detail, comments, created_at) — append-only, dedup key (match_id, minute, type, player_name).
- `match_stats` (match_id, side, possession, shots_total, shots_on, corners, fouls, yellow, red, xg, saves, passes_total, passes_accurate, fetched_at) — unique on (match_id, side).
- `match_player_ratings` (match_id, side, player_id, player_name, minutes, goals, assists, rating, shots, passes, tackles, yellow, red, fetched_at).
- `match_h2h` (team_a_key, team_b_key, fixtures jsonb, fetched_at) — pair key normalized.
- `team_season_stats` (team_key, league_id, season, payload jsonb, fetched_at).
- `match_injuries` (match_id, side, player_name, type, reason, fetched_at).

All public-schema tables get the standard GRANT + RLS block:
- `SELECT TO anon, authenticated` (this is non-sensitive public match data)
- `ALL TO service_role`
- Writes only via service-role server functions (no INSERT/UPDATE/DELETE policy for `authenticated`).

## Server functions & jobs

New files:
- `src/lib/apifootball-analytics.server.ts` — wrappers per endpoint, each routes through the existing quota guard in `apifootball.server.ts`.
- `src/lib/match-analytics.functions.ts` — `getMatchAnalytics({ matchId })` returns a single bundle (header, h2h, form, stats, lineups if present, events if live, player ratings if FT). Auth-required. Uses the cached tables; triggers on-demand refresh only when cache is stale.
- `src/lib/match-analytics-sync.server.ts` — pure server helpers: `syncLineups(matchId)`, `syncLiveState(matchId)`, `syncFullTime(matchId)`, `syncPreMatch(matchId)`.

New cron hooks under `src/routes/api/public/hooks/`:
- `apifootball-lineups.ts` — every 5 min, picks fixtures with kickoff in next 90 min and no lineup yet.
- `apifootball-live.ts` — every 60s, only fires when ≥1 fixture is in-play; pulls live fixture + events + stats for each.
- `apifootball-fulltime.ts` — every 10 min, picks fixtures that ended 5–60 min ago and have no player ratings row yet.
- `apifootball-prematch.ts` — every 30 min, picks fixtures in next 48h missing H2H or team stats.

All hooks share the existing quota guard and bail out cleanly if quota is near cap. Live hook is bypassed when no live fixtures exist (zero req cost).

## UI files

- `src/routes/_authenticated/matches.$matchId.tsx` — new route, full-page analytics view. Replaces the current "open match → modal/drawer with odds history" interaction.
- Make existing match rows in `matches.tsx`, `my-predictions.tsx`, dashboard `BenchSlider` link to `/matches/$matchId`.
- `src/components/match-analytics/` — new folder:
  - `MatchHeader.tsx` (flags, countdown, stage, venue, ref)
  - `FormGuide.tsx` (W/D/L pills per side)
  - `HeadToHead.tsx`
  - `TeamStatsCompare.tsx` (side-by-side bar comparisons)
  - `FormationPitch.tsx` (SVG pitch + dots, tap → `PlayerCard.tsx`)
  - `LineupList.tsx` (numbered list, bench)
  - `InjuryList.tsx`
  - `EventTimeline.tsx` (live ticker)
  - `LiveStatsPanel.tsx` (possession bar, shots, etc.)
  - `MomentumBar.tsx` (client-derived)
  - `PlayerRatingsTable.tsx`
  - `OddsMovementCompact.tsx` (downsized chart, reuses existing data)
  - `BetCtaSticky.tsx` (mobile sticky bottom bar → opens market sheet)
- All styled with the existing PageShell / StencilPanel + scanline aesthetic, custom NavIcons style for any new icons (formation, whistle, pitch, card).

## Behaviour & loading rules

- Sections render independently. If lineups aren't out, the Lineups & Formation cards show a stencil "Lineups drop ~1h before kickoff" state, not a spinner forever.
- If API-Football returns no data for a section (e.g. injuries unavailable for that league), the section is hidden — never an empty card.
- Loader: `_authenticated` route loader pre-fetches `getMatchAnalytics` via TanStack Query so the initial paint already has cached data; live sections subscribe via `useQuery` with 60s polling only when status === `live`.
- Mobile-first: vertical stacking, sticky bet CTA, horizontal-scroll only for stats comparison bars when they overflow.
- The current "bets closed" panel becomes a single inline notice inside the markets module; the analytics page itself never disappears for in-play or finished matches.

## What stays out of scope

- No paid live-odds endpoint, no OpticOdds, no extra subscription.
- No player-prop pricing UI changes (those still live under markets).
- No bracket editor / what-if simulator — read-only analytics only.
- No push notifications.

## Open question before I build

Quota: phases C + D add ~3 extra requests per live fixture per minute (live fixture poll + events + stats). On an 8-fixture peak day with everything live for ~110 min, that's ~2.6k req across the live window — well inside Pro's 7.5k/day, but only if we also keep the existing 30-min `/odds` sync. I will gate live polling so it only runs while at least one fixture is in-play, and skip refresh if the fixture's last-event timestamp hasn't moved. Confirm this is acceptable, or tell me to cut a section, before I start.
