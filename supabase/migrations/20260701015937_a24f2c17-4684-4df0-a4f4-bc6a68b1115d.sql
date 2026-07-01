CREATE OR REPLACE FUNCTION public.settle_match_atomic(p_match_id uuid, p_home_score integer, p_away_score integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred RECORD; v_settled INT := 0; v_won BOOLEAN; v_payout NUMERIC;
  v_winner TEXT; v_total INT; v_line NUMERIC; v_dir TEXT;
  v_pool RECORD; v_sim BOOLEAN; v_outcome TEXT; v_pool_already_settled BOOLEAN := false;
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
      -- Only settle markets this legacy function actually knows how to grade.
      -- Everything else is handled by settle_new_markets_for_match /
      -- settle_to_qualify_for_match / settle_cards_corners_for_match.
      AND market IN ('result','correct_score','total_goals','btts')
    FOR UPDATE
  LOOP
    v_won := FALSE; v_payout := 0;
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
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions SET status='won', points=3, settled_at=now() WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
        'bet_settlement'::public.wallet_ref_type,v_pred.id,'Win payout (payout_credit)', v_sim);
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type,v_payout,v_pred.id,p_match_id,'Payout for winning bet', v_sim);
    ELSE
      UPDATE public.predictions SET status='lost', points=0, settled_at=now() WHERE id=v_pred.id;
    END IF;
    v_settled := v_settled + 1;
  END LOOP;

  UPDATE public.match_stake_pools SET settled=true, settled_at=COALESCE(settled_at, now()) WHERE match_id=p_match_id;
  RETURN v_settled;
END $function$;