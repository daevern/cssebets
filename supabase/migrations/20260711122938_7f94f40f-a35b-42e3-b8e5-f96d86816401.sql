
-- Expand UFC market types to include totals and distance markets
ALTER TABLE public.ufc_fight_markets DROP CONSTRAINT IF EXISTS ufc_fight_markets_market_type_check;
ALTER TABLE public.ufc_fight_markets ADD CONSTRAINT ufc_fight_markets_market_type_check
  CHECK (market_type = ANY (ARRAY['moneyline'::text, 'method'::text, 'round'::text, 'total_rounds'::text, 'distance'::text]));

-- Update settlement RPC to resolve total_rounds and distance markets
CREATE OR REPLACE FUNCTION public.settle_ufc_fight_atomic(p_fight_id uuid, p_winner text, p_method text, p_round integer)
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
BEGIN
  SELECT * INTO v_fight FROM public.ufc_fights WHERE id = p_fight_id FOR UPDATE;
  IF v_fight IS NULL THEN RAISE EXCEPTION 'Fight not found'; END IF;
  IF v_fight.status = 'finished' THEN RAISE EXCEPTION 'Already settled'; END IF;

  v_went_distance := (p_method = 'decision');
  -- Effective "rounds elapsed": full scheduled if goes distance, else the finishing round is partial.
  -- For over/under X.5 we need: over wins when actual > X. Treat finish in round R (KO/sub) as R-0.5 elapsed
  -- (so over 1.5 needs R >= 2). Decision → actual = scheduled_rounds full → over wins for lines up to scheduled-0.5.
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
    ELSIF v_bet.market_type = 'method' THEN
      v_won := v_bet.selection_key = v_expected_method_key;
    ELSIF v_bet.market_type = 'round' THEN
      v_won := v_bet.selection_key = v_expected_round_key;
    ELSIF v_bet.market_type = 'distance' THEN
      IF v_bet.selection_key = 'yes' THEN v_won := v_went_distance;
      ELSIF v_bet.selection_key = 'no' THEN v_won := NOT v_went_distance;
      END IF;
    ELSIF v_bet.market_type = 'total_rounds' THEN
      -- selection_key like over_1_5 / under_2_5
      v_line_match := regexp_matches(v_bet.selection_key, '^(over|under)_(\d+)_(\d+)$');
      IF v_line_match IS NOT NULL THEN
        v_line := (v_line_match[2])::numeric + ((v_line_match[3])::numeric / 10.0);
        IF v_line_match[1] = 'over' THEN
          v_won := v_actual_rounds > v_line;
        ELSE
          v_won := v_actual_rounds < v_line;
        END IF;
      END IF;
    END IF;

    IF v_won THEN
      SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id AND is_simulation = false FOR UPDATE;
      v_new_bal := v_bal + v_bet.potential_payout;
      UPDATE public.wallets SET balance = v_new_bal, updated_at = now()
        WHERE user_id = v_bet.user_id AND is_simulation = false;
      UPDATE public.ufc_bets SET status = 'won', payout = v_bet.potential_payout, settled_at = now()
        WHERE id = v_bet.id;
      INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after, reference_type, reference_id, note, transaction_category, bet_id, metadata)
        VALUES (v_bet.user_id, 'credit', v_bet.potential_payout, v_bal, v_new_bal, 'bet_settlement', v_bet.id, 'UFC bet won', 'ufc_bet', v_bet.id,
                jsonb_build_object('fight_id', p_fight_id, 'winner', p_winner, 'method', p_method, 'round', p_round));
    ELSE
      UPDATE public.ufc_bets SET status = 'lost', payout = 0, settled_at = now() WHERE id = v_bet.id;
    END IF;
    v_settled := v_settled + 1;
  END LOOP;

  UPDATE public.ufc_fights
    SET status = 'finished', winner = p_winner, result_method = p_method, result_round = p_round, settled_at = now(), updated_at = now()
    WHERE id = p_fight_id;

  RETURN v_settled;
END;
$function$;
