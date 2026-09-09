
-- ============ Football / generic sportsbook ============
CREATE OR REPLACE FUNCTION public.edit_sports_bet_stake(p_user_id uuid, p_bet_id uuid, p_new_stake numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bet public.sports_bets%ROWTYPE;
  v_event RECORD;
  v_market RECORD;
  v_diff numeric; v_new_potential numeric; v_bal numeric; v_new_bal numeric;
  v_settings public.platform_settings;
BEGIN
  IF p_user_id IS NULL OR p_bet_id IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;
  IF p_new_stake IS NULL OR p_new_stake < 10 OR p_new_stake > 50000 THEN
    RAISE EXCEPTION 'INVALID_STAKE: stake must be between 10 and 50000';
  END IF;

  SELECT * INTO v_bet FROM public.sports_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_bet.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_bet.status NOT IN ('pending','open') THEN RAISE EXCEPTION 'BET_NOT_PENDING'; END IF;

  SELECT id, scheduled_at, status, markets_open INTO v_event
    FROM public.sports_events WHERE id = v_bet.sports_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
  IF v_event.status <> 'scheduled' OR v_event.scheduled_at <= now() OR NOT v_event.markets_open THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;

  SELECT id, status INTO v_market FROM public.sports_markets WHERE id = v_bet.sports_market_id;
  IF v_market.id IS NULL OR v_market.status <> 'open' THEN RAISE EXCEPTION 'MATCH_LOCKED'; END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  v_new_potential := ROUND(p_new_stake * v_bet.accepted_odds, 2);
  IF v_settings.max_potential_payout > 0 AND v_new_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  v_diff := p_new_stake - v_bet.stake;
  IF v_diff = 0 THEN RETURN p_new_stake; END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  IF v_diff > 0 THEN
    IF v_bal < v_diff THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
    v_new_bal := v_bal - v_diff;
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
      reference_id,note,is_simulation,transaction_category,bet_id,metadata)
    VALUES (p_user_id,'debit',v_diff,v_bal,v_new_bal,'bet_placement',v_bet.id,
      'Sports bet stake increased',false,'sports_bet',v_bet.id,
      jsonb_build_object('event_id', v_bet.sports_event_id,'old_stake',v_bet.stake,'new_stake',p_new_stake));
  ELSE
    v_new_bal := v_bal + (-v_diff);
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
      reference_id,note,is_simulation,transaction_category,bet_id,metadata)
    VALUES (p_user_id,'refund',-v_diff,v_bal,v_new_bal,'bet_settlement',v_bet.id,
      'Sports bet stake decreased — partial refund',false,'sports_bet',v_bet.id,
      jsonb_build_object('event_id', v_bet.sports_event_id,'old_stake',v_bet.stake,'new_stake',p_new_stake));
  END IF;

  UPDATE public.sports_bets
     SET stake = p_new_stake, potential_payout = v_new_potential, updated_at = now()
   WHERE id = v_bet.id;

  PERFORM public.accounting_release_liability('sports_bet', v_bet.id, 'STAKE_EDIT');
  PERFORM public.accounting_reserve_liability('sports_generic','sports_generic','sports_bet', v_bet.id,
    v_bet.user_id, v_new_potential, p_new_stake, NULL, jsonb_build_object('source','stake_edit'));

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
  VALUES (p_user_id,'sports_bet.edit_stake','sports_bet',v_bet.id,
    jsonb_build_object('old_stake',v_bet.stake,'new_stake',p_new_stake), false);

  RETURN p_new_stake;
