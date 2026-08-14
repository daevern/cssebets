# Keno + Crash — CSSE Arcade games 9 and 10

Two new house originals that reuse the existing "mini games" engine (the same one behind Dice, Hi-Lo and Fortune Wheel), so the money path, provable fairness, accounting journal and liability reservations all stay identical to what is already audited.

## The games

### Keno
- Board of 40 numbers. Player picks 1–10, the house draws 10.
- Payout depends on how many picks were hit, using published paytables.
- Three risk profiles (Classic, Medium, High) — same numbers, different payout shapes, every one of them tuned to the same 96% return.
- Instant single-shot round: pick, play, settle — no in-flight state to recover.

### Crash
- A multiplier curve climbs from 1.00x and dies at a hidden crash point.
- Player presses Cash Out before it dies to bank stake x current multiplier.
- Optional Auto Cash Out target set before the round starts (server honours it even if the player's connection drops).
- Crash point is committed by the server before the round starts and revealed after settlement.

## Business logic (money correctness)

- Both games settle through the same database transaction pattern as Dice/Wheel: stake debited on open, payout credited on close, one wallet transaction per movement, idempotency key on every open.
- Liability reservation + payout-capacity check on the max possible payout before the stake is accepted, so the house can never be exposed beyond bankroll.
- Double-entry accounting journal entries written for stake and settlement, exactly like the other arcade products.
- 96% target RTP for both, enforced by generated paytables rather than hand-typed numbers, and verified by a Monte Carlo run before shipping.

### Provable fairness
- Same committed server seed + client seed + nonce chain already used by Dice/Wheel/Hi-Lo.
- Keno: draw derived by seeded Fisher-Yates over 40 numbers.
- Crash: crash point derived from the seed hash with the standard 1/(1-x) transform, house-edge adjusted, with an instant-bust band so the edge is honest.
- Both get a Verify dialog in the browser that reproduces the result from the revealed seed.

### Anti-abuse (Crash specifically)
- The multiplier the player receives is computed **server-side** from the elapsed time between the server's round start and the server's receipt of the cash-out, never from a client-sent number.
- If elapsed time already exceeds the crash point, the round is a loss regardless of what the client claims.
- Auto cash-out is resolved server-side at open, so a dropped connection still pays.
- Abandoned rounds are reconciled by a sweeper so no round can sit ACTIVE forever.
- Existing arcade rate limiter and daily round limit apply to both.

## Admin side

- Both games added to the Arcade Control Centre (`/management/admin/arcade`) as first-class tabs, alongside the existing games — this also fills the current gap where Dice, Hi-Lo and Wheel have no admin tab.
- Per-game live panel: players currently in a round, total stake in flight, rounds/hour, stake, payout, gross margin and realised RTP vs published RTP.
- Per-game config editing with the existing draft → publish version flow: min/max stake, chip denominations, daily round limit, maintenance mode, announcement banner, target RTP, max multiplier, max payout cap, and (Keno) the risk profiles, (Crash) instant-bust rate and curve speed.
- Config changes are versioned; live rounds keep the version they opened on.
- Recent-rounds table per game with outcome, stake, multiplier, net and verification id.
- Maintenance toggle immediately blocks new rounds while letting in-flight rounds settle.

## Player-side UI

Both follow the Stake-style slate console identity used by Dice/Hi-Lo/Wheel — slate felt, neon-green accent, in-stage cabinet title, slim HUD (Balance / P&L today / RTP), the shared control dock, sound engine, result dialog and personal-best stat.

- **Keno board**: 8x5 grid of numbers with pick/clear/quick-pick, live hit-paytable rail that highlights the current pick count, drawn balls revealing in sequence, hit tiles popping in neon green.
- **Crash board**: animated curve with a large live multiplier, cash-out button that shows the live cash-out value, auto-cash-out input, a history strip of recent crash points colour-tiered by size, and a bust flash on death.

## Technical outline

1. **Migration** — extend the `arcade_mini_configs` / `arcade_mini_rounds` product enum with `keno` and `crash`; seed active configs with generated paytables; add the RPCs `arcade_keno_play`, `arcade_crash_start`, `arcade_crash_cashout`, `arcade_crash_expire`, reusing the shared open/close helpers so accounting, liability and idempotency come for free.
2. **Maths** — extend `src/lib/arcade/mini-math.ts` with Keno hypergeometric paytables and Crash curve/probability helpers; add regression tests proving 96% RTP for every Keno pick-count and risk profile and for the Crash distribution.
3. **Server functions** — add `playKeno`, `startCrash`, `cashoutCrash`, `getActiveCrash` to `src/lib/arcade/mini.functions.ts` with the existing auth, approved-member, rate-limit and error-mapping wrappers.
4. **Components** — `KenoBoard.tsx` and `CrashBoard.tsx` in `src/components/arcade/`, plus theme entries and cabinet art.
5. **Routes** — `arcade.keno.tsx` and `arcade.crash.tsx`, and lobby tiles in `arcade.index.tsx`.
6. **Admin** — extend the arcade admin server functions and `/management/admin/arcade` with tabs for keno, crash, dice, hilo and wheel.
7. **Verification** — SQL Monte Carlo for both games, plus an end-to-end browser pass playing each game to settlement.
