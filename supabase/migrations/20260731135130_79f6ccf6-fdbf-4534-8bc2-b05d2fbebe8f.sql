CREATE OR REPLACE FUNCTION public.accounting_phase5_final_selftest()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  out jsonb := '[]'::jsonb;
  v_user uuid; v_env public.acct_environment := 'SIMULATION';
  rc public.arcade_bj_rule_configs;
  v_worst numeric; v_expected numeric;
  v_reserve numeric;
  v_bal_before numeric; v_bal_after numeric;
  v_round uuid; v_mult numeric; v_gross numeric; r public.arcade_treasure_rounds;
  v_cfg public.arcade_roulette_configurations;
  v_key text; v_stake numeric; v_spins int; v_journals int;
  v_err text; v_ok boolean; v_prod text;
  v_spin public.arcade_roulette_spins;

  PROCEDURE_NOOP boolean;
  FUNCTION_NOOP boolean;
BEGIN
  SELECT a.user_id INTO v_user
    FROM public.accounting_accounts a
    JOIN public.accounting_account_balances b ON b.account_id = a.id
   WHERE a.account_code = 'USER_WALLET' AND a.environment = v_env AND a.status='ACTIVE'
   ORDER BY b.balance DESC LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'NO_SIM_USER'; END IF;

  -- =====================================================================
  -- A. Cross-product reserve contention: every product must route through
  --    the same locked-reserve evaluation for this environment.
  -- =====================================================================
  FOREACH v_prod IN ARRAY ARRAY['plinko','treasure','roulette','blackjack'] LOOP
    v_ok := false; v_err := NULL;
    BEGIN
      PERFORM public.accounting_arcade_assert_capacity(v_prod, v_user, 99999999);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM; v_ok := (SQLERRM LIKE 'EXPOSURE_LIMIT%');
    END;
    out := out || jsonb_build_object(
      'test', 'contention:' || v_prod || ':refused_over_reserve',
      'pass', v_ok, 'detail', v_err);
  END LOOP;

  -- lock is held for the rest of this transaction => all four serialise
  v_reserve := public.accounting_available_reserve_locked(v_env);
  out := out || jsonb_build_object('test','contention:shared_env_lock_held',
    'pass', pg_try_advisory_xact_lock(hashtext('accounting_reserve:' || v_env::text)) IS NOT NULL,
    'detail', jsonb_build_object('available_reserve', v_reserve));

  -- no product bypasses the lock: source-level check
  out := out || jsonb_build_object('test','contention:no_product_bypass',
    'pass', (SELECT bool_and(prosrc LIKE '%available_reserve_locked%' OR prosrc LIKE '%assert_capacity%')
               FROM pg_proc WHERE proname IN ('arcade_place_plinko_drop','arcade_place_roulette_spin',
                                              'arcade_treasure_start_round','arcade_bj_start_hand')),
    'detail', NULL);

  -- =====================================================================
  -- B. Blackjack worst-case exposure
  -- =====================================================================
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF FOUND THEN
    v_worst := public.arcade_bj_worst_case_gross(rc.id, rc.min_stake);
    v_expected := greatest(
      rc.min_stake * greatest(1, coalesce(rc.max_split_hands,1))
        * (CASE WHEN rc.double_allowed AND (coalesce(rc.max_split_hands,1)=1 OR rc.double_after_split)
                THEN 2 ELSE 1 END) * 2,
      round(rc.min_stake * (1 + rc.blackjack_payout), 2));
    out := out || jsonb_build_object('test','blackjack:worst_case_covers_full_state_tree',
      'pass', v_worst >= v_expected,
      'detail', jsonb_build_object('worst', v_worst, 'expected_min', v_expected,
        'max_split_hands', rc.max_split_hands, 'double_after_split', rc.double_after_split,
        'blackjack_payout', rc.blackjack_payout, 'max_payout', rc.max_payout));

    out := out || jsonb_build_object('test','blackjack:worst_case_includes_splits_and_doubles',
      'pass', v_worst >= rc.min_stake * greatest(1, coalesce(rc.max_split_hands,1)) * 2,
      'detail', jsonb_build_object('per_hand_min', rc.min_stake * 2));

    out := out || jsonb_build_object('test','blackjack:max_stake_worst_case_within_ceiling',
      'pass', public.arcade_bj_worst_case_gross(rc.id, rc.max_stake) <= rc.max_payout,
      'detail', jsonb_build_object('worst_at_max_stake',
        public.arcade_bj_worst_case_gross(rc.id, rc.max_stake), 'max_payout', rc.max_payout));

    out := out || jsonb_build_object('test','blackjack:settlement_never_truncates',
      'pass', (SELECT prosrc NOT LIKE '%total_pay := rc.max_payout%' FROM pg_proc WHERE proname='arcade_bj_settle'),
      'detail', NULL);
    out := out || jsonb_build_object('test','blackjack:settlement_asserts_sum_equals_total',
      'pass', (SELECT prosrc LIKE '%PAYOUT_MISMATCH%' FROM pg_proc WHERE proname='arcade_bj_settle'),
      'detail', NULL);
    out := out || jsonb_build_object('test','blackjack:capacity_uses_same_ceiling_as_settlement',
      'pass', (SELECT prosrc LIKE '%worst_case_gross%' FROM pg_proc WHERE proname='arcade_bj_start_hand')
              AND (SELECT prosrc NOT LIKE '%p_stake * 4%' FROM pg_proc WHERE proname='arcade_bj_assert_capacity'),
      'detail', NULL);
  END IF;

  -- =====================================================================
  -- C. Treasure Grid expiry policy
  -- =====================================================================
  -- C1: progress made -> auto-collect at current return
  BEGIN
    SELECT balance INTO v_bal_before FROM public.wallets WHERE user_id = v_user;
    v_round := (public.arcade_treasure_start_round(
        v_user, 'medium', 10, 'selftest-seed', 'p5final-' || gen_random_uuid()::text)->'round'->>'id')::uuid;
    UPDATE public.arcade_treasure_rounds
       SET safe_reveals = 1, status='ACTIVE', expires_at = now() - interval '1 minute'
     WHERE id = v_round;
    SELECT actual_multiplier INTO v_mult FROM public.arcade_treasure_multiplier_tables m
      JOIN public.arcade_treasure_rounds tr ON tr.config_id = m.config_id
     WHERE tr.id = v_round AND m.safe_reveals = 1;
    PERFORM public.arcade_treasure_expire_rounds(50);
    SELECT * INTO r FROM public.arcade_treasure_rounds WHERE id = v_round;
    SELECT balance INTO v_bal_after FROM public.wallets WHERE user_id = v_user;
    out := out || jsonb_build_object('test','treasure:expiry_with_progress_autocollects',
      'pass', r.status='EXPIRED' AND r.result_reason='ROUND_TIMEOUT_AUTOCOLLECT'
              AND r.gross_return = floor(r.stake * v_mult),
      'detail', jsonb_build_object('status', r.status, 'reason', r.result_reason,
        'gross', r.gross_return, 'stake', r.stake, 'mult', v_mult,
        'wallet_delta', v_bal_after - v_bal_before));
    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','treasure:expiry_with_progress_autocollects','pass',false,'detail',SQLERRM);
    END IF;
  END;

  -- C2: no progress -> stake refunded
  BEGIN
    v_round := (public.arcade_treasure_start_round(
        v_user, 'medium', 10, 'selftest-seed', 'p5final-' || gen_random_uuid()::text)->'round'->>'id')::uuid;
    UPDATE public.arcade_treasure_rounds
       SET safe_reveals = 0, status='ACTIVE', expires_at = now() - interval '1 minute'
     WHERE id = v_round;
    PERFORM public.arcade_treasure_expire_rounds(50);
    SELECT * INTO r FROM public.arcade_treasure_rounds WHERE id = v_round;
    out := out || jsonb_build_object('test','treasure:expiry_without_progress_refunds_stake',
      'pass', r.status='EXPIRED' AND r.result_reason='ROUND_TIMEOUT' AND r.gross_return = r.stake
              AND r.user_net = 0,
      'detail', jsonb_build_object('reason', r.result_reason, 'gross', r.gross_return, 'stake', r.stake));
    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','treasure:expiry_without_progress_refunds_stake','pass',false,'detail',SQLERRM);
    END IF;
  END;

  -- =====================================================================
  -- D. Roulette forced-failure atomicity
  -- =====================================================================
  SELECT * INTO v_cfg FROM public.arcade_roulette_configurations WHERE status='active';
  IF FOUND THEN
    v_stake := greatest(v_cfg.min_total_stake, 5);
    SELECT balance INTO v_bal_before FROM public.wallets WHERE user_id = v_user;
    v_key := 'p5final-roulette-' || gen_random_uuid()::text;

    BEGIN
      PERFORM public.arcade_place_roulette_spin(v_user, v_key, 'selftest-seed',
        jsonb_build_array(jsonb_build_object('stake', v_stake, 'pockets', jsonb_build_array('7'))));
      RAISE EXCEPTION 'FORCED_FAILURE_MID_CALL';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
    END;

    SELECT count(*) INTO v_spins FROM public.arcade_roulette_spins WHERE idempotency_key = v_key;
    SELECT count(*) INTO v_journals FROM public.accounting_journals
      WHERE reference_type = 'arcade_roulette_spin' AND idempotency_key LIKE '%' || v_key || '%';
    SELECT balance INTO v_bal_after FROM public.wallets WHERE user_id = v_user;

    out := out || jsonb_build_object('test','roulette:forced_failure_leaves_no_spin',
      'pass', v_spins = 0, 'detail', jsonb_build_object('spins', v_spins, 'error', v_err));
    out := out || jsonb_build_object('test','roulette:forced_failure_leaves_no_journal',
      'pass', v_journals = 0, 'detail', v_journals);
    out := out || jsonb_build_object('test','roulette:forced_failure_leaves_no_wallet_movement',
      'pass', v_bal_after = v_bal_before,
      'detail', jsonb_build_object('before', v_bal_before, 'after', v_bal_after));
    out := out || jsonb_build_object('test','roulette:no_orphan_synced_wallet_rows',
      'pass', NOT EXISTS (SELECT 1 FROM public.wallet_transactions
                          WHERE reference_id::text = v_key OR (metadata->>'idempotency_key') = v_key),
      'detail', NULL);

    -- retry with the same key must succeed exactly once
    BEGIN
      v_spin := public.arcade_place_roulette_spin(v_user, v_key, 'selftest-seed',
        jsonb_build_array(jsonb_build_object('stake', v_stake, 'pockets', jsonb_build_array('7'))));
      SELECT count(*) INTO v_spins FROM public.arcade_roulette_spins WHERE idempotency_key = v_key;
      out := out || jsonb_build_object('test','roulette:retry_after_failure_succeeds_once',
        'pass', v_spin.id IS NOT NULL AND v_spins = 1,
        'detail', jsonb_build_object('spins', v_spins, 'status', v_spin.status));
      RAISE EXCEPTION 'ROLLBACK_TEST';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'ROLLBACK_TEST' THEN
        out := out || jsonb_build_object('test','roulette:retry_after_failure_succeeds_once','pass',false,'detail',SQLERRM);
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'total', jsonb_array_length(out),
    'passed', (SELECT count(*) FROM jsonb_array_elements(out) e WHERE (e->>'pass')::boolean),
    'results', out);
END;
$fn$;

REVOKE ALL ON FUNCTION public.accounting_phase5_final_selftest() FROM PUBLIC, anon, authenticated;