
CREATE OR REPLACE FUNCTION public.accounting_arcade_selftest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid; v_env public.acct_environment := 'SIMULATION';
  v_bank_before numeric(18,2); v_bank_after numeric(18,2);
  v_res jsonb; v_out jsonb := '[]'::jsonb;
  v_ref uuid; v_prod text; v_stake numeric; v_payout numeric;
  v_expect numeric; v_delta numeric; v_ok boolean; v_all_ok boolean := true;
  v_bank_acct uuid; v_rev numeric; v_exp numeric;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN';
  END IF;

  SELECT a.user_id INTO v_user FROM public.accounting_accounts a
   WHERE a.account_code='USER_WALLET' AND a.environment=v_env AND a.status='ACTIVE' LIMIT 1;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason','no simulation wallet account');
  END IF;

  SELECT id INTO v_bank_acct FROM public.accounting_accounts
   WHERE account_code='HOUSE_BANKROLL' AND environment=v_env AND status='ACTIVE';

  FOREACH v_prod IN ARRAY ARRAY['treasure','roulette','blackjack'] LOOP
    FOR v_stake, v_payout IN SELECT * FROM (VALUES (100::numeric, 0::numeric), (100,250), (100,100), (100,100)) t(a,b) LOOP
      v_ref := gen_random_uuid();
      SELECT balance INTO v_bank_before FROM public.accounting_account_balances WHERE account_id = v_bank_acct;
      v_res := public.accounting_post_arcade_settlement(v_prod, 'selftest', v_ref, v_user,
        v_stake, v_payout, now(), jsonb_build_object('selftest', true), NULL, NULL);
      SELECT balance INTO v_bank_after FROM public.accounting_account_balances WHERE account_id = v_bank_acct;
      v_expect := v_stake - v_payout;
      v_delta := v_bank_after - v_bank_before;
      v_ok := (v_delta = v_expect);
      v_all_ok := v_all_ok AND v_ok;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'product', v_prod, 'stake', v_stake, 'payout', v_payout,
        'expected_bankroll_delta', v_expect, 'actual_bankroll_delta', v_delta, 'ok', v_ok));

      -- idempotency: replay must not move anything
      SELECT balance INTO v_bank_before FROM public.accounting_account_balances WHERE account_id = v_bank_acct;
      PERFORM public.accounting_post_arcade_settlement(v_prod, 'selftest', v_ref, v_user,
        v_stake, v_payout, now(), jsonb_build_object('selftest', true), NULL, NULL);
      SELECT balance INTO v_bank_after FROM public.accounting_account_balances WHERE account_id = v_bank_acct;
      v_all_ok := v_all_ok AND (v_bank_after = v_bank_before);
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'product', v_prod, 'replay_moved', v_bank_after - v_bank_before, 'ok', v_bank_after = v_bank_before));

      -- reversal restores the bankroll
      SELECT balance INTO v_bank_before FROM public.accounting_account_balances WHERE account_id = v_bank_acct;
      PERFORM public.accounting_reverse_arcade_settlement(v_prod, v_ref, 'selftest reversal check');
      SELECT balance INTO v_bank_after FROM public.accounting_account_balances WHERE account_id = v_bank_acct;
      v_ok := (v_bank_after - v_bank_before) = -v_expect;
      v_all_ok := v_all_ok AND v_ok;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'product', v_prod, 'reversal_delta', v_bank_after - v_bank_before, 'ok', v_ok));
    END LOOP;
  END LOOP;

  -- P/L view must exclude the *_PL_TO_RESERVE clearing accounts
  SELECT revenue, expense INTO v_rev, v_exp FROM public.v_accounting_platform_pl WHERE environment = v_env;

  RAISE EXCEPTION 'ACCOUNTING_SELFTEST_ROLLBACK: %', jsonb_build_object(
    'all_ok', v_all_ok, 'cases', v_out, 'sim_revenue', v_rev, 'sim_expense', v_exp)::text;
END $$;

REVOKE ALL ON FUNCTION public.accounting_arcade_selftest() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_arcade_selftest() TO service_role;
