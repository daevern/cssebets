-- ============================================================
-- Phase 3.1 (2/3): reverse mixed opening, post per-env openings
-- ============================================================

-- allow reversal of pre-hardening journals that legitimately mixed environments
DROP FUNCTION IF EXISTS public.accounting_post_journal(text,jsonb,text,text,text,text,text,text,integer,timestamptz,uuid,uuid,uuid,uuid,jsonb,uuid,boolean);

CREATE OR REPLACE FUNCTION public.accounting_post_journal(
  p_journal_type text,
  p_lines jsonb,
  p_idempotency_key text,
  p_product text DEFAULT NULL,
  p_game text DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_settlement_version integer DEFAULT NULL,
  p_effective_at timestamptz DEFAULT now(),
  p_cutover_batch_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_approved_by uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_reversal_of uuid DEFAULT NULL,
  p_allow_negative boolean DEFAULT false,
  p_environment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_existing public.accounting_journals%ROWTYPE;
  v_seq bigint;
  v_journal_id uuid;
  v_journal_no text;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_line jsonb;
  v_count int := 0;
  v_acct public.accounting_accounts%ROWTYPE;
  v_before numeric(18,2);
  v_after numeric(18,2);
  v_effect numeric(18,2);
  v_debit numeric;
  v_credit numeric;
  v_results jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_envs public.acct_environment[];
  v_env public.acct_environment;
  v_orig public.accounting_journals%ROWTYPE;
  v_mixed_ok boolean := false;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may post journals';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: idempotency_key required (min 8 chars)';
  END IF;

  SELECT * INTO v_existing FROM public.accounting_journals
   WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'idempotent', true, 'journal_id', v_existing.id,
      'journal_number', v_existing.journal_number,
      'ledger_seq', v_existing.ledger_seq, 'status', v_existing.status,
      'environment', v_existing.environment);
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: a posted journal requires at least two lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: negative amounts are not allowed';
    END IF;
    IF (v_debit > 0 AND v_credit > 0) THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: a line cannot carry both a debit and a credit';
    END IF;
    IF (v_debit = 0 AND v_credit = 0) THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: a line must carry a debit or credit greater than zero';
    END IF;
    IF v_debit <> round(v_debit, 2) OR v_credit <> round(v_credit, 2) THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: amounts must use 2-decimal fixed precision';
    END IF;
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
    v_ids := array_append(v_ids, (v_line->>'account_id')::uuid);
  END LOOP;

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'ACCOUNTING_UNBALANCED: debits % <> credits %', v_total_debit, v_total_credit;
  END IF;

  SELECT array_agg(DISTINCT a.environment) INTO v_envs
    FROM public.accounting_accounts a WHERE a.id = ANY(v_ids);
  IF v_envs IS NULL OR array_length(v_envs, 1) IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: no valid accounts referenced';
  END IF;

  IF array_length(v_envs, 1) > 1 THEN
    -- the ONLY permitted mixed-environment journal is the reversal of a
    -- pre-hardening journal that was itself posted with mixed accounts.
    IF p_reversal_of IS NOT NULL THEN
      SELECT * INTO v_orig FROM public.accounting_journals WHERE id = p_reversal_of;
      IF FOUND AND (
        SELECT count(DISTINCT a.environment)
          FROM public.accounting_journal_lines l
          JOIN public.accounting_accounts a ON a.id = l.account_id
         WHERE l.journal_id = v_orig.id) > 1
      THEN
        v_mixed_ok := true;
        v_env := v_orig.environment;
      END IF;
    END IF;
    IF NOT v_mixed_ok THEN
      RAISE EXCEPTION 'ACCOUNTING_CROSS_ENVIRONMENT: a journal may not mix environments (%)', v_envs;
    END IF;
  ELSE
    v_env := v_envs[1];
  END IF;

  IF p_environment IS NOT NULL AND upper(p_environment)::public.acct_environment <> v_env THEN
    RAISE EXCEPTION 'ACCOUNTING_CROSS_ENVIRONMENT: declared % but accounts are %', p_environment, v_env;
  END IF;

  PERFORM set_config('accounting.internal', 'on', true);

  PERFORM 1 FROM public.accounting_account_balances b
    WHERE b.account_id = ANY(v_ids)
    ORDER BY b.account_id
    FOR UPDATE;

  v_seq := nextval('public.accounting_ledger_seq');
  v_journal_no := 'J' || lpad(v_seq::text, 10, '0');

  INSERT INTO public.accounting_journals (
    journal_number, ledger_seq, journal_type, product, game, reference_type, reference_id,
    event_type, settlement_version, idempotency_key, effective_at, status,
    reversal_of_journal_id, cutover_batch_id, created_by, approved_by, correlation_id, metadata,
    environment)
  VALUES (
    v_journal_no, v_seq, p_journal_type::public.acct_journal_type, p_product, p_game,
    p_reference_type, p_reference_id, p_event_type, p_settlement_version, p_idempotency_key,
    p_effective_at, 'DRAFT', p_reversal_of, p_cutover_batch_id, p_created_by, p_approved_by,
    p_correlation_id,
    coalesce(p_metadata, '{}'::jsonb) || (CASE WHEN v_mixed_ok
      THEN jsonb_build_object('mixed_environment_reversal', true) ELSE '{}'::jsonb END),
    v_env)
  RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_count := v_count + 1;
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);

    SELECT * INTO v_acct FROM public.accounting_accounts
      WHERE id = (v_line->>'account_id')::uuid;
    IF NOT FOUND OR v_acct.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'ACCOUNTING_INVALID: account % missing or inactive', v_line->>'account_id';
    END IF;

    SELECT balance INTO v_before FROM public.accounting_account_balances
      WHERE account_id = v_acct.id FOR UPDATE;

    IF v_acct.normal_balance = 'CREDIT' THEN
      v_effect := v_credit - v_debit;
    ELSE
      v_effect := v_debit - v_credit;
    END IF;
    v_after := v_before + v_effect;

    IF v_after < 0 AND NOT p_allow_negative
       AND v_acct.account_code IN ('USER_WALLET') THEN
      RAISE EXCEPTION 'ACCOUNTING_INSUFFICIENT_FUNDS: account % would go negative (% -> %)',
        v_acct.account_code, v_before, v_after;
    END IF;

    INSERT INTO public.accounting_journal_lines (
      journal_id, line_number, account_id, debit, credit, signed_effect,
      balance_before, balance_after, metadata)
    VALUES (v_journal_id, v_count, v_acct.id, v_debit, v_credit, v_effect,
      v_before, v_after, coalesce(v_line->'metadata', '{}'::jsonb));

    UPDATE public.accounting_account_balances
       SET balance = v_after, last_ledger_seq = v_seq, version = version + 1, updated_at = now()
     WHERE account_id = v_acct.id;

    v_results := v_results || jsonb_build_object(
      'account_id', v_acct.id, 'account_code', v_acct.account_code, 'balance_after', v_after);
  END LOOP;

  UPDATE public.accounting_journals SET status = 'POSTED' WHERE id = v_journal_id;

  PERFORM set_config('accounting.internal', 'off', true);

  RETURN jsonb_build_object(
    'idempotent', false,
    'journal_id', v_journal_id,
    'journal_number', v_journal_no,
    'ledger_seq', v_seq,
    'environment', v_env,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'balances', v_results);
