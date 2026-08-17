# Operations Runbook

## Daily tasks
1. Open `/management/admin/operations` — confirm all health rows are
   green. Any amber/red triggers the matching procedure below.
2. Open `/management/admin/reconciliation` and click **Refresh**.
   Confirm `overall_status = OK`. Investigate any drift before close
   of day.
3. Open `/management/admin/alerts` and click **Evaluate now**. Triage
   every alert: acknowledge if known, resolve once handled.
4. Open `/management/admin/settlements`. If "Failed" > 0, click
   **Retry** on each row and confirm settlement.
5. Open `/management/admin/bankroll` — verify exposure is below the
   configured cap.
6. Open `/management/admin/points` and `/management/admin/payouts` —
   process pending requests.

## Weekly tasks
1. Review `/management/admin/audit` and `/management/admin/review` for
   the last 7 days. Spot-check sensitive actions (wallet adjustments,
   user suspensions, manual settlements).
2. Review `/management/admin/analytics` (range = 7 days). Note any
   abnormal swing in bets, stake volume, payouts, or net P/L.
3. Review support workload via `/management/support`. Reassign open
   conversations if a staff member is overloaded.
4. Read all incidents closed in the past week in
   `/management/admin/incidents`. Confirm each has a
   `resolution_summary`.

## Emergency tasks

### Pause betting platform-wide
1. Open `/management/admin/risk-settings`.
2. Toggle **Bets paused** on.
3. Open an incident (`category=other`, `severity=critical`) recording
   the trigger and owner.

### Suspend a user
1. Open `/management/admin/users`, search the user, click suspend.
2. Provide a reason (3-500 chars). The action is audited and surfaced
   in `/management/admin/review`.

### Resolve a failed settlement
1. Open `/management/admin/settlements`.
2. For each failed row, confirm the match has scores recorded
   (`/management/admin/matches`).
3. Click **Retry**. If it still fails, open an incident
   (`category=settlement`, `severity=high`) and escalate.

### Recover a wallet discrepancy
1. Open `/management/admin/reconciliation`. Identify the affected
   user(s) in the wallet check sample.
2. Cross-check `/management/admin/wallet-ledger` for the user.
3. Apply correction with `adminAdjustWallet` and link the incident ID
   in the reason.

### Respond to a security incident
1. Pause betting if integrity may be compromised (see above).
2. Open an incident with `category=security`, `severity=critical`.
3. Rotate exposed secrets through Lovable Cloud settings.
4. Capture timeline in the incident notes; do not delete audit rows.

## Cron hook authentication (required)

All `/api/public/hooks/*` endpoints require a shared secret. Unauthenticated
POSTs return `401 { ok: false, error: "unauthorized" }` and perform no work.

1. Set Cloudflare / Lovable env var **`CRON_HOOK_SECRET`** to a long random
   value (do not reuse the anon/publishable key).
2. Update every `pg_cron` → `net.http_post` job so headers include the secret:

```sql
headers := jsonb_build_object(
  'Content-Type', 'application/json',
  'x-cron-secret', '<CRON_HOOK_SECRET value>'
)
-- equivalently: 'Authorization', 'Bearer <CRON_HOOK_SECRET value>'
```

3. Deploy the app **after** the secret is set and cron headers are updated.
   If `CRON_HOOK_SECRET` is missing in production, hooks fail closed (401).
4. Never log the secret. Rotate by setting a new env value, updating cron
   headers, then revoking the old value.

## Local dev environment (required for testing auth/wallet/arcade)

`.env` in the repo only carries the public `SUPABASE_URL` /
`SUPABASE_PUBLISHABLE_KEY` (anon key) — safe to commit. It does **not**
include `SUPABASE_SERVICE_ROLE_KEY`, which is a secret and must be added
locally (e.g. in a git-ignored `.env.local`) to run the dev server for
anything beyond static/public pages.

Every `createServerFn` handler that needs to bypass RLS (wallet, bets,
arcade, admin, and critically `enforceRateLimit` — which every auth
attempt, bet, and arcade action goes through) imports `supabaseAdmin` from
`src/integrations/supabase/client.server.ts`. That client is a lazy proxy
that throws on first property access if `SUPABASE_SERVICE_ROLE_KEY` is
missing. Because `auth_attempt` is a fail-closed rate-limit action (see
`FAIL_CLOSED_ACTIONS` in `src/lib/rate-limit.functions.ts`), **without this
key set, registration and login both fail** — the UI shows a generic error
toast instead of silently succeeding. This was found during a local
browser walkthrough and looked identical to a broken registration flow;
it was actually a missing local secret, not a code bug. Get the real value
from the Supabase project settings (Project Settings → API → service_role)
and set it before testing auth flows locally.

