# Arcade control centre for /management/admin

## Current state (verified)

- The admin sidebar has exactly one arcade entry: **Blackjack**. There is no admin page for Plinko, Roulette, Treasure Grid or Rock-Paper-Scissors.
- The Blackjack page covers 7-day hands, win rate, open risk flags, top players, void/reverse, and publishing rule/score versions. It is the only game with margin controls in the UI.
- Config tables exist and are populated for every game (roulette 1, treasure 3, rps 2, plinko 30 score profiles), but only treasure and blackjack have safe publish functions in the database (`arcade_publish_treasure_config`, `arcade_bj_publish_rule_config`, `arcade_bj_publish_score_config`). Roulette, RPS and Plinko can currently only be changed by hand.
- Nothing anywhere shows who is playing right now, how many players are in each game, or how much stake is live.

So: the answer to "is the arcade admin UI complete" is no — roughly 20% of it exists.

## What to build

### 1. Arcade hub page (`/management/admin/arcade`)

New sidebar entry "Arcade" grouping all five games.

**Live now strip** (auto-refreshing every 5s, plus realtime where available):
- Per game: active players, open rounds, live stake at risk, reserved liability.
- Platform total across all arcade games plus the available house reserve, so an admin sees headroom at a glance.
- Live rounds mean: Treasure rounds in `ACTIVE`/`COLLECTING`, Blackjack hands in `PLAYER_TURN`/`DEALING`/`DEALER_*`, and for single-shot games (Plinko, Roulette, RPS) rounds settled in the last 60 seconds as "in play".

**Today / 7d performance table** per game: rounds, unique players, total staked, total paid, house margin (actual), theoretical margin from the active config, and the gap between them. The gap column is the abuse/misconfiguration signal.

**Recent activity feed**: last 50 rounds across all games — player, game, stake, payout, result, time — filterable by game and by player.

### 2. Per-game admin pages

`/management/admin/arcade/plinko`, `.../roulette`, `.../treasure`, `.../rps`, and the existing Blackjack page moved under the same group.

Each page gets:
- Active config summary with resolved version, theoretical RTP and house edge.
- Margin/limits editor: min and max stake, multipliers or payout table, RTP target where the game has one, plus RPS ladder multipliers and Treasure difficulty tables.
- Publish flow: publish a new version with a mandatory reason, retire the old one, never edit in place — the same pattern Blackjack already uses.
- Rounds list with filters and a void/reverse action, reusing the existing reversal RPCs.
- Player leaderboard for the window with a suspicious-win-rate flag.

### 3. Database work

- Add publish functions for roulette, RPS and Plinko mirroring `arcade_publish_treasure_config`: validate the patch, insert a new version row, retire the previous one, write an audit entry.
- Add a read-only aggregate function for the live strip so the dashboard makes one call per refresh instead of scanning five tables from the client.
- Enable realtime on the in-play tables only if the aggregate polling proves too slow; polling first, since these are small counts.

## Technical notes

- New server functions in `src/lib/arcade/arcade-admin.functions.ts`, following `blackjack-admin.functions.ts`: `requireSupabaseAuth`, role check through the user's own client, then service-role reads. No new client-side privileged access.
- All config edits go through database publish functions so the exposure guard and version immutability triggers keep applying; the UI never writes config rows directly.
- Margin changes affect PRODUCTION only after an explicit promote; the pages show which environment each version is active in and reuse `arcade_promote_config` / `arcade_rollback_config`.
- Money values render via the existing accounting money helpers; liability comes from `accounting_liability_reservations`, not recomputed in the UI.
- Mobile-first layout consistent with the existing admin pages.
