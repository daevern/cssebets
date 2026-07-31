-- ============================================================
-- Phase 3.1 (3/3): shadow wallet bridge + readiness reporting
-- ============================================================

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS accounting_journal_id uuid,
  ADD COLUMN IF NOT EXISTS accounting_sync_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS accounting_sync_error text,
  ADD COLUMN IF NOT EXISTS accounting_synced_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_accounting_sync_status_check') THEN
    ALTER TABLE public.wallet_transactions
      ADD CONSTRAINT wallet_transactions_accounting_sync_status_check
      CHECK (accounting_sync_status IN ('PENDING','SYNCED','SKIPPED','ERROR'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wallet_transactions_accounting_sync_idx
  ON public.wallet_transactions (accounting_sync_status, created_at);

-- everything at or before the environment cutover is already inside the opening journal
UPDATE public.wallet_transactions wt
   SET accounting_sync_status = 'SKIPPED',
       accounting_sync_error = 'pre-cutover: included in the Phase 3.1 opening balance journal',
       accounting_synced_at = now()
 WHERE wt.accounting_sync_status = 'PENDING'
   AND wt.created_at <= (
     SELECT max(cutover_timestamp) FROM public.accounting_cutover_batches
      WHERE superseded_at IS NULL);

-- ---------------------------------------------------------------
-- bridge one legacy wallet transaction into the double-entry ledger
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_bridge_wallet_transaction(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tx public.wallet_transactions%ROWTYPE;
  v_env public.acct_environment;
  v_wallet_account uuid;
  v_clearing uuid;
  v_delta numeric(18,2);
  v_lines jsonb;
  v_res jsonb;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may run the wallet bridge';
  END IF;

  SELECT * INTO v_tx FROM public.wallet_transactions WHERE id = p_tx_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','MISSING','transaction_id',p_tx_id);
  END IF;
  IF v_tx.accounting_sync_status = 'SYNCED' THEN
    RETURN jsonb_build_object('status','SYNCED','journal_id',v_tx.accounting_journal_id,'idempotent',true);
  END IF;

  v_env := CASE WHEN coalesce(v_tx.is_simulation,false) THEN 'SIMULATION' ELSE 'PRODUCTION' END;

  SELECT a.id INTO v_wallet_account FROM public.accounting_accounts a
   WHERE a.user_id = v_tx.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  IF v_wallet_account IS NULL THEN
    UPDATE public.wallet_transactions
       SET accounting_sync_status = 'ERROR',
           accounting_sync_error = 'no active USER_WALLET account for this user'
     WHERE id = p_tx_id;
    RETURN jsonb_build_object('status','ERROR','reason','missing_wallet_account');
  END IF;

  SELECT a.id INTO v_clearing FROM public.accounting_accounts a
   WHERE a.account_code = 'LEGACY_PRODUCT_CLEARING' AND a.environment = v_env AND a.status = 'ACTIVE';

  v_delta := round(coalesce(v_tx.balance_after,0) - coalesce(v_tx.balance_before,0), 2);
  IF v_delta = 0 THEN
    UPDATE public.wallet_transactions
       SET accounting_sync_status = 'SKIPPED',
           accounting_sync_error = 'zero net wallet effect',
           accounting_synced_at = now()
     WHERE id = p_tx_id;
    RETURN jsonb_build_object('status','SKIPPED','reason','zero_delta');
  END IF;

  IF v_delta > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_clearing, 'debit', v_delta, 'credit', 0),
      jsonb_build_object('account_id', v_wallet_account, 'debit', 0, 'credit', v_delta));
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_wallet_account, 'debit', -v_delta, 'credit', 0),
      jsonb_build_object('account_id', v_clearing, 'debit', 0, 'credit', -v_delta));
  END IF;

  BEGIN
    v_res := public.accounting_post_journal(
      p_journal_type := 'LEGACY_BACKFILL_REFERENCE',
      p_lines := v_lines,
      p_idempotency_key := 'legacy-wallet-tx:' || v_tx.id::text,
      p_product := coalesce(v_tx.transaction_category, v_tx.reference_type, 'legacy'),
      p_reference_type := v_tx.reference_type::text,
      p_reference_id := v_tx.reference_id::text,
      p_event_type := v_tx.type::text,
      p_effective_at := v_tx.created_at,
      p_metadata := jsonb_build_object(
        'source','legacy_wallet_transaction',
        'wallet_transaction_id', v_tx.id,
        'legacy_ledger_seq', v_tx.ledger_seq,
        'shadow_mode', true),
      p_allow_negative := true,
      p_environment := v_env::text);
  EXCEPTION WHEN others THEN
    UPDATE public.wallet_transactions
       SET accounting_sync_status = 'ERROR', accounting_sync_error = SQLERRM
     WHERE id = p_tx_id;
    RETURN jsonb_build_object('status','ERROR','reason',SQLERRM);
  END;

  UPDATE public.wallet_transactions
     SET accounting_sync_status = 'SYNCED',
         accounting_journal_id = (v_res->>'journal_id')::uuid,
         accounting_sync_error = NULL,
         accounting_synced_at = now()
   WHERE id = p_tx_id;

  RETURN jsonb_build_object('status','SYNCED','journal_number', v_res->>'journal_number',
                            'environment', v_env, 'delta', v_delta);
