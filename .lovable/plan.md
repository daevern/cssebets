# Rock–Paper–Scissors — Arcade Game

Decisions locked in: real wallet points (same as every other arcade game), casino-chip stake selector, **win 1.90x / draw 1.00x / loss 0**.

## What already exists that we reuse

The four live arcade games (Plinko, Roulette, Treasure Grid, Blackjack) already give us almost every building block. RPS reuses, not rebuilds:

- **Randomness**: `arcade_randomness_seeds` (server seed + SHA256 hash + nonce, per user) — already the commit-reveal store used by Roulette/Treasure. `extensions.gen_random_bytes` / `extensions.digest` = cryptographically secure, no `Math.random()` anywhere authoritative.
- **Money + audit**: `wallets` / `wallet_transactions` (category `arcade_rps`), plus the accounting layer already wired for arcade — `accounting_arcade_assert_capacity` (bankroll capacity check before accepting a stake), `accounting_reserve_liability` (reserve worst-case payout), `accounting_arcade_hook` (posts the double-entry journal on settlement), `accounting_reverse_*` for admin corrections. The `accounting_bridge_wallet_transaction` trigger already skips products that post their own journals, so no double-count.
- **UI**: `CasinoChip`, `ArcadeResultDialog`, `HowToPlayDialog`, `ArcadeLayout`/`PageFooter` spacing, the flat-2D stat header cards, and the verification-dialog pattern from `TreasureVerifyDialog` / `RouletteVerifyDialog`.
- **Server plumbing**: `*.functions.ts` + `requireSupabaseAuth` + `enforceRateLimit` + the `mapError` code→message pattern.
- **Config/admin**: the `arcade_*_configurations` table shape (status/version/min-max stake/chip values/daily limit/maintenance_mode/announcement) and the phase2 admin function pattern.

Net effect: this is mostly new tables + two RPCs + one page, not a new subsystem.

## The one thing that is genuinely new

Existing games settle in a **single** call (bet → outcome → payout). RPS needs a **two-phase** flow so the server's commitment provably predates the player's choice. That's the only new architectural piece.

```text
prepare  →  hash committed, seed hidden, buttons enable
click    →  buttons lock instantly, choice sent
settle   →  atomic: consume round, charge, derive move, pay, journal
reveal   →  both moves land in ONE state update, one animation frame
```

## Database

**`arcade_rps_configurations`** — mirrors the roulette config: status, version, min/max stake, chip_values, win_multiplier (1.90), draw_multiplier (1.00), round_ttl_seconds (default 120), daily_round_limit, cooldown_seconds, maintenance_mode, announcement. Seeded active row in the migration.

**`arcade_rps_rounds`** — the commitment + result record, one row per prepared round:
- commitment: `server_seed` (never selected by client-facing queries), `server_seed_hash`, `nonce`, `seed_id`, `prepared_at`, `expires_at`, `status` (PREPARED / SETTLED / EXPIRED / VOID / REVERSED)
- settlement: `player_choice`, `server_choice`, `client_seed`, `random_hex`, `outcome` (WIN/LOSS/DRAW), `stake`, `multiplier`, `gross_return`, `user_net`, `house_net`, `settled_at`, `processing_ms`, `verification_id`, `idempotency_key`, `client_reveal_ms` (diagnostic only)
- constraints: unique `(user_id, idempotency_key)`; unique `(seed_id, nonce)` so a nonce can never be reused; `server_seed_revealed_at`.

GRANTs to `authenticated` + `service_role`, RLS on, policy `user_id = auth.uid()` for SELECT only. All writes go through SECURITY DEFINER RPCs. **The seed column is never exposed to the client while `status = 'PREPARED'`** — enforced by having server functions project explicit column lists and only include `server_seed` once settled.

**`arcade_rps_prepare_round()`** (SECURITY DEFINER):
- resolves the caller, checks config/maintenance/daily limit/cooldown
- expires any stale PREPARED rounds for that user; one live prepared round at a time
- takes/creates the user's `arcade_randomness_seeds` row, increments nonce, generates a fresh 32-byte server seed for this round, stores it plus `sha256(seed)`
- returns **only** `round_id`, `server_seed_hash`, `nonce`, `expires_at`, plus config echo (stake bounds, chips, multipliers)

**`arcade_rps_settle(p_round_id, p_player_choice, p_client_seed, p_stake, p_idempotency_key)`** — one transaction:
1. idempotency short-circuit: existing row with same key → return it unchanged (same move, same outcome, no second charge)
2. `SELECT ... FOR UPDATE` the round; reject if not owned by caller, not `PREPARED`, or past `expires_at`
3. validate choice ∈ {ROCK,PAPER,SCISSORS}, stake within config bounds
4. `accounting_arcade_assert_capacity('rps', user, stake*1.90, stake)`
5. lock wallet row `FOR UPDATE`, balance check, debit stake, write `wallet_transactions` (`bet_placement`, category `arcade_rps`)
6. `accounting_reserve_liability(...)` for the worst-case 1.90x
7. read the **already-stored** server seed; derive
   `digest = hmac(client_seed || ':' || nonce || ':' || round_id, server_seed, 'sha256')`
   and map the leading bytes to a move with rejection sampling (unbiased — discard values ≥ 255 − (255 mod 3), then mod 3)
