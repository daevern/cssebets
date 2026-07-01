
-- 1) Backfill match_stats-derived totals into matches so the settler has real numbers
UPDATE public.matches m
SET home_corners = COALESCE(m.home_corners, (SELECT ms.corners FROM public.match_stats ms WHERE ms.match_id=m.id AND ms.side='home')),
    away_corners = COALESCE(m.away_corners, (SELECT ms.corners FROM public.match_stats ms WHERE ms.match_id=m.id AND ms.side='away')),
    home_cards   = COALESCE(m.home_cards,   (SELECT COALESCE(ms.yellow_cards,0)+COALESCE(ms.red_cards,0) FROM public.match_stats ms WHERE ms.match_id=m.id AND ms.side='home')),
    away_cards   = COALESCE(m.away_cards,   (SELECT COALESCE(ms.yellow_cards,0)+COALESCE(ms.red_cards,0) FROM public.match_stats ms WHERE ms.match_id=m.id AND ms.side='away'))
WHERE m.id = '225d6ddf-4b05-40ec-81fd-13f65db0d826';

-- 2) Reverse the mis-settled corners_over_9_5 bet
DO $$
DECLARE
  v_pred_id uuid := '5389f2a6-222d-4b38-9a61-005817385b40';
  v_user_id uuid := '7357dc15-673e-4d32-9d50-841cc71a292b';
  v_match_id uuid := '225d6ddf-4b05-40ec-81fd-13f65db0d826';
  v_payout numeric := 358.00;
BEGIN
  UPDATE public.predictions
     SET status='won', points=v_payout, settled_at=now(),
         settled_result='corrected:corners_17_over_9_5'
   WHERE id = v_pred_id AND status='lost';

  IF FOUND THEN
    PERFORM public.wallet_apply_change(
      v_user_id,'credit'::public.wallet_txn_type,v_payout,
      'bet_settlement'::public.wallet_ref_type, v_pred_id,
      'Manual correction: corners_over_9_5 (17 corners) — was mis-settled as LOST', false);
    PERFORM public.platform_apply_change(
      'payout_paid'::public.platform_txn_type, v_payout,
      v_pred_id, v_match_id,
      'Manual correction: corners over 9.5 payout', false);

    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata)
    VALUES (v_user_id, 'prediction.manual_correction', 'prediction', v_pred_id,
      jsonb_build_object('reason','corners were 17, OVER_9_5 should be WON','payout',v_payout,'prev_status','lost'));
  END IF;
END $$;

