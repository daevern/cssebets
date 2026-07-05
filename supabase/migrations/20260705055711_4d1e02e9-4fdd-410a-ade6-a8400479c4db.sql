-- Fix settle_cards_corners_for_match so it never grades cards/corners bets to LOST
-- using partial/in-play match_stats. If final stats aren't available yet, leave the
-- prediction pending; a later invocation (once post-match stats land) can grade it.
--
-- "Final stats" heuristic: match.status = 'finished' AND match_stats.fetched_at
-- for that side is >= match.updated_at - interval '2 minutes'. Otherwise the
-- corners/cards for that side are treated as unknown for grading purposes.

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
BEGIN
  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT corners, COALESCE(yellow_cards,0)+COALESCE(red_cards,0), fetched_at
    INTO v_home_corners_stat, v_home_cards_stat, v_home_fetched
    FROM public.match_stats WHERE match_id=p_match_id AND side='home';
  SELECT corners, COALESCE(yellow_cards,0)+COALESCE(red_cards,0), fetched_at
    INTO v_away_corners_stat, v_away_cards_stat, v_away_fetched
    FROM public.match_stats WHERE match_id=p_match_id AND side='away';

  -- Prefer explicit columns on matches; fall back to match_stats.
  v_home_corners := COALESCE(v_m.home_corners, v_home_corners_stat);
  v_away_corners := COALESCE(v_m.away_corners, v_away_corners_stat);
  v_home_cards   := COALESCE(v_m.home_cards,   v_home_cards_stat);
  v_away_cards   := COALESCE(v_m.away_cards,   v_away_cards_stat);

  -- Only trust match_stats if the match is finished AND the stats row was refreshed
  -- at/after the finish. Otherwise treat as unknown to avoid mis-grading on live snapshots.
  v_home_stats_fresh := (v_m.status = 'finished') AND (v_m.home_corners IS NOT NULL OR (v_home_fetched IS NOT NULL AND v_home_fetched >= COALESCE(v_m.updated_at, now()) - interval '2 minutes'));
  v_away_stats_fresh := (v_m.status = 'finished') AND (v_m.away_corners IS NOT NULL OR (v_away_fetched IS NOT NULL AND v_away_fetched >= COALESCE(v_m.updated_at, now()) - interval '2 minutes'));
  v_stats_fresh := v_home_stats_fresh AND v_away_stats_fresh;

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

    -- Skip if stats aren't final yet. This is the key change: never grade to LOST on
    -- partial live data. Leave pending; a later run will grade it once stats land.
    IF NOT v_stats_fresh THEN
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
            IF v_m.red_card_occurred IS NULL THEN v_void := true;
            ELSE
              v_won := (v_selection IN ('YES','Y','TRUE') AND v_m.red_card_occurred)
                    OR (v_selection IN ('NO','N','FALSE') AND NOT v_m.red_card_occurred);
            END IF;
          WHEN v_pred.market::text = 'first_card' THEN
            IF v_m.first_card_team IS NULL THEN v_void := true;
            ELSE v_won := v_selection = UPPER(v_m.first_card_team);
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

  RETURN v_count;
END $function$;

-- Data correction: two Canada v Morocco corner bets that were mis-graded to LOST
-- using a partial in-play match_stats snapshot. Final corners were 11+1=12, so
-- both OVER 9.5 and OVER 10.5 win. Flip predictions to won and credit the user's
-- wallet the full gross payout (stake x odds). Original stake was already debited
-- at placement, so credit is stake*odds, matching the normal win-path behaviour.
--
-- Bố Chiou (user 7357dc15-673e-4d32-9d50-841cc71a292b):
--   0c1452ad corners_over_under_9_5  OVER 183 @ 1.90 -> credit 347.70
--   5eba31f2 corners_over_under_10_5 OVER  50 @ 2.53 -> credit 126.50

DO $$
DECLARE
  v_sim boolean;
BEGIN
  SELECT COALESCE(is_simulation,false) INTO v_sim FROM public.matches
   WHERE id='99ca7642-76f5-4645-84bc-54026c95da8f';

  UPDATE public.predictions
     SET status='won', points=3, settled_at=now(),
         settled_result='won:corners_over_under_9_5',
         gross_payout = virtual_stake * reference_odds,
         net_profit = virtual_stake * reference_odds - virtual_stake,
         house_profit_loss = -(virtual_stake * reference_odds - virtual_stake)
   WHERE id='0c1452ad-26bb-4355-adad-bec01b97ec5a';
  PERFORM public.wallet_apply_change(
    '7357dc15-673e-4d32-9d50-841cc71a292b'::uuid,
    'credit'::public.wallet_txn_type,
    347.70,
    'bet_settlement'::public.wallet_ref_type,
    '0c1452ad-26bb-4355-adad-bec01b97ec5a'::uuid,
    'Manual regrade win payout (corners_over_under_9_5) - partial-stats bug fix',
    v_sim);

  UPDATE public.predictions
     SET status='won', points=3, settled_at=now(),
         settled_result='won:corners_over_under_10_5',
         gross_payout = virtual_stake * reference_odds,
         net_profit = virtual_stake * reference_odds - virtual_stake,
         house_profit_loss = -(virtual_stake * reference_odds - virtual_stake)
   WHERE id='5eba31f2-f621-4082-8748-7ca2f57bf17e';
  PERFORM public.wallet_apply_change(
    '7357dc15-673e-4d32-9d50-841cc71a292b'::uuid,
    'credit'::public.wallet_txn_type,
    126.50,
    'bet_settlement'::public.wallet_ref_type,
    '5eba31f2-f621-4082-8748-7ca2f57bf17e'::uuid,
    'Manual regrade win payout (corners_over_under_10_5) - partial-stats bug fix',
    v_sim);

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata)
  VALUES
    ('7357dc15-673e-4d32-9d50-841cc71a292b','prediction.regrade','prediction','0c1452ad-26bb-4355-adad-bec01b97ec5a',
     jsonb_build_object('reason','partial in-play stats caused LOST grade; final corners 12','payout',347.70)),
    ('7357dc15-673e-4d32-9d50-841cc71a292b','prediction.regrade','prediction','5eba31f2-f621-4082-8748-7ca2f57bf17e',
     jsonb_build_object('reason','partial in-play stats caused LOST grade; final corners 12','payout',126.50));
END $$;