END $$;
GRANT EXECUTE ON FUNCTION public.edit_sports_bet_stake(uuid,uuid,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_sports_bet(p_user_id uuid, p_bet_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bet public.sports_bets%ROWTYPE;
  v_event RECORD; v_bal numeric; v_new_bal numeric;
BEGIN
  IF p_user_id IS NULL OR p_bet_id IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;

  SELECT * INTO v_bet FROM public.sports_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_bet.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_bet.status NOT IN ('pending','open') THEN RAISE EXCEPTION 'BET_NOT_PENDING'; END IF;

  SELECT id, scheduled_at, status INTO v_event
    FROM public.sports_events WHERE id = v_bet.sports_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
  IF v_event.status <> 'scheduled' OR v_event.scheduled_at <= now() THEN RAISE EXCEPTION 'MATCH_LOCKED'; END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  v_new_bal := v_bal + v_bet.stake;

  UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
    reference_id,note,is_simulation,transaction_category,bet_id,metadata)
  VALUES (p_user_id,'refund',v_bet.stake,v_bal,v_new_bal,'bet_settlement',v_bet.id,
    'Sports bet cancelled by user — full refund',false,'sports_bet',v_bet.id,
    jsonb_build_object('event_id', v_bet.sports_event_id));

  UPDATE public.sports_bets
     SET status = 'refunded', void_reason = 'user_cancelled', actual_payout = v_bet.stake, settled_at = now(), updated_at = now()
   WHERE id = v_bet.id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
  VALUES (p_user_id,'sports_bet.cancel','sports_bet',v_bet.id,
    jsonb_build_object('stake_refunded', v_bet.stake), false);

  RETURN v_bet.id;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_sports_bet(uuid,uuid) TO service_role;

-- ============ F1 race bets ============
CREATE OR REPLACE FUNCTION public.edit_f1_race_bet_stake(p_user_id uuid, p_bet_id uuid, p_new_stake numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bet public.f1_bets%ROWTYPE;
  v_race RECORD; v_diff numeric; v_new_potential numeric; v_bal numeric; v_new_bal numeric;
  v_settings public.platform_settings;
BEGIN
  IF p_user_id IS NULL OR p_bet_id IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;
  IF p_new_stake IS NULL OR p_new_stake < 10 OR p_new_stake > 50000 THEN
    RAISE EXCEPTION 'INVALID_STAKE: stake must be between 10 and 50000';
  END IF;

  SELECT * INTO v_bet FROM public.f1_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_bet.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_bet.status NOT IN ('open','pending') THEN RAISE EXCEPTION 'BET_NOT_PENDING'; END IF;

  SELECT id, starts_at, status INTO v_race FROM public.f1_races WHERE id = v_bet.race_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'race not found'; END IF;
  IF v_race.starts_at <= now() OR v_race.status NOT IN ('scheduled','upcoming') THEN RAISE EXCEPTION 'MATCH_LOCKED'; END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  v_new_potential := ROUND(p_new_stake * v_bet.odds_locked, 2);
  IF v_settings.max_potential_payout > 0 AND v_new_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  v_diff := p_new_stake - v_bet.stake;
  IF v_diff = 0 THEN RETURN p_new_stake; END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  IF v_diff > 0 THEN
    IF v_bal < v_diff THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
    v_new_bal := v_bal - v_diff;
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
      reference_id,note,is_simulation,transaction_category,bet_id,metadata)
    VALUES (p_user_id,'debit',v_diff,v_bal,v_new_bal,'bet_placement',v_bet.id,
      'F1 bet stake increased',false,'f1_bet',v_bet.id,
      jsonb_build_object('race_id',v_bet.race_id,'old_stake',v_bet.stake,'new_stake',p_new_stake));
  ELSE
    v_new_bal := v_bal + (-v_diff);
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
      reference_id,note,is_simulation,transaction_category,bet_id,metadata)
    VALUES (p_user_id,'refund',-v_diff,v_bal,v_new_bal,'bet_settlement',v_bet.id,
      'F1 bet stake decreased — partial refund',false,'f1_bet',v_bet.id,
      jsonb_build_object('race_id',v_bet.race_id,'old_stake',v_bet.stake,'new_stake',p_new_stake));
  END IF;

  UPDATE public.f1_bets SET stake = p_new_stake, potential_payout = v_new_potential WHERE id = v_bet.id;

  PERFORM public.accounting_release_liability('f1_bet', v_bet.id, 'STAKE_EDIT');
  PERFORM public.accounting_reserve_liability('f1','f1','f1_bet', v_bet.id, v_bet.user_id,
    v_new_potential, p_new_stake, NULL, jsonb_build_object('source','stake_edit'));

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
  VALUES (p_user_id,'f1_bet.edit_stake','f1_bet',v_bet.id,
    jsonb_build_object('old_stake',v_bet.stake,'new_stake',p_new_stake), false);

  RETURN p_new_stake;
