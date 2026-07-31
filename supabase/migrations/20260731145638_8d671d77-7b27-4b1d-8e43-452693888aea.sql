CREATE OR REPLACE FUNCTION public.accounting_phase10_product_tests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  out jsonb := '[]'::jsonb;
  v_env public.acct_environment := 'SIMULATION';
  v_user uuid; v_key text; v_err text;
  v_bal0 numeric; v_bal1 numeric;
  v_game public.arcade_plinko_games; v_spin public.arcade_roulette_spins;
  v_round public.arcade_treasure_rounds; v_hand uuid; v_ph uuid;
  v_res public.accounting_liability_reservations;
  v_match uuid; v_win uuid; v_loss uuid; v_settled int; v_status text;
  v_stake numeric; v_payout numeric; v_j int; v_collect jsonb;
BEGIN
  SELECT a.user_id INTO v_user
    FROM public.accounting_accounts a
    JOIN public.accounting_account_balances b ON b.account_id = a.id
   WHERE a.account_code='USER_WALLET' AND a.environment=v_env AND a.status='ACTIVE'
   ORDER BY b.balance DESC LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'NO_SIM_USER'; END IF;

  -- ---------------------------------------------------------- plinko ------
  BEGIN
    SELECT balance INTO v_bal0 FROM public.wallets WHERE user_id = v_user;
    v_key := 'p10-plinko-' || gen_random_uuid()::text;
    v_game := public.arcade_place_plinko_drop(v_user, 12, 'medium', v_key, 'p10-seed', 10);
    SELECT balance INTO v_bal1 FROM public.wallets WHERE user_id = v_user;
    v_stake := v_game.stake_per_ball; v_payout := coalesce(v_game.payout, 0);

    out := out || jsonb_build_object('test','plinko:wallet_delta_equals_payout_minus_stake',
      'pass', round(v_bal1 - v_bal0,2) = round(v_payout - v_stake,2),
      'detail', jsonb_build_object('stake', v_stake, 'payout', v_payout, 'delta', v_bal1 - v_bal0));

    SELECT count(*) INTO v_j FROM public.accounting_journals
      WHERE reference_type='arcade_plinko_game' AND reference_id = v_game.id::text AND status='POSTED';
    out := out || jsonb_build_object('test','plinko:placement_and_settlement_journals',
      'pass', v_j >= 2, 'detail', jsonb_build_object('journals', v_j));

    SELECT count(*) INTO v_j FROM (
      SELECT j.id FROM public.accounting_journals j
        JOIN public.accounting_journal_lines l ON l.journal_id=j.id
       WHERE j.reference_id = v_game.id::text
       GROUP BY j.id HAVING round(sum(l.debit),2) <> round(sum(l.credit),2)) s;
    out := out || jsonb_build_object('test','plinko:journals_balanced','pass', v_j = 0,
      'detail', jsonb_build_object('unbalanced', v_j));

    out := out || jsonb_build_object('test','plinko:rounding_credited_amount_is_exact',
      'pass', round(v_payout,2) = v_payout,
      'detail', jsonb_build_object('payout', v_payout, 'multiplier', v_game.multiplier));

    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_plinko_game' AND reference_id = v_game.id;
    out := out || jsonb_build_object('test','plinko:no_active_reservation_after_settlement',
      'pass', v_res.id IS NULL OR (v_res.status <> 'ACTIVE' AND v_res.reserved_amount = 0),
      'detail', jsonb_build_object('status', v_res.status, 'held', v_res.reserved_amount));

    v_game := public.arcade_place_plinko_drop(v_user, 12, 'medium', v_key, 'p10-seed', 10);
    SELECT balance INTO v_bal1 FROM public.wallets WHERE user_id = v_user;
    out := out || jsonb_build_object('test','plinko:idempotent_replay_no_double_charge',
      'pass', round(v_bal1 - v_bal0,2) = round(v_payout - v_stake,2),
      'detail', jsonb_build_object('balance_after_replay', v_bal1));

    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','plinko:lifecycle','pass',false,'detail',v_err);
    END IF;
  END;

  -- --------------------------------------------------------- roulette -----
  BEGIN
    SELECT balance INTO v_bal0 FROM public.wallets WHERE user_id = v_user;
    v_key := 'p10-roulette-' || gen_random_uuid()::text;
    v_spin := public.arcade_place_roulette_spin(v_user, v_key, 'p10-seed',
      jsonb_build_array(jsonb_build_object(
        'bet_type','split', 'label','1-2', 'pockets', jsonb_build_array('1','2'), 'stake', 10)));
    SELECT balance INTO v_bal1 FROM public.wallets WHERE user_id = v_user;
    v_stake := v_spin.total_stake; v_payout := coalesce(v_spin.total_return,0);
    out := out || jsonb_build_object('test','roulette:wallet_delta_equals_payout_minus_stake',
      'pass', round(v_bal1 - v_bal0,2) = round(v_payout - v_stake,2),
      'detail', jsonb_build_object('stake', v_stake, 'payout', v_payout, 'delta', v_bal1 - v_bal0));

    out := out || jsonb_build_object('test','roulette:house_net_equals_stake_minus_payout',
      'pass', round(coalesce(v_spin.house_net,0),2) = round(v_stake - v_payout,2),
      'detail', jsonb_build_object('house_net', v_spin.house_net));

    SELECT count(*) INTO v_j FROM (
      SELECT j.id FROM public.accounting_journals j
        JOIN public.accounting_journal_lines l ON l.journal_id=j.id
       WHERE j.reference_id = v_spin.id::text AND j.status='POSTED'
       GROUP BY j.id HAVING round(sum(l.debit),2) <> round(sum(l.credit),2)) s;
    out := out || jsonb_build_object('test','roulette:journals_balanced','pass', v_j = 0,
      'detail', jsonb_build_object('unbalanced', v_j));

    SELECT count(*) INTO v_j FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_roulette_spin' AND reference_id = v_spin.id AND status='ACTIVE';
    out := out || jsonb_build_object('test','roulette:atomic_single_shot_no_active_hold',
      'pass', v_j = 0, 'detail', jsonb_build_object('active_holds', v_j));

    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','roulette:lifecycle','pass',false,'detail',v_err);
    END IF;
  END;

  -- ----------------------------------------------------- treasure grid ----
  BEGIN
    SELECT balance INTO v_bal0 FROM public.wallets WHERE user_id = v_user;
    v_key := 'p10-treasure-' || gen_random_uuid()::text;
    v_round := public.arcade_treasure_start_round(v_user, 'easy', 10, 'p10-seed', v_key);
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_treasure_round' AND reference_id = v_round.id;
    out := out || jsonb_build_object('test','treasure:reservation_active_while_open',
      'pass', v_res.status='ACTIVE'
              AND round(v_res.reserved_amount,2) = round(greatest(v_res.max_gross_payout - v_res.stake_collected,0),2),
      'detail', jsonb_build_object('reserved', v_res.reserved_amount, 'gross', v_res.max_gross_payout));

    SELECT balance INTO v_bal1 FROM public.wallets WHERE user_id = v_user;
    out := out || jsonb_build_object('test','treasure:stake_debited_at_acceptance',
      'pass', round(v_bal0 - v_bal1,2) = round(v_round.stake,2),
      'detail', jsonb_build_object('stake', v_round.stake, 'debited', v_bal0 - v_bal1));

    BEGIN
      PERFORM public.arcade_treasure_reveal_tile(v_user, v_round.id, 0,
        (SELECT state_version FROM public.arcade_treasure_rounds WHERE id = v_round.id),
        'p10-reveal-' || gen_random_uuid()::text);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    SELECT status, state_version INTO v_status, v_j
      FROM public.arcade_treasure_rounds WHERE id = v_round.id;
    IF v_status IN ('ACTIVE','COLLECTING') THEN
      v_collect := public.arcade_treasure_collect(v_user, v_round.id, v_j,
                     'p10-collect-' || gen_random_uuid()::text);
    END IF;
    SELECT status INTO v_status FROM public.arcade_treasure_rounds WHERE id = v_round.id;
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_treasure_round' AND reference_id = v_round.id;
    out := out || jsonb_build_object('test','treasure:reservation_released_on_terminal',
      'pass', v_res.status='RELEASED' AND v_res.reserved_amount = 0 AND v_res.released_at IS NOT NULL,
      'detail', jsonb_build_object('round_status', v_status, 'res_status', v_res.status));

    SELECT count(*) INTO v_j FROM public.accounting_journals
      WHERE reference_type='arcade_treasure_round' AND reference_id = v_round.id::text
        AND journal_type='PAYOUT_SETTLED' AND status='POSTED';
    out := out || jsonb_build_object('test','treasure:settlement_journal_posted_once',
      'pass', v_j = 1, 'detail', jsonb_build_object('settlement_journals', v_j));

    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','treasure:lifecycle','pass',false,'detail',v_err);
    END IF;
  END;

  -- ------------------------------------------------------- blackjack ------
  BEGIN
    SELECT balance INTO v_bal0 FROM public.wallets WHERE user_id = v_user;
    v_key := 'p10-bj-' || gen_random_uuid()::text;
    v_hand := public.arcade_bj_start_hand(v_user, 5, 'p10-seed', v_key);
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_bj_hand' AND reference_id = v_hand;
    out := out || jsonb_build_object('test','blackjack:worst_case_reserved_at_acceptance',
      'pass', v_res.status='ACTIVE'
              AND v_res.max_gross_payout = public.arcade_bj_worst_case_gross(
                    (SELECT rule_config_id FROM public.arcade_bj_hands WHERE id = v_hand), 5),
      'detail', jsonb_build_object('gross', v_res.max_gross_payout, 'net', v_res.max_net_liability));

    SELECT id INTO v_ph FROM public.arcade_bj_player_hands
     WHERE hand_id = v_hand ORDER BY created_at LIMIT 1;
    SELECT status INTO v_status FROM public.arcade_bj_hands WHERE id = v_hand;
    IF v_status = 'PLAYER_TURN' AND v_ph IS NOT NULL THEN
      PERFORM public.arcade_bj_stand(v_user, v_hand, v_ph,
        (SELECT state_version FROM public.arcade_bj_hands WHERE id = v_hand),
        'p10-stand-' || gen_random_uuid()::text);
    END IF;
    SELECT status INTO v_status FROM public.arcade_bj_hands WHERE id = v_hand;
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_bj_hand' AND reference_id = v_hand;
    out := out || jsonb_build_object('test','blackjack:reservation_released_on_completion',
      'pass', v_status <> 'COMPLETED' OR (v_res.status='RELEASED' AND v_res.reserved_amount = 0),
      'detail', jsonb_build_object('hand_status', v_status, 'res_status', v_res.status));

    SELECT count(*) INTO v_j FROM public.arcade_bj_hands h
     WHERE h.id = v_hand AND h.status='COMPLETED'
       AND round(coalesce(h.total_payout,0),2) <> round(coalesce(
             (SELECT sum(coalesce(p.payout,0)) FROM public.arcade_bj_player_hands p
               WHERE p.hand_id = h.id),0),2);
    out := out || jsonb_build_object('test','blackjack:hand_payout_equals_sum_of_player_hands',
      'pass', v_j = 0, 'detail', jsonb_build_object('mismatched', v_j, 'status', v_status));

    SELECT balance INTO v_bal1 FROM public.wallets WHERE user_id = v_user;
    SELECT coalesce(total_payout,0), coalesce(total_stake,0) INTO v_payout, v_stake
      FROM public.arcade_bj_hands WHERE id = v_hand;
    out := out || jsonb_build_object('test','blackjack:wallet_delta_equals_payout_minus_stake',
      'pass', v_status <> 'COMPLETED' OR round(v_bal1 - v_bal0,2) = round(v_payout - v_stake,2),
      'detail', jsonb_build_object('stake', v_stake, 'payout', v_payout, 'delta', v_bal1 - v_bal0));

    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','blackjack:lifecycle','pass',false,'detail',v_err);
    END IF;
  END;

  -- --------------------------------------- football win / loss / duplicate -
  BEGIN
    v_match := gen_random_uuid();
    SELECT balance INTO v_bal0 FROM public.wallets WHERE user_id = v_user;
    INSERT INTO public.matches(id, home_team, away_team, kickoff_at, status, is_simulation)
    VALUES (v_match, 'P10TEST_HOME', 'P10TEST_AWAY', now() - interval '3 hours', 'live', true);
    INSERT INTO public.predictions(id, user_id, match_id, market, outcome, virtual_stake,
                                   reference_odds, potential_return, status)
    VALUES (gen_random_uuid(), v_user, v_match, 'result', 'HOME', 10, 2.0, 20, 'pending')
    RETURNING id INTO v_win;
    INSERT INTO public.predictions(id, user_id, match_id, market, outcome, virtual_stake,
                                   reference_odds, potential_return, status)
    VALUES (gen_random_uuid(), v_user, v_match, 'result', 'AWAY', 10, 3.0, 30, 'pending')
    RETURNING id INTO v_loss;

    v_settled := public.settle_match_atomic(v_match, 2, 0);
    out := out || jsonb_build_object('test','football:settles_both_positions_once',
      'pass', v_settled = 2, 'detail', jsonb_build_object('settled', v_settled));

    SELECT count(*) INTO v_j FROM public.wallet_transactions WHERE reference_id = v_win;
    SELECT balance INTO v_bal1 FROM public.wallets WHERE user_id = v_user;
    out := out || jsonb_build_object('test','football:winner_credited_exactly_once',
      'pass', v_j = 1 AND round(v_bal1 - v_bal0,2) = 20,
      'detail', jsonb_build_object('credits', v_j, 'wallet_delta', v_bal1 - v_bal0));

    SELECT status INTO v_status FROM public.predictions WHERE id = v_loss;
    SELECT count(*) INTO v_j FROM public.wallet_transactions WHERE reference_id = v_loss;
    out := out || jsonb_build_object('test','football:loser_settles_without_payout',
      'pass', v_status = 'lost' AND v_j = 0,
      'detail', jsonb_build_object('status', v_status, 'wallet_rows', v_j));

    v_settled := public.settle_match_atomic(v_match, 2, 0);
    SELECT count(*) INTO v_j FROM public.wallet_transactions WHERE reference_id = v_win;
    out := out || jsonb_build_object('test','football:duplicate_settlement_is_a_no_op',
      'pass', v_settled = 0 AND v_j = 1,
      'detail', jsonb_build_object('second_run_settled', v_settled, 'credits', v_j));

    SELECT count(*) INTO v_j FROM public.settlement_journal WHERE reference_id = v_win;
    out := out || jsonb_build_object('test','football:one_settlement_journal_per_position',
      'pass', v_j = 1, 'detail', jsonb_build_object('journal_rows', v_j));

    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','football:win_loss_duplicate','pass',false,'detail',v_err);
    END IF;
  END;

  -- ------------------------------------------------------- football void --
  BEGIN
    v_match := gen_random_uuid();
    SELECT balance INTO v_bal0 FROM public.wallets WHERE user_id = v_user;
    INSERT INTO public.matches(id, home_team, away_team, kickoff_at, status, is_simulation)
    VALUES (v_match, 'P10TEST_VOID_H', 'P10TEST_VOID_A', now() - interval '3 hours', 'live', true);
    INSERT INTO public.predictions(id, user_id, match_id, market, outcome, virtual_stake,
                                   reference_odds, potential_return, status)
    VALUES (gen_random_uuid(), v_user, v_match, 'result', 'HOME', 10, 2.0, 20, 'pending')
    RETURNING id INTO v_win;
    -- mirror real placement: the stake is held in the match pool until settlement
    PERFORM public.pool_apply_change(v_match, 'HOME', 10, 'stake_held',
                                     v_win, v_user, 'P10 test stake');

    v_settled := public.void_match_atomic(v_match);
    SELECT balance INTO v_bal1 FROM public.wallets WHERE user_id = v_user;
    SELECT status INTO v_status FROM public.predictions WHERE id = v_win;
    out := out || jsonb_build_object('test','football:void_refunds_stake_once',
      'pass', v_status = 'void' AND round(v_bal1 - v_bal0,2) = 10,
      'detail', jsonb_build_object('status', v_status, 'refund', v_bal1 - v_bal0));

    v_settled := public.void_match_atomic(v_match);
    SELECT balance INTO v_bal1 FROM public.wallets WHERE user_id = v_user;
    out := out || jsonb_build_object('test','football:repeat_void_is_a_no_op',
      'pass', round(v_bal1 - v_bal0,2) = 10,
      'detail', jsonb_build_object('second_run_voided', v_settled, 'wallet_delta', v_bal1 - v_bal0));

    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','football:void','pass',false,'detail',v_err);
    END IF;
  END;

  -- ------------------------------------------------ insufficient bankroll --
  BEGIN
    BEGIN
      PERFORM public.accounting_arcade_assert_capacity('plinko', v_user,
        public.accounting_available_reserve(v_env) + 1000000, 1);
      out := out || jsonb_build_object('test','capacity:rejects_bet_beyond_available_bankroll',
        'pass', false, 'detail', 'oversized liability was accepted');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      out := out || jsonb_build_object('test','capacity:rejects_bet_beyond_available_bankroll',
        'pass', v_err LIKE 'EXPOSURE_LIMIT%', 'detail', v_err);
    END;
    BEGIN
      PERFORM public.accounting_arcade_assert_capacity('plinko', v_user, 10, 10);
      out := out || jsonb_build_object('test','capacity:allows_zero_net_liability',
        'pass', true, 'detail', 'accepted');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      out := out || jsonb_build_object('test','capacity:allows_zero_net_liability',
        'pass', false, 'detail', v_err);
    END;
  END;

  RETURN out;
END $function$;

REVOKE ALL ON FUNCTION public.accounting_phase10_product_tests() FROM PUBLIC, anon;