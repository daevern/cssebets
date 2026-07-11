CREATE OR REPLACE FUNCTION public.place_ufc_bet_atomic(
  p_user_id uuid,
  p_fight_id uuid,
  p_market_type text,
  p_selection_key text,
  p_selection_label text,
  p_stake numeric,
  p_odds numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bal numeric;
  v_new_bal numeric;
  v_bet_id uuid;
  v_potential numeric;
  v_fight_status text;
  v_market_active boolean;
  v_wallet_is_simulation boolean;
BEGIN
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Stake must be positive'; END IF;
  IF p_odds < 1.01 THEN RAISE EXCEPTION 'Invalid odds'; END IF;

  SELECT status INTO v_fight_status
  FROM public.ufc_fights
  WHERE id = p_fight_id
  FOR UPDATE;

  IF v_fight_status IS NULL THEN RAISE EXCEPTION 'Fight not found'; END IF;
  IF v_fight_status NOT IN ('scheduled','live') THEN RAISE EXCEPTION 'Fight not open for betting'; END IF;

  SELECT is_active INTO v_market_active
  FROM public.ufc_fight_markets
  WHERE fight_id = p_fight_id
    AND market_type = p_market_type
    AND selection_key = p_selection_key;

  IF v_market_active IS NULL OR NOT v_market_active THEN
    RAISE EXCEPTION 'Market not available';
  END IF;

  INSERT INTO public.wallets(user_id, is_simulation, balance)
  VALUES (p_user_id, false, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, is_simulation
  INTO v_bal, v_wallet_is_simulation
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_bal := v_bal - p_stake;
  v_potential := ROUND(p_stake * p_odds, 2);

  UPDATE public.wallets
  SET balance = v_new_bal,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.ufc_bets(
    user_id,
    fight_id,
    market_type,
    selection_key,
    selection_label,
    stake,
    odds_locked,
    potential_payout
  ) VALUES (
    p_user_id,
    p_fight_id,
    p_market_type,
    p_selection_key,
    p_selection_label,
    p_stake,
    p_odds,
    v_potential
  )
  RETURNING id INTO v_bet_id;

  INSERT INTO public.wallet_transactions(
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    note,
    is_simulation,
    transaction_category,
    bet_id,
    metadata
  ) VALUES (
    p_user_id,
    'debit',
    p_stake,
    v_bal,
    v_new_bal,
    'bet_placement',
    v_bet_id,
    'UFC bet placed',
    COALESCE(v_wallet_is_simulation, false),
    'ufc_bet',
    v_bet_id,
    jsonb_build_object('fight_id', p_fight_id, 'market_type', p_market_type, 'selection_key', p_selection_key, 'odds', p_odds)
  );

  RETURN v_bet_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_ufc_fight_atomic(
  p_fight_id uuid,
  p_winner text,
  p_method text,
  p_round integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bet record;
  v_bal numeric;
  v_new_bal numeric;
  v_won boolean;
  v_settled int := 0;
  v_fight record;
  v_expected_round_key text;
  v_expected_method_key text;
  v_went_distance boolean;
  v_actual_rounds numeric;
  v_line_match text[];
  v_line numeric;
  v_side text;
  v_handicap numeric;
  v_wallet_is_simulation boolean;
BEGIN
  SELECT * INTO v_fight FROM public.ufc_fights WHERE id = p_fight_id FOR UPDATE;
  IF v_fight IS NULL THEN RAISE EXCEPTION 'Fight not found'; END IF;
  IF v_fight.status = 'finished' THEN RAISE EXCEPTION 'Already settled'; END IF;

  v_went_distance := (p_method = 'decision');
  IF v_went_distance THEN
    v_actual_rounds := v_fight.scheduled_rounds;
  ELSE
    v_actual_rounds := p_round - 0.5;
  END IF;

  IF p_round >= v_fight.scheduled_rounds AND v_went_distance THEN
    v_expected_round_key := 'distance';
  ELSE
    v_expected_round_key := 'r' || p_round::text;
  END IF;
  v_expected_method_key := p_winner || '_' || p_method;

  FOR v_bet IN SELECT * FROM public.ufc_bets WHERE fight_id = p_fight_id AND status = 'open' FOR UPDATE LOOP
    v_won := false;

    IF v_bet.market_type = 'moneyline' THEN
      v_won := v_bet.selection_key = p_winner;
    ELSIF v_bet.market_type = 'three_way' THEN
      v_won := v_bet.selection_key = p_winner;
    ELSIF v_bet.market_type = 'method' THEN
      v_won := v_bet.selection_key = v_expected_method_key;
    ELSIF v_bet.market_type = 'round' THEN
      v_won := v_bet.selection_key = v_expected_round_key;
    ELSIF v_bet.market_type = 'distance' THEN
      IF v_bet.selection_key = 'yes' THEN
        v_won := v_went_distance;
      ELSIF v_bet.selection_key = 'no' THEN
        v_won := NOT v_went_distance;
      END IF;
    ELSIF v_bet.market_type = 'total_rounds' THEN
      v_line_match := regexp_matches(v_bet.selection_key, '^(over|under)_(\d+)_(\d+)$');
      IF v_line_match IS NOT NULL THEN
        v_line := (v_line_match[2])::numeric + ((v_line_match[3])::numeric / 10.0);
        IF v_line_match[1] = 'over' THEN
          v_won := v_actual_rounds > v_line;
        ELSE
          v_won := v_actual_rounds < v_line;
        END IF;
      END IF;
    ELSIF v_bet.market_type = 'handicap' THEN
      v_line_match := regexp_matches(v_bet.selection_key, '^([ab])_(plus|minus)_(\d+)_(\d+)$');
      IF v_line_match IS NOT NULL THEN
        v_side := v_line_match[1];
        v_handicap := (v_line_match[3])::numeric + ((v_line_match[4])::numeric / 10.0);
        IF v_line_match[2] = 'minus' THEN v_handicap := -v_handicap; END IF;
        IF p_winner = 'draw' THEN
          v_won := v_handicap > 0;
        ELSIF p_winner = v_side THEN
          v_won := true;
        ELSE
          v_won := v_handicap > 0;
        END IF;
      END IF;
    END IF;

    IF v_won THEN
      SELECT balance, is_simulation
      INTO v_bal, v_wallet_is_simulation
      FROM public.wallets
      WHERE user_id = v_bet.user_id
      FOR UPDATE;

      IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

      v_new_bal := v_bal + v_bet.potential_payout;

      UPDATE public.wallets
      SET balance = v_new_bal,
          updated_at = now()
      WHERE user_id = v_bet.user_id;

      UPDATE public.ufc_bets
      SET status = 'won',
          payout = v_bet.potential_payout,
          settled_at = now()
      WHERE id = v_bet.id;

      INSERT INTO public.wallet_transactions(
        user_id,
        type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        note,
        is_simulation,
        transaction_category,
        bet_id,
        metadata
      ) VALUES (
        v_bet.user_id,
        'credit',
        v_bet.potential_payout,
        v_bal,
        v_new_bal,
        'bet_settlement',
        v_bet.id,
        'UFC bet won',
        COALESCE(v_wallet_is_simulation, false),
        'ufc_bet',
        v_bet.id,
        jsonb_build_object('fight_id', p_fight_id, 'winner', p_winner, 'method', p_method, 'round', p_round)
      );
    ELSE
      UPDATE public.ufc_bets
      SET status = 'lost',
          payout = 0,
          settled_at = now()
      WHERE id = v_bet.id;
    END IF;

    v_settled := v_settled + 1;
  END LOOP;

  UPDATE public.ufc_fights
  SET status = 'finished',
      winner = p_winner,
      result_method = p_method,
      result_round = p_round,
      settled_at = now(),
      updated_at = now()
  WHERE id = p_fight_id;

  RETURN v_settled;
END;
$function$;