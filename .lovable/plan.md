# Blackjack-only transfer plan (v2.3 → Match Predictor Pro)

## Critical conflict found (must be resolved during transfer)

The v2.3 Blackjack build **stakes real wallet points**: `startBlackjackHand` takes a `stake`, the RPC debits `wallets`, and hands carry `total_stake` / `total_payout` / `user_net`, with error codes `INSUFFICIENT_BALANCE`, `BELOW_MIN_STAKE`, `EXPOSURE_LIMIT`. That contradicts requirement 7 (non-monetary, score-only).

Resolution used throughout this plan: transfer the game engine, state machine, provable-fairness and UI, but **strip every wallet path**. Blackjack in MPP will run on a **free daily attempt allowance** (configurable, e.g. 25 hands/day) tracked in its own ledger, and award only non-redeemable Blackjack score. `wallets` and `wallet_transactions` are never touched. Stake/payout columns are dropped in favour of `attempts_used` + `score_awarded`.

## 1. Blackjack files to add (copied, then monetised)

- `src/lib/arcade/blackjack-math.ts` — hand value engine, card labels (pure, no deps)
- `src/lib/arcade/blackjack.functions.ts` — player server fns
- `src/lib/arcade/blackjack-phase2.functions.ts` — verify / history / stats
- `src/lib/arcade/blackjack-admin.functions.ts` — admin overview, hand list, risk flags, resolve, publish configs
- `src/lib/arcade/__tests__/blackjack-math.test.ts` — engine tests
- `src/components/arcade/PlayingCard.tsx`
- `src/components/arcade/BlackjackTable.tsx`
- `src/components/arcade/BlackjackVerifyDialog.tsx`
- `src/components/arcade/CasinoChip.tsx` — only if kept; with no stakes the chip rail becomes a "free hand" indicator, so this may be dropped
- `src/routes/_authenticated/arcade.blackjack.tsx` — the table (`/arcade/blackjack`)
- `src/routes/_authenticated/arcade.blackjack-stats.tsx` — stats + history (`/arcade/blackjack-stats`)
- `src/routes/management/admin.blackjack.tsx` — admin console (MPP has no `admin.arcade.*` shell, so this is a standalone admin page rather than v2.3's `admin.arcade.blackjack.tsx`)

## 2. Existing MPP files needing small, additive edits

- `src/routes/_authenticated/arcade.tsx` — add a "Blackjack" tab to the existing tab array (Lobby / Plinko / Roulette / Treasure)
- `src/routes/_authenticated/arcade.index.tsx` — add a fourth lobby card with Play + How to play
- `src/components/arcade/HowToPlayDialog.tsx` — add the `blackjack` instruction block
- `src/components/arcade/GameArt.tsx` — add a `BlackjackArt` SVG scene for the lobby tile
- `src/lib/rate-limit.functions.ts` — add `blackjack_action: { max: 60, windowSeconds: 60 }`
- `src/components/nav/TopBar.tsx` — desktop nav: Blackjack entry (Arcade stays)
- `src/components/nav/HamburgerMenu.tsx` — Blackjack entry
- `src/routes/management/admin.tsx` — admin nav link to Blackjack
- `src/integrations/supabase/types.ts` — regenerated automatically after migration (not hand-edited)

`src/components/nav/BottomNav.tsx` is **not** touched.

## 3. Shared arcade modules — copy only what Blackjack needs

Blackjack reuses only already-present MPP infrastructure: `requireSupabaseAuth`, `enforceRateLimit`, `has_role` / `user_roles`, `audit_log` / `create_audit_log`, `CsseMark`, sonner, shadcn dialog. No Plinko/Roulette/Treasure module is imported. `arcade_randomness_seeds`, `arcade_score_*`, `arcade_achievements`, `arcade_challenges` already exist in MPP; Blackjack achievements/challenges are added as **rows/handlers keyed to blackjack**, not new frameworks. `src/components/arcade/types.ts` gets Blackjack types appended only if needed.

## 4. Explicitly excluded

Plinko, Roulette, Treasure files and admin pages; `arcade.achievements/challenges/cosmetics/history/leaderboards/stats/roulette-*/treasure-*` routes; `admin.arcade.*` shell, cosmetics, events, grants, profiles pages; `README.md`; `.lovable/plan.md`; all DEV env vars, Supabase project ids, secrets; DEV users, gameplay rows, hard-coded ids, test balances; the DEV 1,000-point top-up migration; the full v2.3 migration sequence.

## 5. Routes

- `/arcade/blackjack` (authenticated)
- `/arcade/blackjack-stats` (authenticated — history + stats)
- `/management/admin/blackjack` (admin + super_admin)

## 6. Database (single fresh consolidated migration, additive only)

Enums: `bj_hand_status`, `bj_ph_status`, `bj_result`, `bj_action`, `bj_config_status`.

Tables (all `public`, each with GRANTs → RLS → policies):

- `arcade_bj_rule_configs` — versioned rules (deck_count, penetration, dealer_hits_soft_17, peek, double/split rules, action_timeout, **daily_hand_limit / free attempt allowance**, maintenance_mode, announcement). Stake/payout/exposure columns removed. `SELECT` to authenticated where `status='active'` or admin.
- `arcade_bj_score_configs` — natural blackjack / win / five-card / double / split / push / loss scores, `max_score_per_round`. Same policy.
- `arcade_bj_shoes` — server seed, seed hash, client seed, nonce, `card_order`, current_index, status. **service_role only**, no authenticated grant.
- `arcade_bj_hands` — user, shoe, status, result, dealer totals/flags, `total_score_awarded`, config ids/versions, `state_version`, `action_sequence`, `idempotency_key`, `expires_at`. `UNIQUE (user_id, idempotency_key)`; partial unique index enforcing one active hand per user. Own-row SELECT + admin.
- `arcade_bj_player_hands` — hand_index, parent split id, status/result, totals, soft/bust/blackjack/doubled/split-ace flags, score.
- `arcade_bj_cards` — shoe position, deal_sequence, owner_type, rank/suit/value, `face_up`. RLS exposes only own `face_up = true` rows; hole card flips at settlement (server fns also mask via `supabaseAdmin` reads).
- `arcade_bj_actions` — action, sequence, state_version before/after, card drawn, totals, idempotency key. Own-row read.
- `arcade_bj_attempts` — free-attempt ledger (daily grant, consume, admin grant/revoke) replacing v2.3's wallet debit.
- `arcade_bj_score_balances` — non-redeemable per-user total score.
- `arcade_bj_errors` — server error log, admin/service only.

No existing table is altered, dropped, truncated or reseeded. Two config seed rows (`standard` v1 rules + scoring) are the only inserts.

## 7. RPCs (SECURITY DEFINER, `SET search_path = public`) and server functions

RPCs: `arcade_bj_touch_updated_at`, `arcade_bj_build_shoe` (HMAC-SHA256 + Fisher–Yates in Postgres — no `Math.random()` anywhere authoritative), `arcade_bj_start_hand`, `arcade_bj_hit`, `arcade_bj_stand`, `arcade_bj_double`, `arcade_bj_split`, `arcade_bj_settle`, `arcade_bj_expire_hands`, `arcade_bj_reveal_shoe`, `arcade_bj_admin_resolve_hand`, `arcade_bj_publish_rule_config`, `arcade_bj_publish_score_config`, `arcade_bj_ensure_daily_attempts`.

Every action RPC takes `(p_user, p_hand, p_player_hand, p_state_version, p_idempotency_key)` and is idempotent: replaying an idempotency key returns the existing state, and a stale `state_version` raises `STALE_STATE`. Illegal transitions raise `ACTION_NOT_ALLOWED`.

Server functions (all `.middleware([requireSupabaseAuth])`, Zod-validated, rate-limited): `getBlackjackConfig`, `getBlackjackProfile`, `getActiveBlackjackHand`, `getBlackjackHand`, `startBlackjackHand` (no stake argument), `hitBlackjack`, `standBlackjack`, `doubleBlackjack`, `splitBlackjack`, `revealBlackjackShoe`, `getBlackjackHistory`, `getBlackjackStats`; admin: `getBlackjackAdminOverview`, `listBlackjackHands`, `getBlackjackRiskFlags`, `resolveBlackjackHand`, `publishBlackjackRules`, `publishBlackjackScoring`.

The client may submit only: hand id, player-hand id, action, state version, client seed, idempotency key. Never cards, totals or results.

## 8. Admin functionality

Overview (hands today, active hands, result mix, score awarded, live rule/score version, maintenance toggle); hand explorer with filters and full action trail; risk flags (abnormal win rate, stale-state spam, rapid actions); void/reverse a hand (claws back score, never money); publish new rule and score config versions with `change_reason`, written to `audit_log`.

## 9. Dependencies

None new — `zod`, `@tanstack/react-query`, `@tanstack/react-start`, `sonner`, `lucide-react`, `recharts` (stats chart) and shadcn dialog are already installed.

## 10. Conflicts between v2.3 and MPP

1. **Wallet staking** (above) — de-monetised.
2. MPP has no `admin.arcade.*` shell → standalone `admin.blackjack.tsx`.
3. `RATE_LIMITS` in MPP lacks `blackjack_action` → additive key.
4. v2.3 `arcade.tsx` tab list and lobby differ from MPP's → merge tabs, do not overwrite files.
5. v2.3 `CsseMark` / `HowToPlayDialog` / `GameArt` differ → MPP versions win, Blackjack additions merged in.
6. `types.ts` is generated per project → never copied.

## 11. Testing checklist

- Unit: `blackjack-math` totals, soft/hard aces, blackjack detection, split/double eligibility, dealer soft-17.
- Deal → hit → bust; deal → stand → dealer play → settle; double; split incl. split aces; natural blackjack; push.
- Idempotency: replay the same key on deal/hit/stand/double/split → no duplicate card, no duplicate score.
- Stale `state_version` → rejected with a clean toast, UI refreshes.
- Hole card: confirm the network payload contains `rank: null` until settlement; direct PostgREST read of `arcade_bj_cards` / `arcade_bj_shoes` as another user returns nothing.
- Free attempts: allowance decrements, exhaustion blocks a new deal, daily reset works; `wallets` and `wallet_transactions` show **zero** rows created by Blackjack.
- Rate limit trips at the configured threshold.
- Admin: void a hand → score clawed back, audit row written; publish rule/score version → new active version, old archived.
- Regression: dashboard, /matches, /f1, /ufc, picks, wallet, payouts, existing arcade games, management console all unchanged; mobile bottom nav unchanged; SEO heads intact.
- Mobile-first check of the table at ~390px width.

## 12. Rollback procedure

- Code: revert the Blackjack files and the small additive edits (nav entries, tab, rate-limit key) — no existing file is replaced, so reverting restores prior behaviour exactly.
- Feature kill switch without a deploy: set `maintenance_mode = true` on the active rule config; the route shows a maintenance state and all RPCs refuse new hands.
- Database: a companion down-migration drops only `arcade_bj_*` tables, enums and `arcade_bj_*` functions. Nothing else is dropped and no existing production data is touched, so rollback cannot affect wallets, predictions or accounts.