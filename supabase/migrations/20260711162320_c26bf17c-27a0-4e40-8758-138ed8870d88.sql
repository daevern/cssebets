
CREATE OR REPLACE FUNCTION public.edit_ufc_bet_stake(p_user_id uuid, p_bet_id uuid, p_new_stake numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bet public.ufc_bets%ROWTYPE;
  v_fight RECORD;
  v_diff numeric;
  v_new_potential numeric;
  v_bal numeric;
  v_new_bal numeric;
  v_settings public.platform_settings;
BEGIN
  IF p_user_id IS NULL OR p_bet_id IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;
  IF p_new_stake IS NULL OR p_new_stake < 10 OR p_new_stake > 50000 THEN
    RAISE EXCEPTION 'INVALID_STAKE: stake must be between 10 and 50000';
  END IF;

  SELECT * INTO v_bet FROM public.ufc_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_bet.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_bet.status <> 'open' THEN RAISE EXCEPTION 'BET_NOT_PENDING'; END IF;

  SELECT id, commence_time, status INTO v_fight
    FROM public.ufc_fights WHERE id = v_bet.fight_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fight not found'; END IF;
  IF v_fight.status <> 'scheduled' OR v_fight.commence_time <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;

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
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after, reference_type, reference_id,
      note, is_simulation, transaction_category, bet_id, metadata
    ) VALUES (
      p_user_id, 'debit', v_diff, v_bal, v_new_bal, 'bet_placement', v_bet.id,
      'UFC bet stake increased', false, 'ufc_bet', v_bet.id,
      jsonb_build_object('fight_id', v_bet.fight_id, 'old_stake', v_bet.stake, 'new_stake', p_new_stake)
    );
  ELSE
    v_new_bal := v_bal + (-v_diff);
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after, reference_type, reference_id,
      note, is_simulation, transaction_category, bet_id, metadata
    ) VALUES (
      p_user_id, 'refund', -v_diff, v_bal, v_new_bal, 'bet_settlement', v_bet.id,
      'UFC bet stake decreased — partial refund', false, 'ufc_bet', v_bet.id,
      jsonb_build_object('fight_id', v_bet.fight_id, 'old_stake', v_bet.stake, 'new_stake', p_new_stake)
    );
  END IF;

  UPDATE public.ufc_bets
     SET stake = p_new_stake, potential_payout = v_new_potential
   WHERE id = v_bet.id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
    VALUES (p_user_id, 'ufc_bet.edit_stake', 'ufc_bet', v_bet.id,
            jsonb_build_object('old_stake', v_bet.stake, 'new_stake', p_new_stake), false);

  RETURN p_new_stake;
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_ufc_bet(p_user_id uuid, p_bet_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bet public.ufc_bets%ROWTYPE;
  v_fight RECORD;
  v_bal numeric;
  v_new_bal numeric;
BEGIN
  IF p_user_id IS NULL OR p_bet_id IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;

  SELECT * INTO v_bet FROM public.ufc_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bet not found'; END IF;
  IF v_bet.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_bet.status <> 'open' THEN RAISE EXCEPTION 'BET_NOT_PENDING'; END IF;

  SELECT id, commence_time, status INTO v_fight
    FROM public.ufc_fights WHERE id = v_bet.fight_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fight not found'; END IF;
  IF v_fight.status <> 'scheduled' OR v_fight.commence_time <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  v_new_bal := v_bal + v_bet.stake;

  UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after, reference_type, reference_id,
    note, is_simulation, transaction_category, bet_id, metadata
  ) VALUES (
    p_user_id, 'refund', v_bet.stake, v_bal, v_new_bal, 'bet_settlement', v_bet.id,
    'UFC bet cancelled by user — full refund', false, 'ufc_bet', v_bet.id,
    jsonb_build_object('fight_id', v_bet.fight_id)
  );

  UPDATE public.ufc_bets
     SET status = 'void', settled_at = now(), payout = 0
   WHERE id = v_bet.id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata, is_simulation)
    VALUES (p_user_id, 'ufc_bet.cancel', 'ufc_bet', v_bet.id,
            jsonb_build_object('stake_refunded', v_bet.stake), false);

  RETURN v_bet.id;
END $function$;
