
CREATE OR REPLACE FUNCTION public.place_sports_bet_atomic(
  p_user_id UUID,
  p_event_id UUID,
  p_market_id UUID,
  p_selection_id UUID,
  p_stake NUMERIC,
  p_max_odds NUMERIC,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal NUMERIC;
  v_new_bal NUMERIC;
  v_bet_id UUID;
  v_potential NUMERIC;
  v_event RECORD;
  v_market RECORD;
  v_selection RECORD;
  v_existing UUID;
BEGIN
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Stake must be positive'; END IF;

  -- Idempotency: return existing bet if key already used
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.sports_bets WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT id, status, markets_open, scheduled_at, sport_code, competition_code
    INTO v_event FROM public.sports_events WHERE id = p_event_id FOR UPDATE;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.status NOT IN ('scheduled','live','halftime') THEN
    RAISE EXCEPTION 'Event not open for betting';
  END IF;
  IF NOT v_event.markets_open THEN RAISE EXCEPTION 'Markets closed'; END IF;

  SELECT id, status, market_key, sports_event_id INTO v_market
    FROM public.sports_markets WHERE id = p_market_id;
  IF v_market.id IS NULL OR v_market.sports_event_id <> p_event_id THEN
    RAISE EXCEPTION 'Market not found';
  END IF;
  IF v_market.status <> 'open' THEN RAISE EXCEPTION 'Market not available'; END IF;

  SELECT id, decimal_odds, status, selection_key, display_name, sports_market_id
    INTO v_selection FROM public.sports_market_selections WHERE id = p_selection_id;
  IF v_selection.id IS NULL OR v_selection.sports_market_id <> p_market_id THEN
    RAISE EXCEPTION 'Selection not found';
  END IF;
  IF v_selection.status <> 'open' THEN RAISE EXCEPTION 'Selection not available'; END IF;
  IF v_selection.decimal_odds > p_max_odds THEN RAISE EXCEPTION 'Odds changed'; END IF;
  IF v_selection.decimal_odds < 1.01 THEN RAISE EXCEPTION 'Invalid odds'; END IF;

  INSERT INTO public.wallets(user_id, is_simulation, balance)
  VALUES (p_user_id, false, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_bal := v_bal - p_stake;
  v_potential := ROUND(p_stake * v_selection.decimal_odds, 2);

  UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO public.sports_bets (
    user_id, sports_event_id, sport_code, competition_code, sports_market_id, market_key,
    sports_selection_id, selection_key, stake, accepted_odds, potential_payout,
    idempotency_key, placed_at
  ) VALUES (
    p_user_id, p_event_id, v_event.sport_code, v_event.competition_code, p_market_id, v_market.market_key,
    p_selection_id, v_selection.selection_key, p_stake, v_selection.decimal_odds, v_potential,
    p_idempotency_key, now()
  ) RETURNING id INTO v_bet_id;

  INSERT INTO public.wallet_transactions (
    user_id, type, amount, balance_before, balance_after, reference_type, reference_id,
    note, is_simulation, transaction_category, bet_id, metadata
  ) VALUES (
    p_user_id, 'debit', p_stake, v_bal, v_new_bal, 'bet_placement', v_bet_id,
    'Sports bet placed', false, 'sports_bet', v_bet_id,
    jsonb_build_object('event_id', p_event_id, 'sport', v_event.sport_code,
                       'competition', v_event.competition_code, 'market', v_market.market_key,
                       'selection', v_selection.selection_key, 'odds', v_selection.decimal_odds)
  );

  RETURN v_bet_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.place_sports_bet_atomic(UUID,UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT) TO service_role;

-- Settlement: given a market ID and a set of winning selection IDs, mark selections,
-- update all pending bets on that market, credit winners' wallets, log everything.
CREATE OR REPLACE FUNCTION public.settle_sports_market_atomic(
  p_market_id UUID,
  p_winning_selection_ids UUID[],
  p_void BOOLEAN DEFAULT false,
  p_run_id UUID DEFAULT NULL
) RETURNS TABLE(bets_updated INT, total_payout NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_market RECORD;
  v_bet RECORD;
  v_bal NUMERIC;
  v_new_bal NUMERIC;
  v_payout NUMERIC;
  v_count INT := 0;
  v_total NUMERIC := 0;
BEGIN
  SELECT id, status, market_key, sports_event_id INTO v_market
    FROM public.sports_markets WHERE id = p_market_id FOR UPDATE;
  IF v_market.id IS NULL THEN RAISE EXCEPTION 'Market not found'; END IF;
  IF v_market.status = 'settled' THEN RETURN QUERY SELECT 0, 0::NUMERIC; RETURN; END IF;

  IF p_void THEN
    UPDATE public.sports_market_selections SET result = 'void', status = 'closed', updated_at = now()
      WHERE sports_market_id = p_market_id;
  ELSE
    UPDATE public.sports_market_selections SET status = 'closed', updated_at = now(),
      result = CASE WHEN id = ANY(p_winning_selection_ids) THEN 'won' ELSE 'lost' END
      WHERE sports_market_id = p_market_id;
  END IF;

  FOR v_bet IN
    SELECT * FROM public.sports_bets
     WHERE sports_market_id = p_market_id AND status = 'pending'
     FOR UPDATE
  LOOP
    IF p_void THEN
      -- refund stake
      SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id FOR UPDATE;
      v_new_bal := COALESCE(v_bal,0) + v_bet.stake;
      UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = v_bet.user_id;
      UPDATE public.sports_bets SET status='refunded', void_reason='market_voided',
             actual_payout = v_bet.stake, settled_at = now() WHERE id = v_bet.id;
      INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,
             reference_type,reference_id,note,is_simulation,transaction_category,bet_id,metadata)
      VALUES (v_bet.user_id,'credit',v_bet.stake,v_bal,v_new_bal,'bet_refund',v_bet.id,
             'Sports bet refunded',false,'sports_bet',v_bet.id,'{}'::jsonb);
      v_total := v_total + v_bet.stake;
    ELSIF v_bet.sports_selection_id = ANY(p_winning_selection_ids) THEN
      v_payout := ROUND(v_bet.stake * v_bet.accepted_odds, 2);
      SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id FOR UPDATE;
      v_new_bal := COALESCE(v_bal,0) + v_payout;
      UPDATE public.wallets SET balance = v_new_bal, updated_at = now() WHERE user_id = v_bet.user_id;
      UPDATE public.sports_bets SET status='won', actual_payout = v_payout, settled_at = now() WHERE id = v_bet.id;
      INSERT INTO public.wallet_transactions(user_id,type,amount,balance_before,balance_after,
             reference_type,reference_id,note,is_simulation,transaction_category,bet_id,metadata)
      VALUES (v_bet.user_id,'credit',v_payout,v_bal,v_new_bal,'bet_payout',v_bet.id,
             'Sports bet won',false,'sports_bet',v_bet.id,'{}'::jsonb);
      v_total := v_total + v_payout;
    ELSE
      UPDATE public.sports_bets SET status='lost', actual_payout = 0, settled_at = now() WHERE id = v_bet.id;
    END IF;

    IF p_run_id IS NOT NULL THEN
      INSERT INTO public.sports_settlement_items (settlement_run_id, sports_market_id, sports_bet_id, action, payout)
      VALUES (p_run_id, p_market_id, v_bet.id,
              CASE WHEN p_void THEN 'bet_refunded'
                   WHEN v_bet.sports_selection_id = ANY(p_winning_selection_ids) THEN 'bet_won'
                   ELSE 'bet_lost' END,
              CASE WHEN p_void THEN v_bet.stake
                   WHEN v_bet.sports_selection_id = ANY(p_winning_selection_ids) THEN ROUND(v_bet.stake * v_bet.accepted_odds, 2)
                   ELSE 0 END);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.sports_markets SET status = CASE WHEN p_void THEN 'void' ELSE 'settled' END,
         settled_at = now(),
         settlement_result = jsonb_build_object('winning_selection_ids', p_winning_selection_ids, 'void', p_void),
         updated_at = now()
   WHERE id = p_market_id;

  RETURN QUERY SELECT v_count, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.settle_sports_market_atomic(UUID, UUID[], BOOLEAN, UUID) TO service_role;