-- 3) Patch settler: fall back to match_stats when matches.home_corners/away_corners/home_cards/away_cards are NULL
CREATE OR REPLACE FUNCTION public.settle_cards_corners_for_match(p_match_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m record;
  v_pred record;
  v_count int := 0;
  v_total int; v_line int;
  v_won boolean; v_void boolean; v_payout numeric;
  v_home_corners int; v_away_corners int;
  v_home_cards int; v_away_cards int;
  v_cards_markets text[] := ARRAY[
    'cards_over_under_2_5','cards_over_under_3_5','cards_over_under_4_5','cards_over_under_5_5',
    'home_cards_over_under_1_5','away_cards_over_under_1_5',
    'red_card_match','first_card'
  ];
  v_corners_markets text[] := ARRAY[
    'corners_over_under_8_5','corners_over_under_9_5','corners_over_under_10_5','corners_over_under_11_5',
    'home_corners_over_under_4_5','away_corners_over_under_4_5',
    'first_corner'
  ];
BEGIN
  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Fallback to match_stats when matches columns are NULL
  v_home_corners := v_m.home_corners;
  v_away_corners := v_m.away_corners;
  v_home_cards   := v_m.home_cards;
  v_away_cards   := v_m.away_cards;

  IF v_home_corners IS NULL THEN
    SELECT corners INTO v_home_corners FROM public.match_stats WHERE match_id=p_match_id AND side='home';
  END IF;
  IF v_away_corners IS NULL THEN
    SELECT corners INTO v_away_corners FROM public.match_stats WHERE match_id=p_match_id AND side='away';
  END IF;
  IF v_home_cards IS NULL THEN
    SELECT COALESCE(yellow_cards,0)+COALESCE(red_cards,0) INTO v_home_cards FROM public.match_stats WHERE match_id=p_match_id AND side='home';
  END IF;
  IF v_away_cards IS NULL THEN
    SELECT COALESCE(yellow_cards,0)+COALESCE(red_cards,0) INTO v_away_cards FROM public.match_stats WHERE match_id=p_match_id AND side='away';
  END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id = p_match_id AND status = 'pending'
      AND (market::text = ANY(v_cards_markets) OR market::text = ANY(v_corners_markets))
    FOR UPDATE
  LOOP
    v_void := false; v_won := false; v_payout := 0;

    IF v_pred.market::text = ANY(v_cards_markets) THEN
      IF v_home_cards IS NULL OR v_away_cards IS NULL THEN
        v_void := true;
      ELSE
        v_total := v_home_cards + v_away_cards;
        CASE
          WHEN v_pred.market::text LIKE 'cards_over_under_%' THEN
            v_line := CASE v_pred.market::text
              WHEN 'cards_over_under_2_5' THEN 3
              WHEN 'cards_over_under_3_5' THEN 4
              WHEN 'cards_over_under_4_5' THEN 5
              WHEN 'cards_over_under_5_5' THEN 6 END;
            v_won := (v_pred.selection LIKE 'OVER_%' AND v_total >= v_line)
                  OR (v_pred.selection LIKE 'UNDER_%' AND v_total < v_line);
          WHEN v_pred.market::text = 'home_cards_over_under_1_5' THEN
            v_won := (v_pred.selection = 'OVER_1_5'  AND v_home_cards >= 2)
                  OR (v_pred.selection = 'UNDER_1_5' AND v_home_cards <  2);
          WHEN v_pred.market::text = 'away_cards_over_under_1_5' THEN
            v_won := (v_pred.selection = 'OVER_1_5'  AND v_away_cards >= 2)
                  OR (v_pred.selection = 'UNDER_1_5' AND v_away_cards <  2);
          WHEN v_pred.market::text = 'red_card_match' THEN
            IF v_m.red_card_occurred IS NULL THEN v_void := true;
            ELSE
              v_won := (v_pred.selection = 'YES' AND v_m.red_card_occurred)
                    OR (v_pred.selection = 'NO'  AND NOT v_m.red_card_occurred);
            END IF;
          WHEN v_pred.market::text = 'first_card' THEN
            IF v_m.first_card_team IS NULL THEN v_void := true;
            ELSE v_won := v_pred.selection = v_m.first_card_team;
            END IF;
        END CASE;
      END IF;
    END IF;

    IF v_pred.market::text = ANY(v_corners_markets) THEN
      IF v_home_corners IS NULL OR v_away_corners IS NULL THEN
        v_void := true;
      ELSE
        v_total := v_home_corners + v_away_corners;
        CASE
          WHEN v_pred.market::text LIKE 'corners_over_under_%' THEN
            v_line := CASE v_pred.market::text
              WHEN 'corners_over_under_8_5' THEN 9
              WHEN 'corners_over_under_9_5' THEN 10
              WHEN 'corners_over_under_10_5' THEN 11
              WHEN 'corners_over_under_11_5' THEN 12 END;
            v_won := (v_pred.selection LIKE 'OVER_%' AND v_total >= v_line)
                  OR (v_pred.selection LIKE 'UNDER_%' AND v_total < v_line);
          WHEN v_pred.market::text = 'home_corners_over_under_4_5' THEN
            v_won := (v_pred.selection = 'OVER_4_5'  AND v_home_corners >= 5)
                  OR (v_pred.selection = 'UNDER_4_5' AND v_home_corners <  5);
          WHEN v_pred.market::text = 'away_corners_over_under_4_5' THEN
            v_won := (v_pred.selection = 'OVER_4_5'  AND v_away_corners >= 5)
                  OR (v_pred.selection = 'UNDER_4_5' AND v_away_corners <  5);
          WHEN v_pred.market::text = 'first_corner' THEN
            IF v_m.first_corner_team IS NULL THEN v_void := true;
            ELSE v_won := v_pred.selection = v_m.first_corner_team;
            END IF;
        END CASE;
      END IF;
    END IF;

    IF v_void THEN
      UPDATE public.predictions
         SET status='void', points=0, settled_at=now(),
             settled_result='void:'||v_pred.market::text
       WHERE id = v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type, v_pred.virtual_stake,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Void refund ('||v_pred.market::text||')', COALESCE(v_m.is_simulation,false));
      PERFORM public.platform_apply_change(
        'refund'::public.platform_txn_type, v_pred.virtual_stake,
        v_pred.id, p_match_id, 'Void refund ('||v_pred.market::text||')', COALESCE(v_m.is_simulation,false));
    ELSIF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions
         SET status='won', points=v_payout, settled_at=now(),
             settled_result='won:'||v_pred.market::text
       WHERE id = v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type, v_payout,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Win payout ('||v_pred.market::text||')', COALESCE(v_m.is_simulation,false));
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type, v_payout,
        v_pred.id, p_match_id, 'Payout ('||v_pred.market::text||')', COALESCE(v_m.is_simulation,false));
    ELSE
      UPDATE public.predictions
         SET status='lost', points=0, settled_at=now(),
             settled_result='lost:'||v_pred.market::text
       WHERE id = v_pred.id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;
