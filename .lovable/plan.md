# API-Football Integration — Maximize Markets on Free Tier

## The hard constraint
Free plan = **100 requests / day, 10 req/minute, current season only**. World Cup 2026 is the current season ✅. Every market we add must fit inside that quota. Budgeting is the entire game here — get it wrong and the API dies at 3pm.

## Daily request budget (knockout phase, peak day = 8 fixtures)

| Job | Endpoint | Frequency | Req/day |
|---|---|---|---|
| Fixture list refresh | `/fixtures?league=1&season=2026` | 2× | 2 |
| Pre-match odds (per fixture, all bookmakers) | `/odds?fixture=` | 1× per fixture, 24h before kickoff | 8 |
| Pre-match odds refresh (T-3h sharper line) | `/odds?fixture=` | 1× per fixture | 8 |
| Lineups (T-60min) | `/fixtures/lineups?fixture=` | 1× per fixture | 8 |
| Live fixture state (in-play only) | `/fixtures?live=all` | every 60s during live windows | ~40 |
| Events (goals, cards, subs) | `/fixtures/events?fixture=` | every 90s per live fixture | ~25 |
| Final stats & player ratings (T+15min) | `/fixtures/statistics`, `/fixtures/players` | 1× per fixture | 8 |
| **Total peak day** | | | **~99** |

Non-match days drop to <10 req. We never poll `/odds` live (burns quota); pre-match prices are frozen at kickoff and our derived in-play logic takes over.

## Markets to add (using API-Football real bookmaker prices)

API-Football exposes **30+ bet types** per fixture via `/odds`. Onboarding priority:

### Phase 1 — Pre-match, real bookmaker prices (replaces today's fabricated odds)
1. **Match Winner (1X2)** — replaces current derived
2. **Goals Over/Under** — full ladder 0.5 → 6.5 (today: only 2.5)
3. **Both Teams Score**
4. **HT/FT Double** — real prices (today: fabricated from h2h)
5. **Correct Score** — real prices (today: fabricated; this caused settlement disputes)
6. **Double Chance** (1X, X2, 12) — new
7. **First Half Winner** + **Second Half Winner** — new
8. **HT Goals Over/Under 0.5, 1.5, 2.5** — new
9. **Exact Goals Number** — real prices
10. **Odd / Even Goals** — new, easy market, 50/50ish
11. **Team to Score First** + **Team to Score Last** — new
12. **Clean Sheet — Home / Away** — new
13. **Win to Nil** — new

### Phase 2 — Cards & corners (high-margin, sharps avoid)
14. **Total Cards Over/Under** (3.5, 4.5, 5.5)
15. **Home/Away Cards Over/Under**
16. **Red Card in Match — Yes/No**
17. **Total Corners Over/Under** (8.5, 9.5, 10.5)
18. **First Corner — Home/Away**
19. **Booking Points Over/Under**

### Phase 3 — Lineup-gated (publish only after `/fixtures/lineups` returns at T-60)
20. **Anytime Goalscorer** — per starting XI
21. **First Goalscorer**
22. **Last Goalscorer**
23. **Player to Score 2+** — premium-priced
24. **Player to be Booked**
25. **Player to be Sent Off**

### Phase 4 — Knockout-specific
26. **To Qualify** (advance to next round, includes ET + pens)
27. **Method of Qualification** — 90min / ET / Pens
28. **To Win the Match in Regular Time** — distinct from "To Qualify"
29. **Penalty Shootout — Yes/No**
30. **Lift the Trophy** (already have via outrights endpoint)

### Phase 5 — In-play (uses our own live state, not paid live-odds endpoint)
31. **Next Goal — Home/Away/None** — recomputed every 60s from live state we already poll
32. **Race to 2 / 3 Goals**
33. **Total Goals after current minute** — dynamic line

## Real-time match state upgrade
- Replace football-data.org polling with `/fixtures?live=all` (every 60s during live windows only).
- Push goal/card events via Supabase realtime → bet UI auto-updates without refresh.
- Settlement uses `/fixtures/statistics` + `/fixtures/events` as source of truth (audit-grade, prevents the Egypt-Iran style mis-settle).

## House profitability levers this unlocks
- **More lines = more slips.** Each market carries its own 5–8% overround. 30 markets vs today's 5 ≈ 6× the theoretical hold per fixture.
- **Player props have 12–18% margins** — far higher than 1X2 (~5%). Recreational users love them, sharps usually skip them (small markets, hard to model).
- **Card/corner markets have 10–15% margins** and zero correlation with goal markets — diversifies house risk.
- **Lineup-gated markets** are released late and close fast — minimal sharp action window.

