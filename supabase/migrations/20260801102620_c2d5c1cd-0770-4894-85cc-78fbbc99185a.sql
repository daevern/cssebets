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
      p_product := coalesce(v_tx.transaction_category, v_tx.reference_type::text, 'legacy'),
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
END
$fn$;

-- Replay every wallet transaction that previously failed to mirror
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.wallet_transactions
            WHERE accounting_sync_status = 'ERROR' ORDER BY created_at LOOP
    PERFORM public.accounting_bridge_wallet_transaction(r.id);
  END LOOP;
END
$do$;