## End-to-end tests (Playwright)

`npm run test:e2e` runs the Playwright suite in `e2e/` against a local dev
server (auto-started on port 8080 if one isn't already running — set
`PLAYWRIGHT_BASE_URL` to point at a different one). `npm run test:e2e:ui`
opens the interactive UI runner. Covers:

- `e2e/registration.spec.ts` — the 4-step `/register` flow: per-step
  validation (empty name, invalid email, weak/mismatched password) and that
  final submission always produces visible feedback (toast or redirect),
  never a silent no-op.
- `e2e/public-pages.spec.ts` — landing page, `/auth`, and the pages that
  live behind the auto-anonymous guest session (`/support`,
  `/trust-center`, `/status`), including a regression test for the
  "no recent check" duplicate-text bug on `/status`.

Note: `@playwright/test` is pinned to `1.55.1` because 1.58+ dropped
support for macOS 13 (Ventura) entirely. Bump it once dev machines are on
macOS 14+.

### CI: ephemeral local Supabase, not the real project

`.github/workflows/e2e.yml` runs this suite on every PR (and on demand via
`workflow_dispatch`). It does **not** touch the real hosted Supabase
project. Instead it uses the Supabase CLI (`supabase/setup-cli` action) to
spin up a throwaway Postgres + Auth + Storage stack in Docker, seeded
entirely from `supabase/migrations/` and `supabase/config.toml`, runs the
app's dev server against that local stack, runs Playwright, then tears
the whole thing down. Every run starts from a clean database built from
whatever migrations are on that branch — no drift, no shared state, no
manual staging project to maintain, zero risk to production data.

Key config lives in `supabase/config.toml`:
`auth.enable_anonymous_sign_ins = true` (the landing page silently signs
guests in anonymously — without this every "guest" page 404s on auth
locally/in CI even though it works fine against the real project) and
`auth.email.enable_confirmations = false` (so `signUp()` returns a
session immediately in CI instead of needing a real inbox).

**Caveat:** this was authored and reasoned through carefully but could
not be dry-run end-to-end locally — Docker Desktop's daemon does not come
up in this environment. With 362 accumulated migrations (Lovable +
manual), there's a real chance the first CI run surfaces a migration that
doesn't replay cleanly against a fresh database (a missing extension, or
something Lovable's control plane set up outside of a tracked migration).
Treat the first run as the actual validation step, and expect to iterate
on `supabase/config.toml` or a specific migration if it fails.

## Go-live checklist (Phase A)

### Proven automatically by CI (`.github/workflows/e2e.yml`)

Ephemeral local Supabase + Playwright. The job sets a fixed
`CRON_HOOK_SECRET=e2e-cron-secret-for-ci` on the app process and the test
runner.

- [x] Cron secret required for hooks — unauthenticated
      `POST /api/public/hooks/health-check` → **401** (`e2e/ops-phase-a.spec.ts`)
- [x] Authenticated health-check → **200** and inserts `health_check_runs`
- [x] Settle hook smoke (football / F1 / UFC) returns **200** with secret
- [x] Football / F1 settle E2E grades seeded fixtures through the real hooks
      (`e2e/football-settle.spec.ts`, `e2e/f1-settle.spec.ts`)
- [x] UFC moneyline settle E2E (RPC grade + `ufc-settle` hook smoke)
- [x] Club football / F1 / UFC **place** calls `requireApprovedMember` +
      `bet_placement` rate limit (same pattern as WC `submitPrediction` /
      `placeMarketBet`)
- [x] Guest upgrade E2E: convert → pending wall → service-role approve
      (`e2e/guest-upgrade.spec.ts`)
- [x] Approved-member wallet + payout hold E2E
      (`e2e/wallet-payout.spec.ts` — create holds balance, admin reject releases)
- [x] Admin health UI includes cron freshness for `football_sync`,
      `football_settle`, `f1_sync`, `ufc_sync`, `health_cron_heartbeat`
- [x] Fresh DBs default `apply_margin_to_real = true` and arcade
      `capacity_enforced = true` via `20260817210000_phase_b_risk_hardening.sql`
- [x] Payout hold-on-create (`payout_create_atomic`) + admin reject refund
- [x] UFC method/round/total_rounds not public-bettable (moneyline only;
      admin settle retained)
- [x] F1 championship settle path + season place UI
- [x] Money mutators gated with `requireApprovedMember` (edit/cancel,
      free-bets, top-up, payout)
- [x] Ephemeral migration dry-run + `phase_b_ops_selftest()` in CI
      (`.github/workflows/e2e.yml` seeds vault `cron_hook_secret` and asserts
      margin / capacity / inactive UFC props)
