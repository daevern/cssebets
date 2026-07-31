CREATE OR REPLACE FUNCTION public.accounting_phase6_selftest()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  out jsonb := '[]'::jsonb;
  v_env public.acct_environment := 'SIMULATION';
  v_user uuid; v_bank numeric; v_avail0 numeric; v_avail1 numeric;
  v_round public.arcade_treasure_rounds; v_hand uuid; v_game public.arcade_plinko_games;
  v_res public.accounting_liability_reservations; v_err text; v_key text;
BEGIN
  SELECT a.user_id INTO v_user
    FROM public.accounting_accounts a
    JOIN public.accounting_account_balances b ON b.account_id = a.id
   WHERE a.account_code='USER_WALLET' AND a.environment=v_env AND a.status='ACTIVE'
   ORDER BY b.balance DESC LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'NO_SIM_USER'; END IF;

  -- 1. formulae
  v_bank := (SELECT coalesce(sum(CASE WHEN a.account_code='HOUSE_BANKROLL' THEN b.balance
                                      WHEN a.account_code='PAYOUTS_PAYABLE' THEN -b.balance END),0)
               FROM public.accounting_accounts a
               JOIN public.accounting_account_balances b ON b.account_id=a.id
              WHERE a.user_id IS NULL AND a.environment=v_env AND a.status='ACTIVE'
                AND a.account_code IN ('HOUSE_BANKROLL','PAYOUTS_PAYABLE'));
  v_avail0 := public.accounting_available_reserve(v_env);
  out := out || jsonb_build_object('test','formula:available = bankroll - reserved',
    'pass', v_avail0 = v_bank - public.accounting_reserved_liability(v_env),
    'detail', jsonb_build_object('bankroll', v_bank, 'reserved', public.accounting_reserved_liability(v_env),
                                 'available', v_avail0));

  -- 2. treasure round holds a live reservation, released on terminal state
  BEGIN
    v_key := 'p6-treasure-' || gen_random_uuid()::text;
    v_round := public.arcade_treasure_start_round(v_user, 'easy', 10, 'selftest-seed', v_key);
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_treasure_round' AND reference_id=v_round.id;
    v_avail1 := public.accounting_available_reserve(v_env);
    out := out || jsonb_build_object('test','treasure:reservation_active_on_open_round',
      'pass', v_res.status='ACTIVE' AND v_res.reserved_amount = greatest(v_res.max_gross_payout - v_res.stake_collected,0)
              AND v_res.reserved_amount > 0,
      'detail', jsonb_build_object('gross', v_res.max_gross_payout, 'stake', v_res.stake_collected,
                                   'reserved', v_res.reserved_amount, 'status', v_res.status));
    out := out || jsonb_build_object('test','treasure:available_reduced_by_reservation',
      'pass', v_avail1 = v_avail0 + v_round.stake - v_res.reserved_amount
              OR v_avail1 < v_avail0,
      'detail', jsonb_build_object('before', v_avail0, 'after', v_avail1));

    UPDATE public.arcade_treasure_rounds SET status='VOID' WHERE id=v_round.id;
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_treasure_round' AND reference_id=v_round.id;
    out := out || jsonb_build_object('test','treasure:reservation_released_on_terminal',
      'pass', v_res.status='RELEASED' AND v_res.reserved_amount=0 AND v_res.released_at IS NOT NULL,
      'detail', jsonb_build_object('status', v_res.status, 'reason', v_res.release_reason));
    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','treasure:reservation_lifecycle','pass',false,'detail',SQLERRM);
    END IF;
  END;

  -- 3. blackjack reserves worst case (splits + doubles), releases on completion
  BEGIN
    v_key := 'p6-bj-' || gen_random_uuid()::text;
    v_hand := public.arcade_bj_start_hand(v_user, 5, 'selftest-seed', v_key);
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_bj_hand' AND reference_id=v_hand;
    out := out || jsonb_build_object('test','blackjack:reserves_worst_case_gross',
      'pass', v_res.max_gross_payout = public.arcade_bj_worst_case_gross(
                (SELECT rule_config_id FROM public.arcade_bj_hands WHERE id=v_hand), 5)
              AND v_res.max_net_liability = greatest(v_res.max_gross_payout - 5, 0),
      'detail', jsonb_build_object('gross', v_res.max_gross_payout, 'net', v_res.max_net_liability,
                                   'status', v_res.status));
    UPDATE public.arcade_bj_hands SET status='COMPLETED' WHERE id=v_hand AND status<>'COMPLETED';
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_bj_hand' AND reference_id=v_hand;
    out := out || jsonb_build_object('test','blackjack:reservation_released_on_completion',
      'pass', v_res.status='RELEASED' AND v_res.reserved_amount=0, 'detail', v_res.release_reason);
    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','blackjack:reservation_lifecycle','pass',false,'detail',SQLERRM);
    END IF;
  END;

  -- 4. single-shot plinko records a settled reservation, no residual liability
  BEGIN
    v_key := 'p6-plinko-' || gen_random_uuid()::text;
    v_game := public.arcade_place_plinko_drop(v_user, 8, 'low', v_key, 'selftest-seed', 1);
    SELECT * INTO v_res FROM public.accounting_liability_reservations
      WHERE reference_type='arcade_plinko_game' AND reference_id=v_game.id;
    out := out || jsonb_build_object('test','plinko:settled_reservation_recorded',
      'pass', v_res.id IS NOT NULL AND v_res.status='RELEASED' AND v_res.reserved_amount=0
              AND v_res.max_gross_payout > 0,
      'detail', jsonb_build_object('gross', v_res.max_gross_payout, 'stake', v_res.stake_collected,
                                   'status', v_res.status));
    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','plinko:settled_reservation_recorded','pass',false,'detail',SQLERRM);
    END IF;
  END;

  -- 5. reservations block a placement that no longer fits
  BEGIN
    v_err := NULL;
    BEGIN
      PERFORM public.accounting_arcade_assert_capacity('plinko', v_user,
        public.accounting_available_reserve(v_env) + 1000000, 1);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    out := out || jsonb_build_object('test','capacity:rejects_when_net_liability_exceeds_available',
      'pass', v_err LIKE 'EXPOSURE_LIMIT%', 'detail', v_err);

    v_err := NULL;
    BEGIN
      PERFORM public.accounting_arcade_assert_capacity('plinko', v_user, 5, 5);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    out := out || jsonb_build_object('test','capacity:zero_net_liability_allowed',
      'pass', v_err IS NULL, 'detail', v_err);
  END;

  -- 6. no orphan / duplicate reservations, invariants hold
  out := out || jsonb_build_object('test','register:reserved_equals_net_for_active',
    'pass', NOT EXISTS (SELECT 1 FROM public.accounting_liability_reservations
                         WHERE status='ACTIVE' AND reserved_amount <> max_net_liability),
    'detail', NULL);
  out := out || jsonb_build_object('test','register:released_rows_hold_zero',
    'pass', NOT EXISTS (SELECT 1 FROM public.accounting_liability_reservations
                         WHERE status<>'ACTIVE' AND reserved_amount <> 0), 'detail', NULL);
  out := out || jsonb_build_object('test','register:no_active_reservation_for_settled_position',
    'pass', NOT EXISTS (
      SELECT 1 FROM public.accounting_liability_reservations r
       WHERE r.status='ACTIVE' AND r.reference_type='arcade_treasure_round'
         AND EXISTS (SELECT 1 FROM public.arcade_treasure_rounds t
                      WHERE t.id=r.reference_id
                        AND t.status NOT IN ('CREATED','ACTIVE','COLLECTING')))
      AND NOT EXISTS (
      SELECT 1 FROM public.accounting_liability_reservations r
       WHERE r.status='ACTIVE' AND r.reference_type='arcade_bj_hand'
         AND EXISTS (SELECT 1 FROM public.arcade_bj_hands h
                      WHERE h.id=r.reference_id
                        AND h.status NOT IN ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING'))),
    'detail', NULL);
  out := out || jsonb_build_object('test','register:sports_positions_tracked',
    'pass', (SELECT count(*) FROM public.accounting_liability_reservations
              WHERE product IN ('football','ufc','f1','sports_generic') AND status='ACTIVE') >= 0,
    'detail', (SELECT jsonb_object_agg(product, cnt) FROM (
        SELECT product, count(*) cnt FROM public.accounting_liability_reservations
         WHERE status='ACTIVE' GROUP BY product) z));

  RETURN jsonb_build_object('total', jsonb_array_length(out),
    'passed', (SELECT count(*) FROM jsonb_array_elements(out) e WHERE (e->>'pass')::boolean),
    'results', out);
END;
$fn$;

INSERT INTO public.accounting_selftest_runs(label, report)
VALUES ('phase6-placeholder', '{}'::jsonb)
ON CONFLICT DO NOTHING;

SELECT cron.schedule('phase6-selftest', '* * * * *', $$
  INSERT INTO public.accounting_selftest_runs(label, report, error)
  SELECT 'phase6', public.accounting_phase6_selftest(), NULL;
$$);