## Required correlation groups (must extend BEFORE shipping new markets)
The current `correlation_groups` JSON only covers `goals_up` / `goals_down`. Add:
- `home_dominance`: home_win + home_clean_sheet + away_no_score + first_goal_home + home_-1_handicap
- `away_dominance`: mirror
- `low_event`: under_2.5 + under_corners + under_cards + 0-0
- `high_event`: over_3.5 + BTTS + over_cards + over_corners
- `player_team_link`: anytime_scorer_X correlates with team_X_win, team_X_-1_handicap
- `card_redcard`: over_cards + red_card_yes
Each new market gets tagged into ≥1 group in `markets_catalog.ts`.

## Risk caps to revisit
Current cap `max_user_match_correlated_payout = 1000 pts` was raised after the 2-2 incident. With cards/scorers added (anytime scorer odds 4.0–12.0), recommend per-group caps in `platform_settings`:
- `player_props_group_cap`: 400 pts potential per group
- `cards_corners_group_cap`: 600 pts potential per group
- Generic correlated cap stays at 1000

## Technical sketch

**New files**
- `src/lib/apifootball.server.ts` — single client, league/season pinned to WC 2026 (`league=1, season=2026`), quota tracker writing to `platform_settings.api_football_quota_used_today`
- `src/lib/apifootball-markets.server.ts` — maps API-Football `bet.id` → our `MarketKey`; one function per phase
- `src/lib/lineups.server.ts` — fetches + caches starting XI; emits realtime event when lineups land
- `src/lib/live-state.server.ts` — replaces football-data poller, drives realtime fixture updates
- `src/lib/settlement-apifootball.server.ts` — grades player/card/corner markets from final statistics

**New tables (one migration)**
- `match_lineups` (match_id, side, formation, starters jsonb, substitutes jsonb, fetched_at)
- `match_events` (match_id, minute, type, team, player_id, player_name, detail) — live event stream
- `match_player_stats` (match_id, player_id, goals, assists, shots, cards) — for settlement
- `player_props_catalog` (match_id, market_key, player_id, player_name, selection, odds, created_at) — late-published props
- Extend `match_market_odds`: add ~25 new `market_key` enum values

**New scheduled hooks** (`src/routes/api/public/hooks/`)
- `apifootball-fixtures.ts` — twice daily
- `apifootball-prematch-odds.ts` — runs every 30min, picks fixtures in T-24h to T-3h window
- `apifootball-lineups.ts` — runs every 5min during T-90 to T-30 windows
- `apifootball-live-poll.ts` — runs every 60s, only when at least one fixture is live
- `apifootball-settle.ts` — runs at T+15min per finished fixture

**Quota safety**
- Hard daily counter in DB. If `quota_used >= 95`, all jobs except settlement skip with a logged warning.
- Admin dashboard tile: "API-Football quota — 67/100 today, resets in 4h 12m".

**Admin UI additions**
- `admin.api-football.tsx` — toggle each market on/off, view quota burn chart, manual fixture refresh button
- Risk dashboard: per-market exposure column

**Settings secret**
- Reuse `add_secret` tool to store `API_FOOTBALL_KEY` (you'll paste it after I switch to build mode).

## Phased rollout (so quota stays safe and bugs stay small)
1. **Week 1** — Phase 1 markets + replace today's fabricated CS/HTFT/Exact with real prices. Test on 2 fixtures.
2. **Week 2** — Phase 2 (cards/corners) + correlation groups + risk caps.
3. **Week 3** — Phase 3 (lineups + player props) + realtime push.
4. **Week 4** — Phase 4 (knockout markets: To Qualify, Method of Qualification, Penalty Shootout). Critical for current World Cup stage.
5. **Week 5** — Phase 5 (in-play next-goal markets) using our own live state.

## Out of scope (call out)
- **Live in-play odds from API-Football.** Burns 10× the quota. Use our derived model for in-play; upgrade to OpticOdds/OddsJam ($750+/mo) only when turnover justifies it.
- **Multi-fixture parlays.** Platform is single-bet today; adding accumulators is a separate project.
- **Upgrading API-Football plan.** Pro = $25/mo gets 7.5k req/day and removes the season restriction — recommend this the moment Phase 3 ships. Free tier is enough to get Phase 1 + 2 live.

## Decisions needed before I switch to build mode
1. Approve the **5-phase rollout** above, or do you want all markets shipped in one wave (higher risk)?
2. Approve **deferring in-play odds** (use our derived model, not API-Football live endpoint)?
3. Approve the **correlation-group + risk-cap additions** as prerequisites to Phase 2?
4. OK to **replace football-data.org live polling** with API-Football `/fixtures?live=all`?

Reply with picks and I'll start with Phase 1.
