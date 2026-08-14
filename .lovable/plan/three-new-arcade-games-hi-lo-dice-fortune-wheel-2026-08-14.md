# Three new arcade games — Hi-Lo, Dice, Fortune Wheel

Add three new CSSEBets arcade games that reuse the existing arcade engine (server-authoritative
rounds, provably-fair seeds, double-entry accounting, liability reservation, config versioning)
so the build stays cheap while the result is fully finished, not a demo.

## The games

**1. Hi-Lo (card ladder)** — reuses Blackjack's deck, card faces and deal/flip motion, plus the
RPS "keep climbing or bank" ladder. Guess whether the next card is higher or lower; each correct
guess multiplies by the RTP-adjusted fair odds of that guess. Bank any time.

**2. Dice (roll under / over)** — a slider picks a target between 2 and 98. Multiplier =
99 / win-chance x RTP, so the player sets their own risk. Reuses Plinko's provably-fair seed
chain and the shared stake dock.

**3. Fortune Wheel** — a segmented wheel, reusing the Roulette wheel renderer, spin motion and
procedural ball/tick audio. Low / medium / high risk multiplier bands, one stake per spin,
no betting board.

All three ship at a **4% house edge (96% RTP)**, matching the arcade v2 config target.

## Look and feel

Each game gets the same treatment as the existing five: its own theme entry (accent, stage,
felt, dock and plaque tokens), a Bauhaus-style title, entrance animation, ambient stage glow,
engraved HUD plaques, in-table settle plaque, themed result dialog with confetti tiers, sound
variants off the shared engine, a "How to play" dialog with the game's own SVG art, a provably-
fair verify dialog, and a poster tile on the `/arcade` lobby grid drawn in the same 3D-icon
style as the current five.

## Backend (one migration per game, same shape as Treasure Grid)

Per game: a `arcade_<game>_configurations` table (versioned, min/max stake, max return,
max multiplier, target RTP, cooldown, daily limit, maintenance flag), a rounds table pinned to
the config it was created with plus an immutability trigger, and SECURITY DEFINER RPCs for
start / act / settle that debit and credit through the existing accounting journal and reserve
liability before accepting a stake. GRANTs and RLS on every new table (own-rows only). Register
each product in `accounting_migration_flags` with `liability_enforced` and `capacity_enforced`
true, and in `arcade_config_versions` / `arcade_config_activation` for all three environments.

Client seed / server seed hash / nonce are issued and verified exactly like Plinko and Treasure.

## Proving the margin

- Pure math modules (`hilo-math.ts`, `dice-math.ts`, `wheel-math.ts`) mirroring the DB formulas.
- Vitest suites added under `src/lib/arcade/__tests__` asserting, per game and per risk band /
  target, that the exact expected value equals 0.96 within tolerance, that no multiplier exceeds
  the configured cap, and that Monte Carlo runs (1e6 rounds) converge on the target edge.
- Extend `arcade_config_selftest()` so the DB self-check covers the three new products.
- Extend the config-versions test so v1 and v2 are asserted independently.

## Admin / risk controls

Extend the existing Arcade Control Centre (`/management/admin/arcade`) rather than build new
screens: the three games appear in the live activity panel (active rounds, players, staked now,
exposure), in the config-version publish / rollback flow, and in the P/L and house-edge
reporting. Per-game maintenance toggle, stake limits and max-return caps are editable there,
and every change writes to the existing config activation log.

## Technical notes

- Routes: `src/routes/_authenticated/arcade.hilo.tsx`, `.dice.tsx`, `.wheel.tsx`, each wrapped in
  `ArcadeStage` / `ArcadeEntrance` / `ControlDock` like the current games.
- Server functions: `src/lib/arcade/{hilo,dice,wheel}.functions.ts` following the Treasure Grid
  pattern (auth middleware, rate limit, approved-member gate, error mapping, public field
  projection). No payout math on the client.
- `theme.ts`, `published-rtp.ts`, `config-registry.ts`, `sound.ts` and the lobby grid each gain
  three new entries.

## Order of work

1. Migration + math modules + tests for all three (margin proven before any UI).
2. Server functions and routes, game by game.
3. Lobby posters, themes, dialogs, audio, polish.
4. Admin panel wiring and a final end-to-end play test of each game.