8. compute outcome + gross return server-side; credit wallet if > 0 with a `bet_settlement` transaction
9. `accounting_arcade_hook('rps', ...)` posts the journal
10. mark round SETTLED, persist both choices, digest, revealed seed, timings; return the row

**`arcade_rps_get_round(p_round_id)`** — recovery/verification read for a settled round (used after refresh or a dropped connection).

Note on the brief: it asks the settle function to derive the user from `auth.uid()`. Our arcade RPCs are SECURITY DEFINER and take the user id from the authenticated server-function context (`requireSupabaseAuth` validates the bearer token before the RPC is reachable) — same trust model, consistent with the other four games. Ownership is still hard-checked inside the transaction.

## Server functions — `src/lib/arcade/rps.functions.ts`

`getRpsConfig`, `getRpsProfile` (balance + today/lifetime stats + recent rounds, same shape as treasure/roulette so the header cards drop in), `prepareRpsRound`, `settleRpsRound`, `getRpsRound`. All `requireSupabaseAuth` + `enforceRateLimit`. Zod validates only: `roundId`, `playerChoice` enum, `clientSeed`, `stake`, `idempotencyKey`, optional `clientRevealMs`. **Anything else the client sends is ignored** — there is no code path that reads a client-supplied server move, outcome, multiplier, return or balance.

Admin: `src/lib/arcade/rps-admin.functions.ts` following `blackjack-admin.functions.ts` — round ledger with every field in your admin list (timestamps, both choices, hash, revealed seed, nonce, idempotency key, linked wallet-transaction and journal ids, latency, client-reported reveal ms, verification status), plus publish-config and a reverse-settlement action.

## UI — `src/routes/_authenticated/arcade.rps.tsx`

State machine `IDLE → LOCKED → REVEALING → SETTLED`, held in **one** `reveal` state object containing both choices, outcome, multiplier, gross return and round id — set in a single `setState`, so both hands necessarily render in the same frame.

- On mount / after each round: silently `prepareRpsRound()` in the background so the hash is committed before the buttons light up. Buttons stay disabled until a round is prepared.
- Tap → buttons disable synchronously, chosen hand shows a neutral "locked" style (no win/loss colour), both sides show face-down, "Verifying round…" indicator. No client-side timers race the response, no fake result, no fallback outcome in the browser.
- Response → single state update → one short reveal animation → `ArcadeResultDialog` with the amount won/lost, exactly like Treasure/Blackjack.
- Chip row + 1/2 / 2x / Max controls, stat header (Balance, P/L today, W/D/L), flat-2D pinned control panel — all copied from the treasure/blackjack layout so it looks native.
- `RpsVerifyDialog` (built from `TreasureVerifyDialog`): shows round id, both choices, published hash, revealed seed, client seed, nonce, exact HMAC input string, digest, mapping step, outcome, multiplier, gross return — and recomputes SHA256(seed) and the move **in the browser** to independently confirm the hash and the result.
- Retry/recovery: the idempotency key is generated once per attempt and reused on retry; on mount, any settled-but-unshown round is fetched via `getRpsRound` and displayed.
- Route registered in the arcade index tile grid + `HowToPlayDialog` copy. Own `head()` metadata.

## Tests — `src/lib/arcade/__tests__/rps.test.ts` plus SQL checks

Unit (vitest, pure functions extracted to `rps-math.ts`):
- HMAC→move mapping is deterministic and reproduces known vectors
- rejection sampling produces a uniform 1/3 distribution over a large sample
- outcome + payout table (win 1.90, draw 1.00 refund, loss 0) is exhaustively correct over all 9 combinations

Integration (SQL, run against the DB in the same style as `supabase/tests/settlement_idempotency.sql`):
1. `prepare` writes `server_seed_hash` with `prepared_at` strictly before any accepted choice — settle is rejected for a round id that does not already exist
2. changing the player choice on the same round cannot change the seed or the derived server move
3. the same prepared round cannot be settled twice — second call with a **different** choice is rejected, not re-run
4. retry with the same idempotency key returns the identical move, outcome and balance; wallet is debited exactly once
5. another user's round id is rejected
6. an expired round is rejected
7. nonce reuse is impossible (unique constraint)
8. verification: `sha256(revealed_seed) = published hash` and re-deriving the HMAC reproduces `server_choice` for a batch of settled rounds

Accounting/settlement regression (this is the part that protects the live platform):
- wallet delta for a round equals `gross_return − stake`, and `wallet_transactions` rows sum to the same
- every settled round has a balanced journal via `accounting_arcade_hook`; run `accounting_integrity_scan` and `accounting_balance_guard` before/after a batch of RPS rounds and assert no new drift
- `accounting_bankroll_reconciliation` and `accounting_pl_report` unchanged in structure and reconciling after RPS activity — RPS shows as its own product line
- liability reservation is released on settle: `accounting_terminal_reservation_violations` returns zero rows
- capacity guard rejects a stake whose worst-case payout exceeds available bankroll reserve
- existing `accounting_phase10_selftest` / `accounting_phase5_final_selftest` still pass after the migration

Client-side (vitest + RTL): the reveal reducer proves player and server choices always originate from one state object, and no render path can display `serverChoice` while status is `LOCKED`.

## Rollout

Ship behind the config row's `maintenance_mode` flag so the tile can be hidden until the tests above pass in production, then flip it on. No changes to any existing game, wallet, payout or settlement path — RPS only adds new tables and calls the existing accounting entry points the same way Roulette does.
