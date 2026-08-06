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

## Go-live checklist (Phase A)

- [ ] `CRON_HOOK_SECRET` set in production env
- [ ] All pg_cron `net.http_post` jobs send `x-cron-secret` (or Bearer)
- [ ] Unauthenticated POST to `/api/public/hooks/health-check` returns 401
- [ ] Authenticated cron POST returns 200 and writes `health_check_runs`
- [ ] `accounting_migration_flags.capacity_enforced = true` for
      plinko, rps, blackjack, roulette, treasure
- [ ] Reviewed `apply_margin_to_real` on `/management/admin/risk-settings`
      (warning banner visible when off)
- [ ] `bun run test` / CI green
- [ ] Reconciliation `overall_status = OK`

## Reference
- `/docs/BACKUP_RECOVERY.md` — recovery checklist
- `/management/admin/health` — system health-check history
- `/management/admin/incidents` — incident log
- `/management/admin/alerts` — operational alerts
