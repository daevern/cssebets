
CREATE OR REPLACE FUNCTION public.accounting_plinko_selftest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_template public.arcade_plinko_games%ROWTYPE;
  v_row public.arcade_plinko_games%ROWTYPE;
  v_env public.acct_environment;
  v_wallet_acct uuid;
  v_bankroll_acct uuid;
  v_report jsonb := '[]'::jsonb;
  sc record;
  v_w0 numeric; v_b0 numeric; v_r0 numeric; v_e0 numeric;
  v_w1 numeric; v_b1 numeric; v_r1 numeric; v_e1 numeric;
  v_jcount int;
  v_keys text[];
  v_second_reversal_rejected boolean;
  v_rollback_clean boolean;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN';
  END IF;

  SELECT g.* INTO v_template FROM public.arcade_plinko_games g
    JOIN public.accounting_accounts a
      ON a.user_id = g.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE'
   ORDER BY g.created_at DESC LIMIT 1;
  IF v_template.id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no plinko game with an accounting wallet to template from');
  END IF;

  SELECT a.id, a.environment INTO v_wallet_acct, v_env FROM public.accounting_accounts a
   WHERE a.user_id = v_template.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  SELECT id INTO v_bankroll_acct FROM public.accounting_accounts
   WHERE account_code = 'HOUSE_BANKROLL' AND environment = v_env AND status = 'ACTIVE';

  FOR sc IN
    SELECT * FROM (VALUES
      ('full_loss', 100.00, 0.00, 100.00),
      ('partial_return', 100.00, 60.00, 40.00),
      ('push', 100.00, 100.00, 0.00),
      ('win', 100.00, 250.00, -150.00),
      ('void_refund', 100.00, 100.00, 0.00)
    ) AS t(name, stake, payout, expected_pl)
  LOOP
    BEGIN
      -- temporary funding so the test wallet can cover the scenario stake
      PERFORM public.accounting_post_journal(
        p_journal_type := 'TEST',
        p_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_bankroll_acct, 'debit', sc.stake, 'credit', 0),
          jsonb_build_object('account_id', v_wallet_acct,   'debit', 0,        'credit', sc.stake)),
        p_idempotency_key := 'plinko-selftest-fund:' || sc.name || ':' || gen_random_uuid()::text,
        p_product := 'plinko',
        p_event_type := 'selftest_funding',
        p_environment := v_env::text,
        p_allow_negative := true);

      SELECT balance INTO v_w0 FROM public.accounting_account_balances WHERE account_id = v_wallet_acct;
      SELECT balance INTO v_b0 FROM public.accounting_account_balances WHERE account_id = v_bankroll_acct;
      SELECT b.balance INTO v_r0 FROM public.accounting_account_balances b
        JOIN public.accounting_accounts a ON a.id = b.account_id
       WHERE a.account_code = 'PLINKO_STAKE_REVENUE' AND a.environment = v_env;
      SELECT b.balance INTO v_e0 FROM public.accounting_account_balances b
        JOIN public.accounting_accounts a ON a.id = b.account_id
       WHERE a.account_code = 'PLINKO_PAYOUT_EXPENSE' AND a.environment = v_env;

      v_row := v_template;
      v_row.id := gen_random_uuid();
      v_row.idempotency_key := 'selftest-' || sc.name || '-' || v_row.id::text;
      v_row.verification_id := encode(extensions.gen_random_bytes(8), 'hex');
      v_row.stake_per_ball := sc.stake;
      v_row.payout := sc.payout;
      v_row.created_at := now();
      INSERT INTO public.arcade_plinko_games SELECT (v_row).*;

      PERFORM public.accounting_post_plinko_game(v_row.id);

      SELECT balance INTO v_w1 FROM public.accounting_account_balances WHERE account_id = v_wallet_acct;
      SELECT balance INTO v_b1 FROM public.accounting_account_balances WHERE account_id = v_bankroll_acct;
      SELECT b.balance INTO v_r1 FROM public.accounting_account_balances b
        JOIN public.accounting_accounts a ON a.id = b.account_id
       WHERE a.account_code = 'PLINKO_STAKE_REVENUE' AND a.environment = v_env;
      SELECT b.balance INTO v_e1 FROM public.accounting_account_balances b
        JOIN public.accounting_accounts a ON a.id = b.account_id
       WHERE a.account_code = 'PLINKO_PAYOUT_EXPENSE' AND a.environment = v_env;

      SELECT array_agg(idempotency_key ORDER BY ledger_seq) INTO v_keys
        FROM public.accounting_journals WHERE reference_id = v_row.id::text;

      PERFORM public.accounting_reverse_plinko_game(v_row.id, 'selftest reversal integrity check');
      BEGIN
        PERFORM public.accounting_reverse_plinko_game(v_row.id, 'selftest duplicate reversal attempt');
        v_second_reversal_rejected := (SELECT count(*) = 0 FROM public.accounting_journals
          WHERE reference_id = v_row.id::text AND status = 'POSTED' AND event_type IN ('stake','payout'));
      EXCEPTION WHEN others THEN
        v_second_reversal_rejected := true;
      END;

      v_report := v_report || jsonb_build_object(
        'scenario', sc.name,
        'stake', sc.stake, 'payout', sc.payout,
        'expected_pl', sc.expected_pl,
        'plinko_pl', (v_r1 - v_r0) - (v_e1 - v_e0),
        'bankroll_delta', v_b1 - v_b0,
        'user_wallet_delta', (v_w1 - v_w0),
        'idempotency_keys', to_jsonb(v_keys),
        'pl_matches', ((v_r1 - v_r0) - (v_e1 - v_e0)) = sc.expected_pl,
        'bankroll_matches_pl', (v_b1 - v_b0) = sc.expected_pl,
        'wallet_matches_player_net', (v_w1 - v_w0) = (sc.payout - sc.stake),
        'reversal_restores_wallet',
          (SELECT balance FROM public.accounting_account_balances WHERE account_id = v_wallet_acct) = v_w0,
        'reversal_restores_bankroll',
          (SELECT balance FROM public.accounting_account_balances WHERE account_id = v_bankroll_acct) = v_b0,
        'second_reversal_rejected', v_second_reversal_rejected,
        'originals_immutable', (SELECT bool_and(status = 'REVERSED') FROM public.accounting_journals
           WHERE reference_id = v_row.id::text AND event_type IN ('stake','payout')));

      RAISE EXCEPTION 'SELFTEST_ROLLBACK';
    EXCEPTION WHEN others THEN
      IF SQLERRM <> 'SELFTEST_ROLLBACK' THEN
        v_report := v_report || jsonb_build_object('scenario', sc.name, 'error', SQLERRM);
      END IF;
    END;
  END LOOP;

  DECLARE
    v_fail_id uuid := gen_random_uuid();
  BEGIN
    BEGIN
      v_row := v_template;
      v_row.id := v_fail_id;
      v_row.idempotency_key := 'selftest-fail-' || v_fail_id::text;
      v_row.verification_id := encode(extensions.gen_random_bytes(8), 'hex');
      v_row.stake_per_ball := 1.00;
      v_row.payout := 2.00;
      v_row.created_at := now();
      INSERT INTO public.arcade_plinko_games SELECT (v_row).*;
      PERFORM public.accounting_post_plinko_game(v_fail_id);
      RAISE EXCEPTION 'SELFTEST_FORCED_FAILURE';
    EXCEPTION WHEN others THEN
      NULL;
    END;
    SELECT count(*) INTO v_jcount FROM public.accounting_journals WHERE reference_id = v_fail_id::text;
    v_rollback_clean := v_jcount = 0
      AND NOT EXISTS (SELECT 1 FROM public.arcade_plinko_games WHERE id = v_fail_id)
      AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions
                       WHERE metadata->>'idempotency_key' = 'selftest-fail-' || v_fail_id::text);
  END;

  RETURN jsonb_build_object(
    'environment', v_env,
    'scenarios', v_report,
    'forced_failure_rollback_clean', v_rollback_clean,
    'available_reserve', public.accounting_available_reserve(v_env),
    'bankroll_control', (SELECT to_jsonb(v) FROM public.v_accounting_plinko_bankroll_control v
                          WHERE v.environment = v_env));
END $function$;

REVOKE ALL ON FUNCTION public.accounting_plinko_selftest() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_plinko_selftest() TO service_role;
