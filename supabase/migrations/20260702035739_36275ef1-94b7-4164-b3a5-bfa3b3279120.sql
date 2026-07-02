CREATE OR REPLACE FUNCTION public.settle_new_markets_for_match(p_match_id uuid, p_home integer, p_away integer, p_home_ht integer DEFAULT NULL::integer, p_away_ht integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred RECORD; v_count int := 0; v_total int; v_score_text text;
  v_listed_scores text[] := ARRAY['0-0','1-0','0-1','1-1','2-0','0-2','2-1','1-2','2-2',
    '3-0','0-3','3-1','1-3','3-2','2-3','3-3','4-0','0-4','4-1','1-4','4-2','2-4'];
  v_won boolean; v_void boolean; v_payout numeric; v_sim boolean;
  v_ht_res text; v_ft_res text; v_line int; v_sel_norm text;
BEGIN
  SELECT is_simulation INTO v_sim FROM public.matches WHERE id = p_match_id;
  v_sim := COALESCE(v_sim, false);
  v_total := COALESCE(p_home,0) + COALESCE(p_away,0);
  v_score_text := p_home || '-' || p_away;

  IF p_home > p_away THEN v_ft_res := 'HOME';
  ELSIF p_home < p_away THEN v_ft_res := 'AWAY';
  ELSE v_ft_res := 'DRAW'; END IF;

  IF p_home_ht IS NOT NULL AND p_away_ht IS NOT NULL THEN
    IF p_home_ht > p_away_ht THEN v_ht_res := 'HOME';
    ELSIF p_home_ht < p_away_ht THEN v_ht_res := 'AWAY';
    ELSE v_ht_res := 'DRAW'; END IF;
  END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id = p_match_id
      AND status = 'pending'::public.prediction_status
      AND (
        market_text IN ('1x2','btts','correct_score','half_time_full_time','exact_total_goals',
                        'double_chance','draw_no_bet','goals_odd_even',
                        'clean_sheet_home','clean_sheet_away','win_to_nil_home','win_to_nil_away')
        OR market_text LIKE 'over_under_%'
      )
    FOR UPDATE
  LOOP
    v_won := false; v_void := false;
    v_sel_norm := UPPER(COALESCE(v_pred.selection_label, ''));

    IF v_pred.market_text = '1x2' THEN
      -- Match Result at 90 minutes (regulation). ET & pens do not apply here.
      v_won := (v_sel_norm = 'HOME' AND v_ft_res = 'HOME')
            OR (v_sel_norm = 'DRAW' AND v_ft_res = 'DRAW')
            OR (v_sel_norm = 'AWAY' AND v_ft_res = 'AWAY');

    ELSIF v_pred.market_text LIKE 'over_under_%' THEN
      v_line := split_part(v_pred.market_text, '_', 3)::int;
      IF v_pred.selection_label LIKE 'OVER_%' THEN
        v_won := v_total > v_line;
      ELSIF v_pred.selection_label LIKE 'UNDER_%' THEN
        v_won := v_total <= v_line;
      END IF;

    ELSIF v_pred.market_text = 'btts' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_home > 0 AND p_away > 0)
            OR (v_pred.selection_label = 'NO'  AND (p_home = 0 OR p_away = 0));

    ELSIF v_pred.market_text = 'goals_odd_even' THEN
      v_won := (v_pred.selection_label = 'ODD'  AND (v_total % 2) = 1)
            OR (v_pred.selection_label = 'EVEN' AND (v_total % 2) = 0);

    ELSIF v_pred.market_text = 'double_chance' THEN
      v_won := CASE v_pred.selection_label
        WHEN 'HOME_OR_DRAW' THEN v_ft_res IN ('HOME','DRAW')
        WHEN 'HOME_OR_AWAY' THEN v_ft_res IN ('HOME','AWAY')
        WHEN 'DRAW_OR_AWAY' THEN v_ft_res IN ('DRAW','AWAY')
        ELSE false END;

    ELSIF v_pred.market_text = 'draw_no_bet' THEN
      IF v_ft_res = 'DRAW' THEN
        v_void := true;
      ELSE
        v_won := (v_pred.selection_label = 'HOME' AND v_ft_res = 'HOME')
              OR (v_pred.selection_label = 'AWAY' AND v_ft_res = 'AWAY');
      END IF;

    ELSIF v_pred.market_text = 'clean_sheet_home' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_away = 0)
            OR (v_pred.selection_label = 'NO'  AND p_away > 0);
    ELSIF v_pred.market_text = 'clean_sheet_away' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_home = 0)
            OR (v_pred.selection_label = 'NO'  AND p_home > 0);

    ELSIF v_pred.market_text = 'win_to_nil_home' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_home > p_away AND p_away = 0)
            OR (v_pred.selection_label = 'NO'  AND NOT (p_home > p_away AND p_away = 0));
    ELSIF v_pred.market_text = 'win_to_nil_away' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_away > p_home AND p_home = 0)
            OR (v_pred.selection_label = 'NO'  AND NOT (p_away > p_home AND p_home = 0));

    ELSIF v_pred.market_text = 'correct_score' THEN
      IF v_pred.selection_label = 'OTHER' THEN
        v_won := NOT (v_score_text = ANY(v_listed_scores));
      ELSE
        v_won := v_pred.selection_label = v_score_text;
      END IF;

    ELSIF v_pred.market_text = 'exact_total_goals' THEN
      v_won := CASE v_pred.selection_label
        WHEN 'GOALS_0' THEN v_total = 0
        WHEN 'GOALS_1' THEN v_total = 1
        WHEN 'GOALS_2' THEN v_total = 2
        WHEN 'GOALS_3' THEN v_total = 3
        WHEN 'GOALS_4' THEN v_total = 4
        WHEN 'GOALS_5_PLUS' THEN v_total >= 5
        ELSE false END;

    ELSIF v_pred.market_text = 'half_time_full_time' AND v_ht_res IS NOT NULL THEN
      v_won := v_pred.selection_label = (v_ht_res || '_' || v_ft_res);
    ELSIF v_pred.market_text = 'half_time_full_time' AND v_ht_res IS NULL THEN
      v_void := true;
    END IF;

    IF v_void THEN
      v_payout := v_pred.virtual_stake;
      UPDATE public.predictions SET status='void', points=0, settled_at=now(), gross_payout=v_payout WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
        'bet_settlement'::public.wallet_ref_type,v_pred.id,'Stake refunded (void)', v_sim);
    ELSIF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions SET status='won', points=3, settled_at=now(), gross_payout=v_payout WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
        'bet_settlement'::public.wallet_ref_type,v_pred.id,'Win payout (payout_credit)', v_sim);
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type,v_payout,v_pred.id,p_match_id,'Payout for winning bet', v_sim);
    ELSE
      UPDATE public.predictions SET status='lost', points=0, settled_at=now() WHERE id=v_pred.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;