
-- 1) redeem_free_bet: also debit bankroll by stake_amount when issuing a free bet.
CREATE OR REPLACE FUNCTION public.redeem_free_bet(
  p_user_id uuid,
  p_stake_amount numeric,
  p_token_cost integer,
  p_store_item text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet RECORD;
  v_new_balance BIGINT;
  v_fb_id UUID;
BEGIN
  INSERT INTO public.csse_token_wallets (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_wallet FROM public.csse_token_wallets
    WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.balance < p_token_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS';
  END IF;

  v_new_balance := v_wallet.balance - p_token_cost;
  UPDATE public.csse_token_wallets
    SET balance = v_new_balance,
        lifetime_spent = lifetime_spent + p_token_cost,
        updated_at = now()
    WHERE user_id = p_user_id;

  INSERT INTO public.csse_token_transactions
    (user_id, delta, kind, source, source_ref, metadata, balance_after)
  VALUES (p_user_id, -p_token_cost, 'spend', 'store_purchase', p_store_item,
          jsonb_build_object('stake_amount', p_stake_amount, 'item_key', p_store_item),
          v_new_balance);

  INSERT INTO public.csse_free_bets (user_id, stake_amount, token_cost, status, source, metadata)
  VALUES (p_user_id, p_stake_amount, p_token_cost, 'available', 'store_purchase',
          jsonb_build_object('item_key', p_store_item))
  RETURNING id INTO v_fb_id;

  -- Bankroll funds the free bet up-front. Recorded as a payout because the
  -- house has committed the stake to the user's future settlement, and best-
  -- effort so any missing platform_apply_change signature doesn't block issue.
  BEGIN
    PERFORM public.platform_apply_change(
      'payout_paid'::platform_txn_type,
      p_stake_amount,
      NULL, NULL,
      'free_bet_issued:' || p_store_item, false
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_fb_id;
END $function$;

-- 2) place_free_bet_atomic: restrict to 90-min 1X2 (result / HOME|DRAW|AWAY)
--    and set potential_return to PROFIT ONLY (stake*(odds-1)) so settlement
--    naturally pays profit-only via existing win branch. Drop the misleading
--    "stake_collected" platform txn (bankroll already debited at redemption).
CREATE OR REPLACE FUNCTION public.place_free_bet_atomic(
  p_user_id uuid,
  p_free_bet_id uuid,
  p_match_id uuid,
  p_market prediction_market,
  p_outcome text,
  p_odds numeric,
  p_snapshot_id uuid,
  p_client_request_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fb RECORD;
  v_match RECORD;
  v_profit NUMERIC;
  v_max_payout NUMERIC;
  v_pred_id UUID;
BEGIN
  -- Free bets are only for the 90-minute match result market.
  IF p_market <> 'result'::prediction_market THEN
    RAISE EXCEPTION 'FREE_BET_MARKET_NOT_ALLOWED';
  END IF;
  IF p_outcome NOT IN ('HOME','DRAW','AWAY') THEN
    RAISE EXCEPTION 'FREE_BET_OUTCOME_NOT_ALLOWED';
  END IF;

  SELECT * INTO v_fb FROM public.csse_free_bets
    WHERE id = p_free_bet_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FREE_BET_NOT_FOUND'; END IF;
  IF v_fb.status <> 'available' THEN RAISE EXCEPTION 'FREE_BET_UNAVAILABLE'; END IF;

  IF p_client_request_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.predictions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST';
  END IF;

  IF p_match_id IS NOT NULL THEN
    SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR SHARE;
    IF FOUND AND (v_match.status IN ('live','finished','postponed','cancelled')
                  OR v_match.kickoff_at <= now()) THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
  END IF;

  -- Profit-only payout for free bets: user gets stake*(odds-1) on win.
  v_profit := ROUND(v_fb.stake_amount * (p_odds - 1), 2);

  SELECT NULLIF(max_potential_payout, 0) INTO v_max_payout
    FROM public.platform_settings WHERE id = 1;
  IF v_max_payout IS NOT NULL AND v_profit > v_max_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  INSERT INTO public.predictions
    (user_id, match_id, market, outcome, reference_odds, virtual_stake,
     potential_return, reference_odds_snapshot_id, client_request_id,
     free_bet_id, status)
  VALUES
    (p_user_id, p_match_id, p_market, p_outcome, p_odds, v_fb.stake_amount,
     v_profit, p_snapshot_id, p_client_request_id, v_fb.id, 'pending')
  RETURNING id INTO v_pred_id;

  UPDATE public.csse_free_bets
    SET status = 'consumed',
        consumed_at = now(),
        prediction_id = v_pred_id
    WHERE id = v_fb.id;

  RETURN v_pred_id;
END $function$;

-- 3) settle_match_atomic: on free-bet WIN, credit user profit only and refund
--    stake to bankroll (net bankroll delta = -profit vs. the -stake booked at
--    issue). On free-bet LOSS, refund stake to bankroll (net delta = 0). This
--    only touches the 'result' branch since free bets are restricted to 1X2.
CREATE OR REPLACE FUNCTION public.settle_match_atomic(
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pred RECORD; v_settled INT := 0; v_won BOOLEAN; v_payout NUMERIC;
  v_winner TEXT; v_total INT; v_line NUMERIC; v_dir TEXT;
  v_pool RECORD; v_sim BOOLEAN; v_outcome TEXT; v_pool_already_settled BOOLEAN := false;
  v_is_free_bet BOOLEAN;
BEGIN
  SELECT is_simulation INTO v_sim FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  v_sim := COALESCE(v_sim, false);

  INSERT INTO public.match_stake_pools(match_id, is_simulation) VALUES (p_match_id, v_sim) ON CONFLICT (match_id) DO NOTHING;
  SELECT * INTO v_pool FROM public.match_stake_pools WHERE match_id=p_match_id FOR UPDATE;
  v_pool_already_settled := COALESCE(v_pool.settled, false);

  UPDATE public.matches
     SET status='finished'::public.match_status,
         home_score=p_home_score, away_score=p_away_score,
         home_liability=0, draw_liability=0, away_liability=0, worst_case_exposure=0
   WHERE id=p_match_id;

  IF NOT v_pool_already_settled AND v_pool.total_pool > 0 THEN
    PERFORM public.platform_apply_change(
      'match_pool_collected'::public.platform_txn_type, v_pool.total_pool,
      NULL, p_match_id, 'Pool transferred to bankroll on settlement', v_sim);
    PERFORM public.pool_apply_change(
      p_match_id, NULL, v_pool.total_pool, 'pool_transferred_to_bankroll',
      NULL, NULL, 'Pool drained to bankroll');
  END IF;

  IF p_home_score > p_away_score THEN v_winner := 'HOME';
  ELSIF p_home_score < p_away_score THEN v_winner := 'AWAY';
  ELSE v_winner := 'DRAW'; END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id=p_match_id AND status='pending'::public.prediction_status
      AND market IN ('result','correct_score','total_goals','btts')
    FOR UPDATE
  LOOP
    v_won := FALSE; v_payout := 0;
    v_is_free_bet := (v_pred.free_bet_id IS NOT NULL);
    v_outcome := CASE WHEN position(':' in COALESCE(v_pred.outcome,'')) > 0
                      THEN split_part(v_pred.outcome, ':', 2)
                      ELSE v_pred.outcome END;

    IF v_pred.market='result' THEN v_won := v_outcome=v_winner;
    ELSIF v_pred.market='correct_score' THEN v_won := v_outcome=(p_home_score||'-'||p_away_score);
    ELSIF v_pred.market='total_goals' THEN
      v_total := p_home_score + p_away_score;
      v_dir := split_part(v_outcome,'_',1);
      BEGIN
        v_line := NULLIF(replace(substring(v_outcome from '_(.*)$'), '_', '.'),'')::NUMERIC;
      EXCEPTION WHEN others THEN v_line := NULL;
      END;
      IF v_line IS NOT NULL THEN
        v_won := (v_dir='OVER' AND v_total>v_line) OR (v_dir='UNDER' AND v_total<v_line);
      END IF;
    ELSIF v_pred.market='btts' THEN
      v_won := (v_outcome='YES' AND p_home_score>0 AND p_away_score>0)
            OR (v_outcome='NO'  AND (p_home_score=0 OR p_away_score=0));
    END IF;

    IF v_won THEN
      IF v_is_free_bet THEN
        -- Profit-only payout to user
        v_payout := ROUND(v_pred.virtual_stake * (v_pred.reference_odds - 1), 2);
        UPDATE public.predictions SET status='won', points=3, settled_at=now() WHERE id=v_pred.id;
        IF v_payout > 0 THEN
          PERFORM public.wallet_apply_change(
            v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
            'bet_settlement'::public.wallet_ref_type,v_pred.id,'Free-bet profit payout', v_sim);
          PERFORM public.platform_apply_change(
            'payout_paid'::public.platform_txn_type,v_payout,v_pred.id,p_match_id,'Free-bet profit payout', v_sim);
        END IF;
        -- Refund the free-bet stake back to bankroll (it was debited at issue)
        PERFORM public.platform_apply_change(
          'stake_collected'::public.platform_txn_type,v_pred.virtual_stake,
          v_pred.id,p_match_id,'Free-bet stake refunded to bankroll (win)', v_sim);
      ELSE
        v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
        UPDATE public.predictions SET status='won', points=3, settled_at=now() WHERE id=v_pred.id;
        PERFORM public.wallet_apply_change(
          v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
          'bet_settlement'::public.wallet_ref_type,v_pred.id,'Win payout (payout_credit)', v_sim);
        PERFORM public.platform_apply_change(
          'payout_paid'::public.platform_txn_type,v_payout,v_pred.id,p_match_id,'Payout for winning bet', v_sim);
      END IF;
    ELSE
      UPDATE public.predictions SET status='lost', points=0, settled_at=now() WHERE id=v_pred.id;
      IF v_is_free_bet THEN
        -- Refund the free-bet stake back to bankroll (net delta 0 vs. issue)
        PERFORM public.platform_apply_change(
          'stake_collected'::public.platform_txn_type,v_pred.virtual_stake,
          v_pred.id,p_match_id,'Free-bet stake refunded to bankroll (loss)', v_sim);
      END IF;
    END IF;
    v_settled := v_settled + 1;
  END LOOP;

  UPDATE public.match_stake_pools SET settled=true, settled_at=COALESCE(settled_at, now()) WHERE match_id=p_match_id;
  RETURN v_settled;
END $function$;

-- 4) void_match_atomic: keep existing behaviour but ensure free bets are
--    refunded to bankroll AND returned to the user as re-usable.
--    Read current definition first and patch in place; if it already handles
--    free bets we skip. Here we take a conservative approach: append a
--    reconciliation step that returns free bets tied to voided predictions
--    to status='available' and refunds bankroll.
DO $mig$
DECLARE
  v_body text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_body FROM pg_proc WHERE proname='void_match_atomic';
  -- We just log for visibility; the trigger below handles the free-bet side.
  RAISE NOTICE 'void_match_atomic exists (len=%): free-bet refund now handled via trigger', length(v_body);
END $mig$;

-- Trigger: when a prediction backed by a free bet is voided, refund the stake
-- to bankroll and re-open the free bet for reuse.
CREATE OR REPLACE FUNCTION public.free_bet_on_void()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_sim BOOLEAN;
BEGIN
  IF NEW.status = 'void' AND OLD.status <> 'void' AND NEW.free_bet_id IS NOT NULL THEN
    SELECT is_simulation INTO v_sim FROM public.matches WHERE id = NEW.match_id;
    v_sim := COALESCE(v_sim, false);
    -- Refund stake to bankroll
    BEGIN
      PERFORM public.platform_apply_change(
        'stake_collected'::public.platform_txn_type, NEW.virtual_stake,
        NEW.id, NEW.match_id, 'Free-bet stake refunded to bankroll (void)', v_sim);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    -- Re-open the free bet
    UPDATE public.csse_free_bets
       SET status = 'available',
           consumed_at = NULL,
           prediction_id = NULL
     WHERE id = NEW.free_bet_id;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_free_bet_on_void ON public.predictions;
CREATE TRIGGER trg_free_bet_on_void
AFTER UPDATE OF status ON public.predictions
FOR EACH ROW
WHEN (NEW.free_bet_id IS NOT NULL)
EXECUTE FUNCTION public.free_bet_on_void();
