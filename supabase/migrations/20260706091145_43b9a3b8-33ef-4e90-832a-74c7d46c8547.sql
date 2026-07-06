CREATE OR REPLACE FUNCTION public.regrade_cards_corners_for_match(p_match_id uuid)
RETURNS TABLE(prediction_id uuid, old_status text, new_status text, delta numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_m record;
  v_pred record;
  v_home_corners int; v_away_corners int;
  v_home_cards int; v_away_cards int;
  v_home_fetched timestamptz; v_away_fetched timestamptz;
  v_selection text;
  v_total int; v_line int;
  v_won boolean;
  v_new_status text;
  v_old_gross numeric; v_new_gross numeric; v_delta numeric;
  v_reason text;
  v_txn uuid;
  v_cards_markets text[] := ARRAY[
    'cards_over_under_2_5','cards_over_under_3_5','cards_over_under_4_5','cards_over_under_5_5',
    'home_cards_over_under_1_5','away_cards_over_under_1_5'
  ];
  v_corners_markets text[] := ARRAY[
    'corners_over_under_8_5','corners_over_under_9_5','corners_over_under_10_5','corners_over_under_11_5',
    'home_corners_over_under_4_5','away_corners_over_under_4_5'
  ];
BEGIN
  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR v_m.status <> 'finished' THEN RETURN; END IF;

  SELECT corners, COALESCE(yellow_cards,0)+COALESCE(red_cards,0), fetched_at
    INTO v_home_corners, v_home_cards, v_home_fetched
    FROM public.match_stats WHERE match_id=p_match_id AND side='home';
  SELECT corners, COALESCE(yellow_cards,0)+COALESCE(red_cards,0), fetched_at
    INTO v_away_corners, v_away_cards, v_away_fetched
    FROM public.match_stats WHERE match_id=p_match_id AND side='away';

  v_home_corners := COALESCE(v_m.home_corners, v_home_corners);
  v_away_corners := COALESCE(v_m.away_corners, v_away_corners);
  v_home_cards   := COALESCE(v_m.home_cards,   v_home_cards);
  v_away_cards   := COALESCE(v_m.away_cards,   v_away_cards);

  FOR v_pred IN
    SELECT * FROM public.predictions
     WHERE match_id = p_match_id
       AND status IN ('won'::public.prediction_status,'lost'::public.prediction_status)
       AND (v_pred.market::text = ANY(v_cards_markets) OR v_pred.market::text = ANY(v_corners_markets))
     FOR UPDATE
  LOOP
    v_won := false;
    v_selection := REPLACE(REPLACE(UPPER(TRIM(COALESCE(v_pred.selection_label, v_pred.outcome,''))),' ','_'),'.','_');

    IF v_pred.market::text = ANY(v_cards_markets) THEN
      IF v_home_cards IS NULL OR v_away_cards IS NULL THEN CONTINUE; END IF;
      v_total := v_home_cards + v_away_cards;
      CASE
        WHEN v_pred.market::text LIKE 'cards_over_under_%' THEN
          v_line := CASE v_pred.market::text
            WHEN 'cards_over_under_2_5' THEN 3
            WHEN 'cards_over_under_3_5' THEN 4
            WHEN 'cards_over_under_4_5' THEN 5
            WHEN 'cards_over_under_5_5' THEN 6 END;
          v_won := (v_selection LIKE 'OVER%'  AND v_total >= v_line)
                OR (v_selection LIKE 'UNDER%' AND v_total <  v_line);
        WHEN v_pred.market::text = 'home_cards_over_under_1_5' THEN
          v_won := (v_selection LIKE 'OVER%'  AND v_home_cards >= 2)
                OR (v_selection LIKE 'UNDER%' AND v_home_cards <  2);
        WHEN v_pred.market::text = 'away_cards_over_under_1_5' THEN
          v_won := (v_selection LIKE 'OVER%'  AND v_away_cards >= 2)
                OR (v_selection LIKE 'UNDER%' AND v_away_cards <  2);
      END CASE;
    ELSE
      IF v_home_corners IS NULL OR v_away_corners IS NULL THEN CONTINUE; END IF;
      v_total := v_home_corners + v_away_corners;
      CASE
        WHEN v_pred.market::text LIKE 'corners_over_under_%' THEN
          v_line := CASE v_pred.market::text
            WHEN 'corners_over_under_8_5'  THEN 9
            WHEN 'corners_over_under_9_5'  THEN 10
            WHEN 'corners_over_under_10_5' THEN 11
            WHEN 'corners_over_under_11_5' THEN 12 END;
          v_won := (v_selection LIKE 'OVER%'  AND v_total >= v_line)
                OR (v_selection LIKE 'UNDER%' AND v_total <  v_line);
        WHEN v_pred.market::text = 'home_corners_over_under_4_5' THEN
          v_won := (v_selection LIKE 'OVER%'  AND v_home_corners >= 5)
                OR (v_selection LIKE 'UNDER%' AND v_home_corners <  5);
        WHEN v_pred.market::text = 'away_corners_over_under_4_5' THEN
          v_won := (v_selection LIKE 'OVER%'  AND v_away_corners >= 5)
                OR (v_selection LIKE 'UNDER%' AND v_away_corners <  5);
      END CASE;
    END IF;

    v_new_status := CASE WHEN v_won THEN 'won' ELSE 'lost' END;
    IF v_new_status = v_pred.status::text THEN CONTINUE; END IF;

    v_old_gross := CASE v_pred.status::text
      WHEN 'won' THEN COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds)
      ELSE 0 END;
    v_new_gross := CASE v_new_status
      WHEN 'won' THEN COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds)
      ELSE 0 END;
    v_delta := v_new_gross - v_old_gross;
    v_reason := 'Auto-regrade cards/corners: stats revised for match '||p_match_id::text;
    v_txn := NULL;

    IF v_delta > 0 THEN
      SELECT txn_id INTO v_txn FROM public.wallet_apply_change(
        v_pred.user_id, 'credit'::public.wallet_txn_type, v_delta,
        'bet_settlement'::public.wallet_ref_type, v_pred.id, v_reason,
        COALESCE(v_m.is_simulation, false));
    ELSIF v_delta < 0 THEN
      SELECT txn_id INTO v_txn FROM public.wallet_apply_change(
        v_pred.user_id, 'debit'::public.wallet_txn_type, ABS(v_delta),
        'bet_settlement'::public.wallet_ref_type, v_pred.id, v_reason,
        COALESCE(v_m.is_simulation, false));
    END IF;

    UPDATE public.predictions
       SET status = v_new_status::public.prediction_status,
           settled_at = now(),
           settled_result = v_new_status||':'||v_pred.market::text||':regraded',
           points = CASE v_new_status WHEN 'won' THEN 3 ELSE 0 END
     WHERE id = v_pred.id;

    INSERT INTO public.audit_log(
      user_id, action, entity, entity_id, target_user_id, is_simulation, reason, metadata
    ) VALUES (
      NULL, 'settlement_auto_regrade', 'prediction', v_pred.id,
      v_pred.user_id, COALESCE(v_m.is_simulation, false), v_reason,
      jsonb_build_object(
        'match_id', p_match_id,
        'market', v_pred.market::text,
        'old_status', v_pred.status::text,
        'new_status', v_new_status,
        'wallet_txn_id', v_txn,
        'delta', v_delta,
        'home_corners', v_home_corners, 'away_corners', v_away_corners,
        'home_cards', v_home_cards, 'away_cards', v_away_cards
      )
    );

    INSERT INTO public.operational_alerts(category, severity, title, detail, metadata) VALUES (
      'settlement', 'high',
      'Cards/corners bet auto-regraded after stats revision',
      format('Prediction %s on match %s regraded %s -> %s (delta %s)',
             v_pred.id::text, p_match_id::text, v_pred.status::text, v_new_status, v_delta::text),
      jsonb_build_object(
        'match_id', p_match_id, 'prediction_id', v_pred.id,
        'user_id', v_pred.user_id, 'market', v_pred.market::text,
        'old_status', v_pred.status::text, 'new_status', v_new_status,
        'delta', v_delta
      )
    );

    prediction_id := v_pred.id;
    old_status    := v_pred.status::text;
    new_status    := v_new_status;
    delta         := v_delta;
    RETURN NEXT;
  END LOOP;
  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.regrade_cards_corners_for_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regrade_cards_corners_for_match(uuid) TO service_role;