END $$;
GRANT EXECUTE ON FUNCTION public.edit_f1_race_bet_stake(uuid,uuid,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_f1_race_bet(p_user_id uuid, p_bet_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bet public.f1_bets%ROWTYPE; v_race RECORD; v_bal numeric; v_new_bal numeric;
BEGIN
  IF p_user_id IS NULL OR p_bet_id IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;

  SELECT * INTO v_bet FROM public.f1_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_bet.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_bet.status NOT IN ('open','pending') THEN RAISE EXCEPTION 'BET_NOT_PENDING'; END IF;

  SELECT id, starts_at, status INTO v_race FROM public.f1_races WHERE id = v_bet.race_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'race not found'; END IF;
  IF v_race.starts_at <= now() OR v_race.status NOT IN ('scheduled','upcoming') THEN RAISE EXCEPTION 'MATCH_LOCKED'; END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  v_new_bal := v_bal + v_bet.stake;

  UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
    reference_id,note,is_simulation,transaction_category,bet_id,metadata)
  VALUES (p_user_id,'refund',v_bet.stake,v_bal,v_new_bal,'bet_settlement',v_bet.id,
    'F1 bet cancelled by user — full refund',false,'f1_bet',v_bet.id,
    jsonb_build_object('race_id',v_bet.race_id));

  UPDATE public.f1_bets SET status = 'void', settled_at = now() WHERE id = v_bet.id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
  VALUES (p_user_id,'f1_bet.cancel','f1_bet',v_bet.id,
    jsonb_build_object('stake_refunded', v_bet.stake), false);

  RETURN v_bet.id;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_f1_race_bet(uuid,uuid) TO service_role;

-- ============ F1 championship bets ============
CREATE OR REPLACE FUNCTION public.edit_f1_championship_bet_stake(p_user_id uuid, p_bet_id uuid, p_new_stake numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bet public.f1_championship_bets%ROWTYPE;
  v_market RECORD; v_diff numeric; v_new_potential numeric; v_bal numeric; v_new_bal numeric;
  v_settings public.platform_settings;
BEGIN
  IF p_user_id IS NULL OR p_bet_id IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;
  IF p_new_stake IS NULL OR p_new_stake < 10 OR p_new_stake > 50000 THEN
    RAISE EXCEPTION 'INVALID_STAKE: stake must be between 10 and 50000';
  END IF;

  SELECT * INTO v_bet FROM public.f1_championship_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_bet.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_bet.status NOT IN ('open','pending') THEN RAISE EXCEPTION 'BET_NOT_PENDING'; END IF;

  SELECT id, status INTO v_market FROM public.f1_championship_markets WHERE id = v_bet.market_id;
  IF v_market.id IS NULL OR v_market.status <> 'open' THEN RAISE EXCEPTION 'MATCH_LOCKED'; END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  v_new_potential := ROUND(p_new_stake * v_bet.odds_locked, 2);
  IF v_settings.max_potential_payout > 0 AND v_new_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  v_diff := p_new_stake - v_bet.stake;
  IF v_diff = 0 THEN RETURN p_new_stake; END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  IF v_diff > 0 THEN
    IF v_bal < v_diff THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
    v_new_bal := v_bal - v_diff;
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
      reference_id,note,is_simulation,transaction_category,bet_id,metadata)
    VALUES (p_user_id,'debit',v_diff,v_bal,v_new_bal,'bet_placement',v_bet.id,
      'F1 championship bet stake increased',false,'f1_championship_bet',v_bet.id,
      jsonb_build_object('market_id',v_bet.market_id,'old_stake',v_bet.stake,'new_stake',p_new_stake));
  ELSE
    v_new_bal := v_bal + (-v_diff);
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
      reference_id,note,is_simulation,transaction_category,bet_id,metadata)
    VALUES (p_user_id,'refund',-v_diff,v_bal,v_new_bal,'bet_settlement',v_bet.id,
      'F1 championship bet stake decreased — partial refund',false,'f1_championship_bet',v_bet.id,
      jsonb_build_object('market_id',v_bet.market_id,'old_stake',v_bet.stake,'new_stake',p_new_stake));
  END IF;

  UPDATE public.f1_championship_bets SET stake = p_new_stake, potential_payout = v_new_potential WHERE id = v_bet.id;

  PERFORM public.accounting_release_liability('f1_championship_bet', v_bet.id, 'STAKE_EDIT');
  PERFORM public.accounting_reserve_liability('f1','f1','f1_championship_bet', v_bet.id, v_bet.user_id,
    v_new_potential, p_new_stake, NULL, jsonb_build_object('source','stake_edit'));

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
  VALUES (p_user_id,'f1_championship_bet.edit_stake','f1_championship_bet',v_bet.id,
    jsonb_build_object('old_stake',v_bet.stake,'new_stake',p_new_stake), false);

  RETURN p_new_stake;
END $$;
GRANT EXECUTE ON FUNCTION public.edit_f1_championship_bet_stake(uuid,uuid,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_f1_championship_bet(p_user_id uuid, p_bet_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bet public.f1_championship_bets%ROWTYPE; v_market RECORD; v_bal numeric; v_new_bal numeric;
BEGIN
  IF p_user_id IS NULL OR p_bet_id IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;

  SELECT * INTO v_bet FROM public.f1_championship_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_bet.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_bet.status NOT IN ('open','pending') THEN RAISE EXCEPTION 'BET_NOT_PENDING'; END IF;

  SELECT id, status INTO v_market FROM public.f1_championship_markets WHERE id = v_bet.market_id;
  IF v_market.id IS NULL OR v_market.status <> 'open' THEN RAISE EXCEPTION 'MATCH_LOCKED'; END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  v_new_bal := v_bal + v_bet.stake;

  UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,
    reference_id,note,is_simulation,transaction_category,bet_id,metadata)
  VALUES (p_user_id,'refund',v_bet.stake,v_bal,v_new_bal,'bet_settlement',v_bet.id,
    'F1 championship bet cancelled by user — full refund',false,'f1_championship_bet',v_bet.id,
    jsonb_build_object('market_id',v_bet.market_id));

  UPDATE public.f1_championship_bets SET status = 'void', settled_at = now() WHERE id = v_bet.id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
  VALUES (p_user_id,'f1_championship_bet.cancel','f1_championship_bet',v_bet.id,
    jsonb_build_object('stake_refunded', v_bet.stake), false);

  RETURN v_bet.id;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_f1_championship_bet(uuid,uuid) TO service_role;