- [x] Cron jobs rescheduled via `reschedule_cron_hooks_with_vault()`
      (`20260817220000_phase_b_cron_vault_and_ops_selftest.sql`) — includes
      football-settle, f1-settle, health-check
- [x] Club football BTTS settle E2E + WC `matches`/`predictions` settle E2E
- [x] F1 championship offline settle E2E
- [x] Arcade settle E2E expanded (dice, keno, plinko, wheel)
- [x] Leagues / referrals / top-up UI E2E smoke
- [x] League sport filters + member chat

### Still required once against real production

1. Set Lovable/Cloudflare env **`CRON_HOOK_SECRET`** to a long random value.
2. In the live SQL editor (service role):
   ```sql
   select vault.create_secret('<same value>', 'cron_hook_secret', 'Cron hook auth');
   -- optional: select vault.create_secret('https://your-host', 'app_base_url', 'Public app URL');
   select public.reschedule_cron_hooks_with_vault();
   select * from public.phase_b_ops_selftest();
   ```
3. Spot-check unauthenticated `POST /api/public/hooks/health-check` → 401
   and authed → 200; confirm `/management/admin/health` ages move.
4. Confirm risk UI: `apply_margin_to_real` on, arcade
   `capacity_enforced` / `arcade_config_selftest()` green, reconciliation OK.

Historical checklist items retained below:

- [ ] `CRON_HOOK_SECRET` set in production env (not the CI placeholder)
- [ ] Run `reschedule_cron_hooks_with_vault()` after creating Vault
      `cron_hook_secret` (+ optional `app_base_url`)
- [ ] Spot-check unauthenticated `health-check` → 401 and authenticated →
      200 on the live host
- [ ] `/management/admin/health` shows recent ages when crons are live
- [ ] Confirm prod `apply_margin_to_real` and `capacity_enforced` match the
      Phase B migration defaults (odds refresh after margin flip)
- [ ] `bun run test` / CI green on ephemeral Supabase (first full migration dry-run)
- [ ] Reconciliation `overall_status = OK`
- [ ] `select * from arcade_config_selftest();` all rows `passed = true`
      (includes `min_stake_floor_consistent` — every arcade table must
      accept a 1-point stake, matching what the ChipRack UI shows)
- [ ] Migration `20260806140000_phase_a_rps_min_stake_fix` applied — RPS
      previously had a hidden 5-point floor while its chip rack (and every
      other game) advertised a 1-point chip
- [ ] Migration `20260806160000_phase_a_rps_opening_multiplier` applied —
      note: the tiered ladder payout itself (win #1/#2 pay less than a flat
      rate) shipped independently on `main` as `ladder_multipliers` /
      `ladder_tail_multiplier` (config) + `ladder_step` (round), resolved via
      `arcade_rps_step_multiplier()`; this migration was rewritten to not
      collide with that and instead (a) closes a fan-out gap where one
      settled round could be claimed as `parent_round_id` by more than one
      continuation, each wrongly inheriting the higher post-opening rate,
      and (b) fixes `arcade_config_selftest()`'s historical-replay check to
      verify against the real per-step ladder rate instead of a flat
      `win_multiplier`. Confirm on `/management/admin/arcade` that the live
      `ladder_multipliers` / `ladder_tail_multiplier` values match the
      intended round-1/round-2 house edge before enabling for real users

- [ ] Migration `20260811080000_phase_a_arcade_admin_rpc_hardening` applied
      — security review found `arcade_publish_roulette_config`,
      `arcade_publish_rps_config` and `arcade_admin_snapshot` authorized on
      a caller-supplied `p_admin` argument (not the real caller) while
      granted to `authenticated`; any logged-in user could pass a known
      admin's UUID and push live payout config. Now `service_role` only,
      matching `arcade_publish_treasure_config`'s existing pattern. Also
      closes a gap where `ladder_multipliers[]` steps weren't bounded like
      `win_multiplier` is, so a patch could publish an unsafe per-step
      payout live.
- [ ] Confirm every arcade wallet-mutating server function calls
      `requireApprovedMember` (added to `settleRpsRound`, `placePlinkoDrop`,
      `placeRouletteSpin`, `startTreasureRound`, `startBlackjackHand`) —
      previously the "pending approval" gate was UI-only, so a pending
      user with a valid session could wager real wallet points on arcade
      before an admin approved them (WC sports + club football / F1 / UFC
      place + wallet/payout/edit/freebet mutators now share
      `src/lib/access-control.ts`)

## Reference
- `/docs/BACKUP_RECOVERY.md` — recovery checklist
- `/management/admin/health` — system health-check history
- `/management/admin/incidents` — incident log
- `/management/admin/alerts` — operational alerts
