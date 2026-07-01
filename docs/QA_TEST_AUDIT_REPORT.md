# QA Test Audit Report

Branch: `qa/production-logic-test-hardening`
Date: 2026-07-01

## What Was Inspected

Production files inspected through the GitHub connector included:

- `package.json`
- `src/lib/wallet.functions.ts`
- `src/lib/markets.functions.ts`
- `src/lib/bankroll.functions.ts`
- `src/lib/settlement.server.ts`
- `src/lib/sync.server.ts`
- `src/lib/operations.functions.ts`
- `src/lib/payout.functions.ts`
- `src/lib/admin-dashboard.functions.ts`
- `src/lib/apifootball-mapping.ts`
- `src/lib/apifootball-sync.server.ts`
- `src/lib/odds.server.ts`
- `src/lib/odds-margin.server.ts`
- `src/lib/apifootball.server.ts`
- `src/routes/api/public/hooks/apifootball-sync.ts`
- `src/routes/api/public/hooks/reconciliation.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/hooks/use-auth.ts`
- `src/routes/management/admin.staff.tsx`
- `src/routes/management/admin.payouts.tsx`
- `src/routes/management/admin.audit.tsx`

Missing before this branch's work:

- `vitest.config.ts`
- `.github/workflows/ci.yml`
- `docs/QA_TEST_AUDIT_REPORT.md`
- `src/lib/qa/`
- package test scripts

## Test Setup Added

- `vitest.config.ts`
- `src/test/setup.ts`
- `package.json` scripts: `test`, `test:unit`, `test:coverage`
- Dev dependencies: `vitest`, `@vitest/coverage-v8`
- `.github/workflows/ci.yml`

## Test Files Added

- `src/lib/apifootball-mapping.test.ts`
- `src/lib/odds-margin.server.test.ts`
- `src/lib/markets.functions.test.ts`
- `src/lib/settlement.server.test.ts`
- `src/lib/audit-log.contract.test.ts`

## Production Files Covered

- `src/lib/apifootball-mapping.ts`
- `src/lib/odds-margin.server.ts`
- `src/lib/markets.functions.ts`
- `src/lib/settlement.server.ts`
- Audit shape expected by `wallet.functions.ts`, `payout.functions.ts`, `admin-dashboard.functions.ts`, `operations.functions.ts`, and `bankroll.functions.ts`

## Coverage Map

| Test file | Production file/function covered |
| --- | --- |
| `src/lib/apifootball-mapping.test.ts` | `parseBookmakerPayload` provider label mapping, invalid odds filtering, median aggregation |
| `src/lib/odds-margin.server.test.ts` | `parseValidDecimalOdd`, `validateThreeWayOdds`, `compute3WayOdds`, `apply3WayMargin`, `applyOutrightMargin` |
| `src/lib/markets.functions.test.ts` | `PlaceMarketBetSchema`, `MARKET_KEYS`, `mapPlaceMarketBetErrorMessage` |
| `src/lib/settlement.server.test.ts` | `settlePredictionsForMatch`, `voidMatch` RPC wrappers and failure propagation |
| `src/lib/audit-log.contract.test.ts` | Shared audit-row contract and direct-wallet-mutation drift risk |

## Safe Fixes Made

- Added exported production validation for market placement payloads via `PlaceMarketBetSchema`.
- Extracted production RPC error mapping into `mapPlaceMarketBetErrorMessage` so duplicate submit, locked match, stale odds, insufficient balance, and risk-cap failures remain testable.
- Added strict decimal-odds validation in `src/lib/odds-margin.server.ts` so null, undefined, strings, NaN, Infinity, zero, negative, below-minimum, and extremely large values are rejected instead of silently coerced.

## High-Risk Findings

1. Critical wallet, bet placement, payout, bankroll, and settlement correctness depends on Supabase RPCs whose SQL definitions were not listable from this connector session.
2. No pre-existing automated test setup was found.
3. No confirmed CI workflow existed before this branch.
4. `src/lib/apifootball-mapping.ts` defensively skips malformed provider values; integration tests should confirm bad provider payloads cannot mark odds as trusted.
5. Server functions rely on Supabase auth middleware and RLS/RPCs; unit tests can only partially cover these without a local Supabase stack.

## Business Logic Risks

- Wallet balance and ledger consistency must be enforced in database transactions, not only TypeScript code.
- Bet placement must never trust client odds, multiplier, user id, or market status.
- Settlement must be idempotent and must not double-pay on repeated syncs or retries.
- Payout approval must debit exactly once and must preserve auditability across proof upload and user confirmation/rejection.

## Security/RBAC Risks

- Role hierarchy is split across frontend hooks, server functions, and database role checks.
- Viewer/support access must be read-only on every high-risk server path.
- Super admin actions require fresh reauth in several places; integration tests should confirm this cannot be bypassed.
- API hook routes under `/api/public/hooks/*` need deployment-level protection or cron-only access controls if not already present externally.

## Database Integrity Risks

- Direct `wallets.balance` mutation without a matching `wallet_transactions` row would create drift.
- Duplicate transaction/reference IDs must be rejected or treated idempotently by RPCs.
- Audit logs should be append-only for normal users.
- Reconciliation must cover wallets, platform bankroll, payouts, predictions, and settlement state.

## API Sync / Import Risks

- API-Football and Odds API sync must not call live services during automated tests.
- Empty, malformed, stale, quota-limited, or auth-failed provider responses must not unsuspend markets or auto-settle records.
- Already-settled results must not be overwritten by changed provider scores without explicit correction workflow.

## Unresolved Issues

- Supabase migration definitions could not be fully inventoried because this connector session could not list `supabase/migrations/` in the private repo.
- Local tests/build/lint could not be executed in this workspace because there is no local checkout and `git`/`gh` are unavailable on PATH.
- Integration tests against actual Supabase RPCs remain required.
- Test coverage currently focuses on production TypeScript logic and RPC wrappers, not database transaction internals.

## How To Run Tests

```bash
npm install
npm run test
npm run test:coverage
npm run lint
npm run build
```

CI runs install, lint, test, and build on push and pull request using test-only environment placeholders.

## Required Human Review Before Production

- Review and run the new tests in a local checkout.
- Complete the RPC migration inventory from `supabase/migrations/**/*.sql`.
- Add Supabase integration tests for critical RPCs before relying on production deployment.
- Review public hook authentication/deployment controls.
- Confirm odds validation changes are compatible with all provider sync paths.
