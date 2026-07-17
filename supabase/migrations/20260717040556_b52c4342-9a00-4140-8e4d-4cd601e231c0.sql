
CREATE OR REPLACE FUNCTION public.place_f1_race_bet_atomic(
  p_user_id uuid,
  p_market_id uuid,
  p_stake numeric,
  p_max_odds numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market record;
  v_race record;
  v_balance numeric;
  v_bet_id uuid;
  v_payout numeric;
BEGIN
  IF p_stake < 10 OR p_stake > 50000 THEN RAISE EXCEPTION 'Invalid stake'; END IF;

  SELECT id, race_id, market_type, selection_key, label, odds, status
    INTO v_market FROM public.f1_race_markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF v_market.status <> 'open' THEN RAISE EXCEPTION 'Market not available'; END IF;
  IF v_market.odds > p_max_odds THEN RAISE EXCEPTION 'Odds changed'; END IF;

  SELECT id, starts_at, status INTO v_race FROM public.f1_races WHERE id = v_market.race_id;
  IF v_race.starts_at <= now() THEN RAISE EXCEPTION 'Race already started'; END IF;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_payout := round(p_stake * v_market.odds, 2);

  UPDATE public.wallets SET balance = balance - p_stake WHERE user_id = p_user_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description, metadata)
  VALUES (p_user_id, -p_stake, 'bet_place', 'F1 race bet', jsonb_build_object('source','f1','market_id',p_market_id));

  INSERT INTO public.f1_bets (user_id, race_id, market_id, market_type, selection_key, selection_label, stake, odds_locked, potential_payout, status)
  VALUES (p_user_id, v_market.race_id, v_market.id, v_market.market_type, v_market.selection_key, v_market.label, p_stake, v_market.odds, v_payout, 'open')
  RETURNING id INTO v_bet_id;

  RETURN v_bet_id;
END $$;

GRANT EXECUTE ON FUNCTION public.place_f1_race_bet_atomic(uuid, uuid, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.place_f1_championship_bet_atomic(
  p_user_id uuid,
  p_market_id uuid,
  p_stake numeric,
  p_max_odds numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market record;
  v_balance numeric;
  v_bet_id uuid;
  v_payout numeric;
BEGIN
  IF p_stake < 10 OR p_stake > 50000 THEN RAISE EXCEPTION 'Invalid stake'; END IF;

  SELECT id, season, market_type, selection_key, label, odds, status
    INTO v_market FROM public.f1_championship_markets WHERE id = p_market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF v_market.status <> 'open' THEN RAISE EXCEPTION 'Market not available'; END IF;
  IF v_market.odds > p_max_odds THEN RAISE EXCEPTION 'Odds changed'; END IF;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_payout := round(p_stake * v_market.odds, 2);

  UPDATE public.wallets SET balance = balance - p_stake WHERE user_id = p_user_id;

  INSERT INTO public.wallet_transactions (user_id, amount, type, description, metadata)
  VALUES (p_user_id, -p_stake, 'bet_place', 'F1 championship bet', jsonb_build_object('source','f1_champ','market_id',p_market_id));

  INSERT INTO public.f1_championship_bets (user_id, market_id, season, market_type, selection_key, selection_label, stake, odds_locked, potential_payout, status)
  VALUES (p_user_id, v_market.id, v_market.season, v_market.market_type, v_market.selection_key, v_market.label, p_stake, v_market.odds, v_payout, 'open')
  RETURNING id INTO v_bet_id;

  RETURN v_bet_id;
END $$;

GRANT EXECUTE ON FUNCTION public.place_f1_championship_bet_atomic(uuid, uuid, numeric, numeric) TO authenticated, service_role;
