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

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id = p_match_id AND status = 'pending'
      AND (market::text = ANY(v_cards_markets) OR market::text = ANY(v_corners_markets))
    FOR UPDATE
  LOOP
    v_void := false; v_won := false; v_payout := 0;

    IF v_pred.market::text = ANY(v_cards_markets) THEN
      IF v_m.home_cards IS NULL OR v_m.away_cards IS NULL THEN
        v_void := true;
      ELSE
        v_total := v_m.home_cards + v_m.away_cards;
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
            v_won := (v_pred.selection = 'OVER_1_5'  AND v_m.home_cards >= 2)
                  OR (v_pred.selection = 'UNDER_1_5' AND v_m.home_cards <  2);
          WHEN v_pred.market::text = 'away_cards_over_under_1_5' THEN
            v_won := (v_pred.selection = 'OVER_1_5'  AND v_m.away_cards >= 2)
                  OR (v_pred.selection = 'UNDER_1_5' AND v_m.away_cards <  2);
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
      IF v_m.home_corners IS NULL OR v_m.away_corners IS NULL THEN
        v_void := true;
      ELSE
        v_total := v_m.home_corners + v_m.away_corners;
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
            v_won := (v_pred.selection = 'OVER_4_5'  AND v_m.home_corners >= 5)
                  OR (v_pred.selection = 'UNDER_4_5' AND v_m.home_corners <  5);
          WHEN v_pred.market::text = 'away_corners_over_under_4_5' THEN
            v_won := (v_pred.selection = 'OVER_4_5'  AND v_m.away_corners >= 5)
                  OR (v_pred.selection = 'UNDER_4_5' AND v_m.away_corners <  5);
          WHEN v_pred.market::text = 'first_corner' THEN
            IF v_m.first_corner_team IS NULL THEN v_void := true;
            ELSE v_won := v_pred.selection = v_m.first_corner_team;
            END IF;
        END CASE;
      END IF;
    END IF;

    IF v_void THEN
      UPDATE public.predictions
        SET status = 'void', resolved_at = now(), payout = 0
        WHERE id = v_pred.id;
      PERFORM public.credit_user_void_refund(v_pred.user_id, p_match_id, v_pred.id, v_pred.stake);
      v_count := v_count + 1;
    ELSIF v_won THEN
      v_payout := v_pred.potential_payout;
      UPDATE public.predictions
        SET status = 'won', resolved_at = now(), payout = v_payout
        WHERE id = v_pred.id;
      PERFORM public.credit_user_payout(v_pred.user_id, p_match_id, v_pred.id, v_payout);
      v_count := v_count + 1;
    ELSE
      UPDATE public.predictions
        SET status = 'lost', resolved_at = now(), payout = 0
        WHERE id = v_pred.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END $function$;