END $fn$;

-- ---------------------------------------------------------------
DO $mig$
DECLARE
  v_old_batch uuid := '7fbcc9a1-ba41-47b7-b3bb-979d29386145';
  v_old_journal uuid;
  v_prod_batch uuid;
  v_sim_batch uuid;
  v_house_prod numeric(18,2);
  v_house_sim numeric(18,2);
  v_wallet_prod numeric(18,2);
  v_wallet_sim numeric(18,2);
  v_payable numeric(18,2);
  v_users_prod int;
  v_users_sim int;
  v_lines jsonb;
  v_snap jsonb;
  v_res jsonb;
  v_legacy_seq bigint;
BEGIN
  SELECT id INTO v_old_journal FROM public.accounting_journals
   WHERE journal_number = 'J0000000001';

  -- 1. reverse the mixed opening journal (nothing is edited or deleted)
  IF v_old_journal IS NOT NULL AND (
      SELECT status FROM public.accounting_journals WHERE id = v_old_journal) = 'POSTED' THEN
    PERFORM public.accounting_reverse_journal(
      v_old_journal,
      'Phase 3.1: superseded by environment-separated opening journals',
      'phase31-reverse-mixed-opening-J0000000001');
  END IF;

  -- 2. fresh live figures
  SELECT balance INTO v_house_prod FROM public.platform_bankroll WHERE kind = 'live';
  SELECT balance INTO v_house_sim  FROM public.platform_bankroll WHERE kind = 'simulation';

  SELECT coalesce(sum(w.balance),0), count(*) INTO v_wallet_prod, v_users_prod
    FROM public.wallets w
    JOIN public.accounting_accounts a
      ON a.user_id = w.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE'
   WHERE w.is_simulation = false;

  SELECT coalesce(sum(w.balance),0), count(*) INTO v_wallet_sim, v_users_sim
    FROM public.wallets w
    JOIN public.accounting_accounts a
      ON a.user_id = w.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE'
   WHERE w.is_simulation = true;

  SELECT coalesce(sum(amount),0) INTO v_payable
    FROM public.payout_requests WHERE status = 'proof_uploaded';

  SELECT coalesce(max(ledger_seq),0) INTO v_legacy_seq FROM public.platform_transactions;

  -- 3. PRODUCTION cutover batch
  v_snap := jsonb_build_object(
    'environment','PRODUCTION',
    'house_bankroll', v_house_prod,
    'user_wallets', v_wallet_prod,
    'user_count', v_users_prod,
    'reserved_payout_liability', v_payable,
    'legacy_ledger_last_sequence', v_legacy_seq,
    'supersedes_batch', v_old_batch);

  INSERT INTO public.accounting_cutover_batches (
    cutover_timestamp, status, environment, live_bankroll_balance,
    reconstructed_bankroll_balance, total_user_wallet_balance, user_count,
    open_reserved_liability, legacy_ledger_last_sequence, snapshot, snapshot_hash, metadata)
  VALUES (now(), 'DRAFT', 'PRODUCTION', v_house_prod, v_house_prod, v_wallet_prod, v_users_prod,
    v_payable, v_legacy_seq, v_snap, md5(v_snap::text),
    jsonb_build_object('phase','3.1','supersedes', v_old_batch))
  RETURNING id INTO v_prod_batch;

  UPDATE public.accounting_cutover_batches SET status = 'APPROVED', approved_at = now()
   WHERE id = v_prod_batch;

  -- production opening lines
  SELECT jsonb_agg(x ORDER BY ord) INTO v_lines FROM (
    SELECT 0 AS ord, jsonb_build_object(
      'account_id', (SELECT id FROM public.accounting_accounts
                      WHERE account_code='LEGACY_OPENING_SOURCE_PRODUCTION' AND status='ACTIVE'),
      'debit', v_house_prod + v_wallet_prod + v_payable, 'credit', 0,
      'metadata', jsonb_build_object('role','opening_source')) AS x
    UNION ALL
    SELECT 1, jsonb_build_object(
      'account_id', (SELECT id FROM public.accounting_accounts
                      WHERE account_code='HOUSE_BANKROLL' AND environment='PRODUCTION' AND status='ACTIVE'),
      'debit', 0, 'credit', v_house_prod,
      'metadata', jsonb_build_object('role','house_bankroll'))
    WHERE v_house_prod > 0
    UNION ALL
    SELECT 2, jsonb_build_object(
      'account_id', (SELECT id FROM public.accounting_accounts
                      WHERE account_code='PAYOUTS_PAYABLE' AND environment='PRODUCTION' AND status='ACTIVE'),
      'debit', 0, 'credit', v_payable,
      'metadata', jsonb_build_object('role','reserved_payout_liability'))
    WHERE v_payable > 0
    UNION ALL
    SELECT 3, jsonb_build_object(
      'account_id', a.id, 'debit', 0, 'credit', w.balance,
      'metadata', jsonb_build_object('role','user_wallet','user_id', w.user_id))
    FROM public.wallets w
    JOIN public.accounting_accounts a
      ON a.user_id = w.user_id AND a.account_code='USER_WALLET' AND a.status='ACTIVE'
   WHERE w.is_simulation = false AND w.balance > 0
  ) s;

  v_res := public.accounting_post_journal(
    p_journal_type := 'OPENING_BALANCE',
    p_lines := v_lines,
    p_idempotency_key := 'phase31-opening-production-' || v_prod_batch::text,
    p_event_type := 'OPENING_BALANCE',
    p_cutover_batch_id := v_prod_batch,
    p_metadata := jsonb_build_object('phase','3.1','environment','PRODUCTION'),
    p_environment := 'PRODUCTION');

  UPDATE public.accounting_cutover_batches SET status = 'OPENING_POSTED' WHERE id = v_prod_batch;
  RAISE NOTICE 'production opening: %', v_res->>'journal_number';

  -- 4. SIMULATION cutover batch
  v_snap := jsonb_build_object(
    'environment','SIMULATION',
    'house_bankroll', v_house_sim,
    'user_wallets', v_wallet_sim,
    'user_count', v_users_sim,
    'reserved_payout_liability', 0,
    'supersedes_batch', v_old_batch);

  INSERT INTO public.accounting_cutover_batches (
    cutover_timestamp, status, environment, live_bankroll_balance,
    reconstructed_bankroll_balance, total_user_wallet_balance, user_count,
    open_reserved_liability, legacy_ledger_last_sequence, snapshot, snapshot_hash, metadata)
  VALUES (now(), 'DRAFT', 'SIMULATION', v_house_sim, v_house_sim, v_wallet_sim, v_users_sim,
    0, v_legacy_seq, v_snap, md5(v_snap::text),
    jsonb_build_object('phase','3.1','supersedes', v_old_batch))
  RETURNING id INTO v_sim_batch;

  UPDATE public.accounting_cutover_batches SET status = 'APPROVED', approved_at = now()
   WHERE id = v_sim_batch;

  SELECT jsonb_agg(x ORDER BY ord) INTO v_lines FROM (
    SELECT 0 AS ord, jsonb_build_object(
      'account_id', (SELECT id FROM public.accounting_accounts
                      WHERE account_code='LEGACY_OPENING_SOURCE_SIMULATION' AND status='ACTIVE'),
      'debit', v_house_sim + v_wallet_sim, 'credit', 0,
      'metadata', jsonb_build_object('role','opening_source')) AS x
    UNION ALL
    SELECT 1, jsonb_build_object(
      'account_id', (SELECT id FROM public.accounting_accounts
                      WHERE account_code='HOUSE_BANKROLL' AND environment='SIMULATION' AND status='ACTIVE'),
      'debit', 0, 'credit', v_house_sim,
      'metadata', jsonb_build_object('role','house_bankroll'))
    WHERE v_house_sim > 0
    UNION ALL
    SELECT 2, jsonb_build_object(
      'account_id', a.id, 'debit', 0, 'credit', w.balance,
      'metadata', jsonb_build_object('role','user_wallet','user_id', w.user_id))
    FROM public.wallets w
    JOIN public.accounting_accounts a
      ON a.user_id = w.user_id AND a.account_code='USER_WALLET' AND a.status='ACTIVE'
   WHERE w.is_simulation = true AND w.balance > 0
  ) s;

  v_res := public.accounting_post_journal(
    p_journal_type := 'OPENING_BALANCE',
    p_lines := v_lines,
    p_idempotency_key := 'phase31-opening-simulation-' || v_sim_batch::text,
    p_event_type := 'OPENING_BALANCE',
    p_cutover_batch_id := v_sim_batch,
    p_metadata := jsonb_build_object('phase','3.1','environment','SIMULATION'),
    p_environment := 'SIMULATION');

  UPDATE public.accounting_cutover_batches SET status = 'OPENING_POSTED' WHERE id = v_sim_batch;
  RAISE NOTICE 'simulation opening: %', v_res->>'journal_number';

  -- 5. supersede the original mixed batch (annotation only)
  UPDATE public.accounting_cutover_batches
     SET superseded_at = now(),
         superseded_by = v_prod_batch,
         supersede_reason = 'Phase 3.1: replaced by environment-separated PRODUCTION and SIMULATION cutover batches'
   WHERE id = v_old_batch AND superseded_at IS NULL;

  -- 6. close the old mixed opening source account
  UPDATE public.accounting_accounts
     SET status = 'CLOSED', closed_at = now()
   WHERE account_code = 'LEGACY_OPENING_SOURCE' AND status = 'ACTIVE';
END $mig$;

-- 7. classify the reserved payout liability in the reconciliation register
INSERT INTO public.accounting_reconciliation_items (
  scope, occurred_at, variance_amount, classification, is_variance_component,
  requires_balance_correction, requires_ledger_backfill, requires_reporting_fix,
  affected_user_id, evidence, narrative, resolution_status)
SELECT 'reserved_payout_liability', pr.created_at, pr.amount, 'UNLEDGERED_BUSINESS_EVENT',
       false, false, false, false, pr.user_id,
       jsonb_build_object('payout_request_id', pr.id, 'status', pr.status, 'amount', pr.amount),
       'Accepted but unsettled cash-out. The user wallet was already debited; the obligation is now recognised in PAYOUTS_PAYABLE (PRODUCTION) by the Phase 3.1 opening journal.',
       'RESOLVED'
FROM public.payout_requests pr
WHERE pr.status = 'proof_uploaded'
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_reconciliation_items ri
     WHERE ri.scope = 'reserved_payout_liability'
       AND ri.evidence->>'payout_request_id' = pr.id::text);