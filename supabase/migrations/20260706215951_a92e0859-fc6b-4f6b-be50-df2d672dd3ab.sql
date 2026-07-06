
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS cards_corners_void_after_hours integer NOT NULL DEFAULT 6;

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
  v_home_stats_fresh boolean := false;
  v_away_stats_fresh boolean := false;
  v_stats_fresh boolean := false;
  v_selection text;
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
  v_home_fetched timestamptz;
  v_away_fetched timestamptz;
  v_home_corners_stat int;
  v_away_corners_stat int;
  v_home_cards_stat int;
  v_away_cards_stat int;
  v_red_occurred boolean;
  v_first_card_team text;
  v_events_present boolean;
  v_freshness_anchor timestamptz;
  v_void_after_hours int;
  v_stale boolean := false;
  v_void_alerts_batch jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT corners, COALESCE(yellow_cards,0)+COALESCE(red_cards,0), fetched_at
    INTO v_home_corners_stat, v_home_cards_stat, v_home_fetched
    FROM public.match_stats WHERE match_id=p_match_id AND side='home';
  SELECT corners, COALESCE(yellow_cards,0)+COALESCE(red_cards,0), fetched_at
    INTO v_away_corners_stat, v_away_cards_stat, v_away_fetched
    FROM public.match_stats WHERE match_id=p_match_id AND side='away';

  v_home_corners := COALESCE(v_m.home_corners, v_home_corners_stat);
  v_away_corners := COALESCE(v_m.away_corners, v_away_corners_stat);
  v_home_cards   := COALESCE(v_m.home_cards,   v_home_cards_stat);
  v_away_cards   := COALESCE(v_m.away_cards,   v_away_cards_stat);

  v_freshness_anchor := COALESCE(v_m.kickoff_at, v_m.updated_at, now());

  v_home_stats_fresh := (v_m.status = 'finished') AND (
    v_m.home_corners IS NOT NULL
    OR (v_home_fetched IS NOT NULL AND v_home_fetched >= v_freshness_anchor)
  );
  v_away_stats_fresh := (v_m.status = 'finished') AND (
    v_m.away_corners IS NOT NULL
    OR (v_away_fetched IS NOT NULL AND v_away_fetched >= v_freshness_anchor)
  );
  v_stats_fresh := v_home_stats_fresh AND v_away_stats_fresh;

  -- Safety net: if stats never arrive within N hours after the match finished,
  -- auto-void pending card/corner bets (refund stakes) instead of leaving them
  -- stuck as PENDING forever.
  SELECT cards_corners_void_after_hours INTO v_void_after_hours
    FROM public.platform_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  v_void_after_hours := COALESCE(v_void_after_hours, 6);

  v_stale := (v_m.status = 'finished')
         AND v_m.finished_at IS NOT NULL
         AND (v_m.finished_at + make_interval(hours => v_void_after_hours)) <= now()
         AND NOT v_stats_fresh;

  SELECT EXISTS (
    SELECT 1 FROM public.match_events
     WHERE match_id = p_match_id AND type = 'Card' AND detail ILIKE '%Red%'
  ) INTO v_red_occurred;

  SELECT side INTO v_first_card_team
    FROM public.match_events
   WHERE match_id = p_match_id AND type = 'Card' AND side IS NOT NULL
   ORDER BY COALESCE(minute, 0) ASC, COALESCE(extra_minute, 0) ASC
   LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.match_events
     WHERE match_id = p_match_id
       AND created_at >= v_freshness_anchor
  ) INTO v_events_present;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id = p_match_id AND status = 'pending'
      AND (market::text = ANY(v_cards_markets) OR market::text = ANY(v_corners_markets))
    FOR UPDATE
  LOOP
    v_void := false; v_won := false; v_payout := 0;
    v_selection := UPPER(TRIM(COALESCE(v_pred.selection_label, v_pred.outcome, '')));
    v_selection := REPLACE(v_selection, ' ', '_');
    v_selection := REPLACE(v_selection, '.', '_');

    IF NOT v_stats_fresh THEN
      IF v_stale THEN
        -- Auto-void: refund stake, mark void_stale
        UPDATE public.predictions
           SET status='void', points=0, settled_at=now(),
               settled_result='void_stale:'||v_pred.market::text
         WHERE id=v_pred.id;
        PERFORM public.wallet_apply_change(
          v_pred.user_id,'credit'::public.wallet_txn_type, v_pred.virtual_stake,
          'bet_settlement'::public.wallet_ref_type, v_pred.id,
          'Void refund — stats unavailable ('||v_pred.market::text||')',
          COALESCE(v_m.is_simulation,false));
        v_void_alerts_batch := v_void_alerts_batch || jsonb_build_object(
          'prediction_id', v_pred.id,
          'user_id', v_pred.user_id,
          'market', v_pred.market::text,
          'stake', v_pred.virtual_stake
        );
        v_count := v_count + 1;
      END IF;
      CONTINUE;
    END IF;

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
            v_won := (v_selection LIKE 'OVER%' AND v_total >= v_line)
                  OR (v_selection LIKE 'UNDER%' AND v_total < v_line);
          WHEN v_pred.market::text = 'home_cards_over_under_1_5' THEN
            v_won := (v_selection LIKE 'OVER%'  AND v_home_cards >= 2)
                  OR (v_selection LIKE 'UNDER%' AND v_home_cards <  2);
          WHEN v_pred.market::text = 'away_cards_over_under_1_5' THEN
            v_won := (v_selection LIKE 'OVER%'  AND v_away_cards >= 2)
                  OR (v_selection LIKE 'UNDER%' AND v_away_cards <  2);
          WHEN v_pred.market::text = 'red_card_match' THEN
            IF NOT v_events_present THEN
              CONTINUE;
            END IF;
            v_won := (v_selection IN ('YES','Y','TRUE') AND v_red_occurred)
                  OR (v_selection IN ('NO','N','FALSE') AND NOT v_red_occurred);
          WHEN v_pred.market::text = 'first_card' THEN
            IF NOT v_events_present THEN
              CONTINUE;
            END IF;
            IF v_first_card_team IS NULL THEN
              v_void := true;
            ELSE
              v_won := v_selection = UPPER(v_first_card_team);
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
            v_won := (v_selection LIKE 'OVER%' AND v_total >= v_line)
                  OR (v_selection LIKE 'UNDER%' AND v_total < v_line);
          WHEN v_pred.market::text = 'home_corners_over_under_4_5' THEN
            v_won := (v_selection LIKE 'OVER%'  AND v_home_corners >= 5)
                  OR (v_selection LIKE 'UNDER%' AND v_home_corners <  5);
          WHEN v_pred.market::text = 'away_corners_over_under_4_5' THEN
            v_won := (v_selection LIKE 'OVER%'  AND v_away_corners >= 5)
                  OR (v_selection LIKE 'UNDER%' AND v_away_corners <  5);
          WHEN v_pred.market::text = 'first_corner' THEN
            IF v_m.first_corner_team IS NULL THEN v_void := true;
            ELSE v_won := v_selection = UPPER(v_m.first_corner_team);
            END IF;
        END CASE;
      END IF;
    END IF;

    IF v_void THEN
      UPDATE public.predictions
         SET status='void', points=0, settled_at=now(),
             settled_result='void:'||v_pred.market::text
       WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type, v_pred.virtual_stake,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Void refund ('||v_pred.market::text||')', COALESCE(v_m.is_simulation,false));
      v_count := v_count + 1;
    ELSIF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions SET status='won', points=3, settled_at=now(),
        settled_result='won:'||v_pred.market::text WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
        'bet_settlement'::public.wallet_ref_type,v_pred.id,'Win payout ('||v_pred.market::text||')', COALESCE(v_m.is_simulation,false));
      v_count := v_count + 1;
    ELSE
      UPDATE public.predictions SET status='lost', points=0, settled_at=now(),
        settled_result='lost:'||v_pred.market::text WHERE id=v_pred.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_void_alerts_batch) > 0 THEN
    INSERT INTO public.operational_alerts (category, severity, title, detail, metadata)
    VALUES (
      'settlement', 'medium',
      'Cards/corners bets auto-voided (stats unavailable)',
      format('%s: %s pending card/corner bets auto-voided after %s h — stats never arrived from provider.',
        v_m.home_team || ' vs ' || v_m.away_team,
        jsonb_array_length(v_void_alerts_batch),
        v_void_after_hours),
      jsonb_build_object(
        'match_id', p_match_id,
        'finished_at', v_m.finished_at,
        'void_after_hours', v_void_after_hours,
        'voided', v_void_alerts_batch
      )
    );
  END IF;

  RETURN v_count;
END $function$;