END $fn$;

-- ---------------------------------------------------------------
-- run the bridge over everything outstanding, in deterministic order
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_bridge_sync(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  v_res jsonb;
  v_synced int := 0;
  v_skipped int := 0;
  v_errors int := 0;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may run the wallet bridge';
  END IF;

  FOR r IN
    SELECT id FROM public.wallet_transactions
     WHERE accounting_sync_status IN ('PENDING','ERROR')
     ORDER BY ledger_seq NULLS LAST, created_at, id
     LIMIT greatest(1, p_limit)
  LOOP
    v_res := public.accounting_bridge_wallet_transaction(r.id);
    IF v_res->>'status' = 'SYNCED' THEN v_synced := v_synced + 1;
    ELSIF v_res->>'status' = 'SKIPPED' THEN v_skipped := v_skipped + 1;
    ELSE v_errors := v_errors + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('synced', v_synced, 'skipped', v_skipped, 'errors', v_errors,
                            'ran_at', now());
END $fn$;

REVOKE ALL ON FUNCTION public.accounting_bridge_wallet_transaction(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accounting_bridge_sync(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_bridge_wallet_transaction(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.accounting_bridge_sync(integer) TO service_role;

-- ---------------------------------------------------------------
-- reporting: per-user wallet drift, bridge health, readiness
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_accounting_wallet_drift AS
SELECT w.user_id,
       CASE WHEN w.is_simulation THEN 'SIMULATION' ELSE 'PRODUCTION' END AS environment,
       w.balance AS legacy_balance,
       coalesce(b.balance, 0) AS ledger_balance,
       round(w.balance - coalesce(b.balance, 0), 2) AS drift
  FROM public.wallets w
  LEFT JOIN public.accounting_accounts a
    ON a.user_id = w.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE'
  LEFT JOIN public.accounting_account_balances b ON b.account_id = a.id;

CREATE OR REPLACE VIEW public.v_accounting_bridge_status AS
SELECT accounting_sync_status AS status, count(*) AS transactions,
       min(created_at) AS oldest, max(created_at) AS newest
  FROM public.wallet_transactions
 GROUP BY accounting_sync_status;

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
  SELECT count(*) AS mixed_journals FROM (
    SELECT l.journal_id
      FROM public.accounting_journal_lines l
      JOIN public.accounting_accounts a ON a.id = l.account_id
     GROUP BY l.journal_id
    HAVING count(DISTINCT a.environment) > 1) m
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
        AND tb.imbalance = 0 AND mixed.mixed_journals <= 1
        AND payable.unclassified_total = 0) AS ready_for_product_migration,
       now() AS checked_at
  FROM drift, bridge, tb, mixed, payable;

REVOKE ALL ON public.v_accounting_wallet_drift FROM PUBLIC;
REVOKE ALL ON public.v_accounting_bridge_status FROM PUBLIC;
REVOKE ALL ON public.v_accounting_migration_readiness FROM PUBLIC;
GRANT SELECT ON public.v_accounting_wallet_drift TO service_role;
GRANT SELECT ON public.v_accounting_bridge_status TO service_role;
GRANT SELECT ON public.v_accounting_migration_readiness TO service_role;

-- ---------------------------------------------------------------
-- keep the shadow ledger current
-- ---------------------------------------------------------------
SELECT cron.unschedule('accounting-wallet-bridge')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'accounting-wallet-bridge');

SELECT cron.schedule('accounting-wallet-bridge', '*/2 * * * *',
  $cron$SELECT public.accounting_bridge_sync(500);$cron$);

SELECT public.accounting_bridge_sync(1000);