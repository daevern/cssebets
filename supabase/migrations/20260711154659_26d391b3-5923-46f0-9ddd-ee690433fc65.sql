
CREATE OR REPLACE FUNCTION public.place_ufc_bet_atomic(
  p_user_id uuid, p_fight_id uuid, p_market_type text, p_selection_key text,
  p_selection_label text, p_stake numeric, p_odds numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bal numeric;
  v_new_bal numeric;
  v_bet_id uuid;
  v_potential numeric;
  v_fight_status text;
  v_market_active boolean;
  v_dup uuid;
BEGIN
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Stake must be positive'; END IF;
  IF p_odds < 1.01 THEN RAISE EXCEPTION 'Invalid odds'; END IF;

  SELECT status INTO v_fight_status FROM public.ufc_fights WHERE id = p_fight_id FOR UPDATE;
  IF v_fight_status IS NULL THEN RAISE EXCEPTION 'Fight not found'; END IF;
  IF v_fight_status NOT IN ('scheduled','live') THEN RAISE EXCEPTION 'Fight not open for betting'; END IF;

  SELECT is_active INTO v_market_active
  FROM public.ufc_fight_markets
  WHERE fight_id = p_fight_id AND market_type = p_market_type AND selection_key = p_selection_key;
  IF v_market_active IS NULL OR NOT v_market_active THEN RAISE EXCEPTION 'Market not available'; END IF;

  SELECT id INTO v_dup
  FROM public.ufc_bets
  WHERE user_id = p_user_id AND fight_id = p_fight_id
    AND market_type = p_market_type AND selection_key = p_selection_key
    AND status = 'open'
  LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_SELECTION';
  END IF;

  INSERT INTO public.wallets(user_id, is_simulation, balance)
  VALUES (p_user_id, false, 0) ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_bal := v_bal - p_stake;
  v_potential := ROUND(p_stake * p_odds, 2);

  UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO public.ufc_bets(user_id, fight_id, market_type, selection_key, selection_label, stake, odds_locked, potential_payout)
  VALUES (p_user_id, p_fight_id, p_market_type, p_selection_key, p_selection_label, p_stake, p_odds, v_potential)
  RETURNING id INTO v_bet_id;

  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after, reference_type, reference_id,
    note, is_simulation, transaction_category, bet_id, metadata
  ) VALUES (
    p_user_id, 'debit', p_stake, v_bal, v_new_bal, 'bet_placement', v_bet_id,
    'UFC bet placed', false, 'ufc_bet', v_bet_id,
    jsonb_build_object('fight_id', p_fight_id, 'market_type', p_market_type, 'selection_key', p_selection_key, 'odds', p_odds)
  );

  RETURN v_bet_id;
END;
$function$;
