# Backup & Recovery

## Database backups
The Lovable Cloud Postgres database is backed up automatically by the
platform. Lovable Cloud retains daily snapshots; restoring requires
contacting Lovable support. There is no self-service point-in-time
restore in the project today.

## Pre-change snapshot procedure
Before any high-risk change (large migration, mass data update,
bankroll/wallet rollback):
1. Confirm reconciliation report shows `overall_status = OK` in
   `/management/admin/reconciliation`.
2. Run `/management/admin/health` and confirm `database`,
   `settlement_queue`, and `reconciliation` checks are `ok`.
3. Record current `platform_bankroll.balance` and the total of
   `wallets.balance` in an incident note (`/management/admin/incidents`).
4. If the change is destructive, request a Lovable support snapshot
   before proceeding.

## Recovery validation checklist
After any restore or rollback:
- [ ] `run_reconciliation_check` returns `overall_status = OK`.
- [ ] `platform_bankroll.balance` matches the pre-change snapshot
      ± documented intentional movements.
- [ ] Sum of `wallets.balance` matches the pre-change snapshot
      ± documented intentional movements.
- [ ] No predictions stuck in `pending` for finished matches
      (see `/management/admin/settlements`).
- [ ] No open critical alerts in `/management/admin/alerts`.

## Disaster recovery
For full data loss, escalate to Lovable support and request the latest
daily snapshot. While the restore is in flight:
1. Set `platform_settings.bets_paused = true` to stop new bets.
2. Post status on the support page (closed conversations stay closed).
3. Open an incident in `/management/admin/incidents` with category
   `security` or `other` and severity `critical`.

## Bankroll recovery
If `platform_bankroll.balance` drifts from the ledger:
1. Investigate via `/management/admin/reconciliation` — note which
   check is failing.
2. Compare against `platform_transactions` for the same period.
3. Apply correction via the bankroll page; record the reason in the
   audit log and the matching incident.

## Wallet recovery
If a user wallet drifts from `wallet_transactions`:
1. Open `/management/admin/wallet-ledger` for the user.
2. Use `adminAdjustWallet` to correct the balance to the ledger total
   (`reference_id = null` for manual corrections).
3. Note the reason in the audit log and link the incident ID.

## Incident escalation
- `low` / `medium` — handled by on-shift admin; close within 7 days.
- `high` — assign to a super_admin within 1 hour.
- `critical` — pause betting if integrity is in doubt; super_admin
  must acknowledge within 15 minutes and post an incident note.
