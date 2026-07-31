CREATE OR REPLACE VIEW public.v_accounting_migration_readiness AS
WITH drift AS (
  SELECT count(*) FILTER (WHERE drift <> 0) AS drift_users,
         coalesce(sum(abs(drift)), 0) AS drift_total
    FROM public.v_accounting_wallet_drift
), bridge AS (
  SELECT count(*) FILTER (WHERE accounting_sync_status = 'PENDING') AS pending_tx,
         count(*) FILTER (WHERE accounting_sync_status = 'ERROR') AS error_tx
    FROM public.wallet_transactions
), tb AS (
  SELECT coalesce(sum(debit_total), 0) - coalesce(sum(credit_total), 0) AS imbalance
    FROM public.v_accounting_trial_balance
), mixed AS (
  SELECT count(*) AS mixed_journals
    FROM (
      SELECT l.journal_id
        FROM public.accounting_journal_lines l
        JOIN public.accounting_accounts a ON a.id = l.account_id
       GROUP BY l.journal_id
      HAVING count(DISTINCT a.environment) > 1) m
    JOIN public.accounting_journals j ON j.id = m.journal_id
   WHERE j.status <> 'REVERSED'
     AND coalesce((j.metadata->>'mixed_environment_reversal')::boolean, false) = false
), payable AS (
  SELECT coalesce(sum(pr.amount), 0) AS reserved_total,
         coalesce(sum(pr.amount) FILTER (WHERE ri.id IS NULL), 0) AS unclassified_total
    FROM public.payout_requests pr
    LEFT JOIN public.accounting_reconciliation_items ri
      ON ri.scope = 'reserved_payout_liability'
     AND ri.evidence->>'payout_request_id' = pr.id::text
   WHERE pr.status = 'proof_uploaded'
)
SELECT drift.drift_users, drift.drift_total,
       bridge.pending_tx, bridge.error_tx,
       tb.imbalance AS trial_balance_imbalance,
       mixed.mixed_journals,
       payable.reserved_total AS reserved_payout_liability,
       payable.unclassified_total AS unclassified_reserved_liability,
       (drift.drift_users = 0 AND bridge.pending_tx = 0 AND bridge.error_tx = 0
        AND tb.imbalance = 0 AND mixed.mixed_journals = 0
        AND payable.unclassified_total = 0) AS ready_for_product_migration,
       now() AS checked_at
  FROM drift, bridge, tb, mixed, payable;

ALTER VIEW public.v_accounting_migration_readiness SET (security_invoker = on);
REVOKE ALL ON public.v_accounting_migration_readiness FROM PUBLIC;
GRANT SELECT ON public.v_accounting_migration_readiness TO service_role;