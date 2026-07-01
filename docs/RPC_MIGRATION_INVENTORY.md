# RPC Migration Inventory

Branch: `qa/production-logic-test-hardening`
Date: 2026-07-01

## Scope and Limitation

This inventory was prepared from readable production TypeScript code and direct file probes through the GitHub connector. The connector confirms `supabase/config.toml` exists, but this session could not list `supabase/migrations/`, and guessed migration filenames returned 404. Treat the migration-file columns below as incomplete until a local checkout or GitHub tree listing is available.

Do not delete or squash migrations casually. Supabase migrations are deployment history and may include repeated function definitions that intentionally supersede earlier definitions.

## High-Priority RPCs

| RPC/function | Production callers inspected | Migration definition located | Latest definition | Conflict risk | Risk level | Recommended cleanup |
| --- | --- | --- | --- | --- | --- | --- |
| `wallet_apply_change` | `src/lib/wallet.functions.ts`, `src/lib/admin-dashboard.functions.ts` | Not located in this connector pass | Unknown | Unknown repeated definitions | Critical | Locate all migration definitions, confirm atomic balance + ledger insert, enforce non-negative debit, idempotency key/reference uniqueness, and audit coverage. |
| `wallet_approve_request` | `src/lib/wallet.functions.ts` | Not located | Unknown | Unknown | Critical | Verify request status transition, admin self-approval guard, wallet credit, ledger row, and request audit happen atomically. |
| `wallet_reject_request` | `src/lib/wallet.functions.ts` | Not located | Unknown | Unknown | High | Verify rejection is idempotent and cannot mutate approved requests. |
| `place_market_bet_atomic` | `src/lib/markets.functions.ts` | Not located | Unknown | Unknown | Critical | Verify server-side odds lookup, stake debit, clientRequestId idempotency, market lock, risk caps, and prediction insert are one transaction. |
| `settle_match_all_markets_atomic` | `src/lib/settlement.server.ts`, `src/lib/operations.functions.ts` | Not located | Unknown | Unknown | Critical | Verify idempotent settlement, no double payout, ledger consistency, void/refund separation, and corrected result workflow. |
| `void_match_atomic` | `src/lib/settlement.server.ts`, `src/lib/bankroll.functions.ts` | Not located | Unknown | Unknown | Critical | Verify safe refund behavior and idempotency. |
| `payout_approve_atomic` | `src/lib/payout.functions.ts` | Not located | Unknown | Unknown | Critical | Verify balance debit, payout state transition, duplicate approval guard, and audit/log behavior. |
| `payout_user_confirm` | `src/lib/payout.functions.ts` | Not located | Unknown | Unknown | High | Verify only owner can confirm, repeated confirmation is rejected/idempotent. |
| `payout_user_reject_atomic` | `src/lib/payout.functions.ts` | Not located | Unknown | Unknown | High | Verify user rejection refunds or preserves balance consistently. |
| `apifootball_consume_quota` | `src/lib/apifootball.server.ts` | Not located | Unknown | Unknown | Medium | Verify daily reset, no negative remaining, concurrent consume correctness. |
| `check_rate_limit` | `src/lib/rate-limit.functions.ts` | Not located | Unknown | Unknown | Medium | Verify deterministic scope/action windows and fail-open policy is intentional. |
| `run_reconciliation_check` | `src/routes/api/public/hooks/reconciliation.ts` | Not located | Unknown | Unknown | High | Verify drift checks cover wallet ledger, payout states, settlement, bankroll and orphaned rows. |
| `platform_apply_change` | `src/lib/bankroll.functions.ts` | Not located | Unknown | Unknown | High | Verify platform bankroll cannot go negative and every change creates a platform transaction. |
| `set_house_user` | `src/lib/bankroll.functions.ts` | Not located | Unknown | Unknown | High | Verify super_admin-only enforcement and audit trail. |
| `regenerate_match_market_odds` | `src/lib/odds.server.ts` | Not located | Unknown | Unknown | Medium | Verify no fabricated real-match odds are generated without trusted reference odds. |
| `refresh_odds_status_for_open_matches` | `src/lib/sync.server.ts` | Not located | Unknown | Unknown | Medium | Verify missing/stale/provider failures suspend markets safely. |
| `admin_set_match_margin_disabled` | `src/lib/admin-dashboard.functions.ts` | Not located | Unknown | Unknown | High | Verify reauth/audit and no unauthorized odds margin bypass. |
| `has_role` | `src/lib/markets.functions.ts` | Not located | Unknown | Unknown | High | Verify role names and hierarchy align with server-side admin checks. |

## Repeated/Conflicting Definitions

No migration definitions were readable in this connector pass, so repeated definitions could not be confirmed or ruled out.

Manual follow-up should run from a local checkout:

```bash
rg "create\s+or\s+replace\s+function|create\s+function|wallet_apply_change|place_market_bet_atomic|settle_match_all_markets_atomic" supabase
```

## Cleanup Strategy

1. Generate a complete RPC map from `supabase/migrations/**/*.sql`.
2. For each repeated function, identify the latest timestamped migration as the effective definition.
3. Diff repeated definitions for behavior changes around idempotency, status transitions, and ledger writes.
4. Add database-level integration tests before consolidating any migration behavior.
5. Never delete historical migrations unless a fresh baseline migration strategy is explicitly approved.
