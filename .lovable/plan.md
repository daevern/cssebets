## Problem

F1 markets stay open after lights-out. Belgian GP has started but bets are still placeable. Football closes markets at kickoff and shows live stats — F1 has neither.

## Plan

### 1. Close F1 markets at race start (server-enforced)

- In `place_f1_race_bet_atomic` (and `place_f1_championship_bet_atomic` where relevant), add a guard: reject with `race_started` when `now() >= f1_races.starts_at` OR `status IN ('live','finished')`.
- In `src/features/f1/f1.functions.ts` `listF1RaceMarkets` (and race detail loader), return a `bettingClosed: true` flag when `starts_at <= now()` or status is live/finished, and mark all race markets as `status='suspended'` in the response payload so the UI can't submit.
- In `src/features/f1/services/f1Sync.server.ts`, when syncing races, if a race's `starts_at <= now()` and status is still `scheduled`, flip status to `live`; keep existing finished handling.
- Add a lightweight cron tick in `src/routes/api/public/hooks/f1-sync.ts` (or reuse f1-odds hook) that suspends all open race markets where the parent race has started.

### 2. UI — disable bet placement + show "Race in progress"

- `F1RaceDetailsPage.tsx` / `F1BetSlip`: when `bettingClosed`, disable Yes/No/driver buttons, hide stake slider, show a banner "Markets closed — race in progress" (mirrors football's post-kickoff behaviour).
- `RaceChip` / upcoming cards: hide race from "Upcoming" once started; it moves to a Live/Results section.

### 3. Live race stats (football-parity panel)

Add a `LiveRaceStats` panel on the race detail page, shown while race status is `live`. Data comes from API-F1 (paid plan supports live race feed).

Panels to show (matching football's live analytics density):
- Current lap / total laps, race status flag (green/yellow/SC/red).
- Live leaderboard: position, driver, team, gap to leader, last lap time, tyre compound, pit stops.
- Fastest lap holder + time.
- Recent events feed (overtakes, pit stops, incidents) — last 10.

Implementation:
- New adapter method in `src/features/f1/adapters/apiF1Adapter.server.ts`: `fetchLiveRaceState(raceId)` calling API-F1 `/races?id=…` + `/rankings/races` endpoints.
- New table `f1_live_race_state` (jsonb payload + updated_at) OR reuse an existing snapshot table; cache TTL 20s to protect quota.
- Server fn `getF1LiveRaceState({ raceId })` in `f1.functions.ts`.
- Component `src/features/f1/components/LiveRaceStats.tsx` polling every 20s via `useQuery`.
- Wire cron `f1-live` hook (new file `src/routes/api/public/hooks/f1-live.ts`) that refreshes live state for any race with status=`live`.

### 4. Backfill fix for current Belgian GP

- One-off migration/action: mark Belgian GP status=`live`, suspend all its open markets so users can't place further bets until settlement.

### Technical notes

- Suspension source of truth is the RPC guard — UI flags are UX only.
- Reuse `sports_markets` suspension pattern from `oddsFreshness.server.ts` for consistency (`suspension_reason='race_started'`).
- Live stats panel only mounts when `status='live'`; scheduled races keep current UI.
- API-F1 live endpoints are called only from the cron, never from the client, to preserve quota.

## Open question

Should I also close **championship** markets (drivers/constructors title) once the season's first race starts, or keep those open all season and only close race-specific markets? Football-analog would be "keep season markets open, close per-race at lights-out" — I'll go with that unless you say otherwise.
