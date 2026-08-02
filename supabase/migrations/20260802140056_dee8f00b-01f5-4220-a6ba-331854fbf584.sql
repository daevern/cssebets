DO $do$
DECLARE
  r record;
  v_wallet uuid; v_clearing uuid; v_delta numeric(18,2); v_lines jsonb;
BEGIN
  FOR r IN
    SELECT w.* FROM public.wallet_transactions w
     WHERE w.id IN ('1dcca4f2-cb2b-468b-84fa-063cd752992b',
                    '2c687788-0d35-481e-8a8a-dc1c0586c7c2',
                    '9afc84e0-dd80-4d81-8af2-bc4a72160e47',
                    '32ca8809-129f-405c-98b1-651875173d87',
                    '4e1a7e7b-f469-4530-858f-d909f1cc2327',
                    'd1ab0412-2d86-46d7-acd4-b073726f1f0c',
                    '729b50d2-6944-482f-972e-55c08a6158df')
  LOOP
    SELECT a.id INTO v_wallet FROM public.accounting_accounts a
     WHERE a.user_id = r.user_id AND a.account_code = 'USER_WALLET' AND a.status='ACTIVE';
    SELECT a.id INTO v_clearing FROM public.accounting_accounts a
     WHERE a.account_code = 'LEGACY_PRODUCT_CLEARING' AND a.environment = 'PRODUCTION' AND a.status='ACTIVE';
    CONTINUE WHEN v_wallet IS NULL OR v_clearing IS NULL;

    v_delta := round(coalesce(r.balance_after,0) - coalesce(r.balance_before,0), 2);
    CONTINUE WHEN v_delta = 0;

    IF v_delta > 0 THEN
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_clearing, 'debit', v_delta, 'credit', 0),
        jsonb_build_object('account_id', v_wallet,   'debit', 0, 'credit', v_delta));
    ELSE
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_wallet,   'debit', -v_delta, 'credit', 0),
        jsonb_build_object('account_id', v_clearing, 'debit', 0, 'credit', -v_delta));
    END IF;

    PERFORM public.accounting_post_journal(
      p_journal_type := 'LEGACY_BACKFILL_REFERENCE',
      p_lines := v_lines,
      p_idempotency_key := 'legacy-wallet-tx-repost:' || r.id::text,
      p_product := coalesce(r.transaction_category, 'legacy'),
      p_reference_type := r.reference_type::text,
      p_reference_id := r.reference_id::text,
      p_event_type := r.type::text,
      p_effective_at := r.created_at,
      p_metadata := jsonb_build_object('source','legacy_wallet_transaction_repost',
                                       'wallet_transaction_id', r.id,
                                       'reason','pre-native arcade play, no product journal'),
      p_allow_negative := true,
      p_environment := 'PRODUCTION');

    UPDATE public.wallet_transactions
       SET accounting_sync_status = 'SYNCED', accounting_sync_error = NULL, accounting_synced_at = now()
     WHERE id = r.id;
  END LOOP;
END
$do$;