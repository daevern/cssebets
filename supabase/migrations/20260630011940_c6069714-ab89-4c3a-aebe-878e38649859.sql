
-- 1) Schema additions on matches for cards/corners stats
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_cards int,
  ADD COLUMN IF NOT EXISTS away_cards int,
  ADD COLUMN IF NOT EXISTS red_card_occurred boolean,
  ADD COLUMN IF NOT EXISTS first_card_team text,
  ADD COLUMN IF NOT EXISTS home_corners int,
  ADD COLUMN IF NOT EXISTS away_corners int,
  ADD COLUMN IF NOT EXISTS first_corner_team text,
  ADD COLUMN IF NOT EXISTS stats_status text NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_first_card_team_chk'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_first_card_team_chk
      CHECK (first_card_team IS NULL OR first_card_team IN ('HOME','AWAY','NONE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_first_corner_team_chk'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_first_corner_team_chk
      CHECK (first_corner_team IS NULL OR first_corner_team IN ('HOME','AWAY','NONE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_stats_status_chk'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_stats_status_chk
      CHECK (stats_status IN ('pending','available','unavailable'));
  END IF;
END $$;

-- 2) Allowlist new markets in place_market_bet_atomic
CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market text, p_selection text,
  p_stake numeric, p_client_request_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text; v_settings record; v_match record; v_sim boolean;
  v_odds numeric; v_potential numeric; v_existing uuid; v_pred_id uuid;
  v_market_enum public.prediction_market;
BEGIN
  v_caller := current_setting('request.jwt.claims', true)::jsonb->>'role';
  IF v_caller IS NOT NULL AND v_caller <> 'service_role' THEN
    PERFORM set_config('row_security','on', true);
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_market NOT IN (
    'over_under_0_5','over_under_1_5','over_under_2_5','over_under_3_5','over_under_4_5','over_under_5_5','over_under_6_5',
    'btts','correct_score','half_time_full_time','exact_total_goals','to_qualify',
    'double_chance','draw_no_bet','goals_odd_even',
    'clean_sheet_home','clean_sheet_away','win_to_nil_home','win_to_nil_away',
    -- Cards
    'cards_over_under_2_5','cards_over_under_3_5','cards_over_under_4_5','cards_over_under_5_5',
    'home_cards_over_under_1_5','away_cards_over_under_1_5',
    'red_card_match','first_card',
    -- Corners
    'corners_over_under_8_5','corners_over_under_9_5','corners_over_under_10_5','corners_over_under_11_5',
    'home_corners_over_under_4_5','away_corners_over_under_4_5',
    'first_corner'
  ) THEN
    RAISE EXCEPTION 'MARKET_DISABLED';
  END IF;
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL OR v_settings.max_potential_payout IS NULL OR v_settings.max_potential_payout <= 0 THEN
    RAISE EXCEPTION 'MAX_PAYOUT_NOT_CONFIGURED';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id = p_user_id AND match_id = p_match_id AND client_request_id = p_client_request_id;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;
  v_sim := COALESCE(v_match.is_simulation, false);
  SELECT odds INTO v_odds FROM public.match_market_odds
    WHERE match_id = p_match_id AND market = p_market AND selection = p_selection AND active = true;
  IF v_odds IS NULL AND v_sim THEN
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds INTO v_odds FROM public.match_market_odds
      WHERE match_id = p_match_id AND market = p_market AND selection = p_selection AND active = true;
  END IF;
  IF v_odds IS NULL THEN RAISE EXCEPTION 'ODDS_MISSING'; END IF;
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market, v_odds, v_sim);
  IF NOT v_sim THEN
    v_potential := p_stake * v_odds;
  ELSE
    v_potential := p_stake * v_odds;
  END IF;
  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  -- Resolve enum bucket (cards/corners → 'other')
  v_market_enum := CASE
    WHEN p_market LIKE 'over_under_%' OR p_market = 'goals_odd_even' THEN 'total_goals'::public.prediction_market
    WHEN p_market = 'btts' THEN 'btts'::public.prediction_market
    WHEN p_market = 'correct_score' THEN 'correct_score'::public.prediction_market
    WHEN p_market = 'half_time_full_time' THEN 'half_time_full_time'::public.prediction_market
    WHEN p_market = 'exact_total_goals' THEN 'total_goals'::public.prediction_market
    WHEN p_market = 'to_qualify' THEN 'tournament_winner'::public.prediction_market
    ELSE 'match_winner'::public.prediction_market
  END;

  INSERT INTO public.predictions(
    user_id, match_id, market, selection, stake, odds, potential_payout,
    status, client_request_id, prediction_market
  ) VALUES (
    p_user_id, p_match_id, p_market, p_selection, p_stake, v_odds, v_potential,
    'pending', p_client_request_id, v_market_enum
  )
  RETURNING id INTO v_pred_id;

  PERFORM public.debit_user_for_bet(p_user_id, p_match_id, v_pred_id, p_stake);
  RETURN v_pred_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'DUPLICATE_REQUEST: one bet per market per match allowed';
END $function$;

-- 3) Extend seeding with cards/corners derived defaults
CREATE OR REPLACE FUNCTION public.seed_cards_corners_odds(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_margin numeric;
  v_mu_cards numeric := 4.0;  -- WC avg total cards
  v_mu_corners numeric := 10.0;
  v_p numeric;
  v_lines numeric[] := ARRAY[2.5,3.5,4.5,5.5];
  v_corner_lines numeric[] := ARRAY[8.5,9.5,10.5,11.5];
  v_line numeric;
  v_key text;
  v_sel_over text; v_sel_under text;
BEGIN
  SELECT COALESCE(margin_pct, 7.0) INTO v_margin FROM public.platform_settings WHERE id = 1;

  -- helper inline: probability of poisson >= ceil(line) using existing poisson_pmf
  -- Total cards O/U
  FOREACH v_line IN ARRAY v_lines LOOP
    v_p := 0;
    FOR i IN CEIL(v_line)::int..20 LOOP
      v_p := v_p + public.poisson_pmf(v_mu_cards, i);
    END LOOP;
    v_key := 'cards_over_under_' || replace(v_line::text, '.', '_');
    v_sel_over := 'OVER_' || replace(v_line::text, '.', '_');
    v_sel_under := 'UNDER_' || replace(v_line::text, '.', '_');
    INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source)
    VALUES
      (p_match_id, v_key, v_sel_over,  ROUND(((1.0/GREATEST(v_p,0.02))   * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards'),
      (p_match_id, v_key, v_sel_under, ROUND(((1.0/GREATEST(1-v_p,0.02)) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards')
    ON CONFLICT (match_id, market, selection) DO NOTHING;
  END LOOP;

  -- Per-team cards O/U 1.5 (split mu in half)
  FOR i IN 0..1 LOOP
    DECLARE
      v_team text := CASE i WHEN 0 THEN 'home' ELSE 'away' END;
      v_mu_t numeric := v_mu_cards / 2.0;
      v_pt numeric := 0;
    BEGIN
      FOR k IN 2..20 LOOP v_pt := v_pt + public.poisson_pmf(v_mu_t, k); END LOOP;
      v_key := v_team || '_cards_over_under_1_5';
      INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source)
      VALUES
        (p_match_id, v_key, 'OVER_1_5',  ROUND(((1.0/GREATEST(v_pt,0.02))   * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards'),
        (p_match_id, v_key, 'UNDER_1_5', ROUND(((1.0/GREATEST(1-v_pt,0.02)) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards')
      ON CONFLICT (match_id, market, selection) DO NOTHING;
    END;
  END LOOP;

  -- Red card yes/no — WC base rate ~ 12%
  INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source)
  VALUES
    (p_match_id, 'red_card_match', 'YES', ROUND(((1.0/0.12) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards'),
    (p_match_id, 'red_card_match', 'NO',  ROUND(((1.0/0.88) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards')
  ON CONFLICT (match_id, market, selection) DO NOTHING;

  -- First card: HOME 0.48 / AWAY 0.48 / NONE 0.04
  INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source)
  VALUES
    (p_match_id, 'first_card', 'HOME', ROUND(((1.0/0.48) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards'),
    (p_match_id, 'first_card', 'AWAY', ROUND(((1.0/0.48) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards'),
    (p_match_id, 'first_card', 'NONE', ROUND(((1.0/0.04) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_cards')
  ON CONFLICT (match_id, market, selection) DO NOTHING;

  -- Total corners O/U
  FOREACH v_line IN ARRAY v_corner_lines LOOP
    v_p := 0;
    FOR i IN CEIL(v_line)::int..40 LOOP
      v_p := v_p + public.poisson_pmf(v_mu_corners, i);
    END LOOP;
    v_key := 'corners_over_under_' || replace(v_line::text, '.', '_');
    v_sel_over := 'OVER_' || replace(v_line::text, '.', '_');
    v_sel_under := 'UNDER_' || replace(v_line::text, '.', '_');
    INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source)
    VALUES
      (p_match_id, v_key, v_sel_over,  ROUND(((1.0/GREATEST(v_p,0.02))   * (1 - v_margin/100.0))::numeric, 2), true, 'derived_corners'),
      (p_match_id, v_key, v_sel_under, ROUND(((1.0/GREATEST(1-v_p,0.02)) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_corners')
    ON CONFLICT (match_id, market, selection) DO NOTHING;
  END LOOP;

  -- Per-team corners O/U 4.5
  FOR i IN 0..1 LOOP
    DECLARE
      v_team text := CASE i WHEN 0 THEN 'home' ELSE 'away' END;
      v_mu_t numeric := v_mu_corners / 2.0;
      v_pt numeric := 0;
    BEGIN
      FOR k IN 5..40 LOOP v_pt := v_pt + public.poisson_pmf(v_mu_t, k); END LOOP;
      v_key := v_team || '_corners_over_under_4_5';
      INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source)
      VALUES
        (p_match_id, v_key, 'OVER_4_5',  ROUND(((1.0/GREATEST(v_pt,0.02))   * (1 - v_margin/100.0))::numeric, 2), true, 'derived_corners'),
        (p_match_id, v_key, 'UNDER_4_5', ROUND(((1.0/GREATEST(1-v_pt,0.02)) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_corners')
      ON CONFLICT (match_id, market, selection) DO NOTHING;
    END;
  END LOOP;

  -- First corner
  INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source)
  VALUES
    (p_match_id, 'first_corner', 'HOME', ROUND(((1.0/0.49) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_corners'),
    (p_match_id, 'first_corner', 'AWAY', ROUND(((1.0/0.49) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_corners'),
    (p_match_id, 'first_corner', 'NONE', ROUND(((1.0/0.02) * (1 - v_margin/100.0))::numeric, 2), true, 'derived_corners')
  ON CONFLICT (match_id, market, selection) DO NOTHING;
END $$;

-- 4) Settlement function for cards/corners — voids if stats missing
CREATE OR REPLACE FUNCTION public.settle_cards_corners_for_match(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      AND (market = ANY(v_cards_markets) OR market = ANY(v_corners_markets))
    FOR UPDATE
  LOOP
    v_void := false; v_won := false; v_payout := 0;

    -- CARDS markets
    IF v_pred.market = ANY(v_cards_markets) THEN
      IF v_m.home_cards IS NULL OR v_m.away_cards IS NULL THEN
        v_void := true;
      ELSE
        v_total := v_m.home_cards + v_m.away_cards;
        CASE
          WHEN v_pred.market LIKE 'cards_over_under_%' THEN
            v_line := CASE v_pred.market
              WHEN 'cards_over_under_2_5' THEN 3
              WHEN 'cards_over_under_3_5' THEN 4
              WHEN 'cards_over_under_4_5' THEN 5
              WHEN 'cards_over_under_5_5' THEN 6 END;
            v_won := (v_pred.selection LIKE 'OVER_%' AND v_total >= v_line)
                  OR (v_pred.selection LIKE 'UNDER_%' AND v_total < v_line);
          WHEN v_pred.market = 'home_cards_over_under_1_5' THEN
            v_won := (v_pred.selection = 'OVER_1_5'  AND v_m.home_cards >= 2)
                  OR (v_pred.selection = 'UNDER_1_5' AND v_m.home_cards <  2);
          WHEN v_pred.market = 'away_cards_over_under_1_5' THEN
            v_won := (v_pred.selection = 'OVER_1_5'  AND v_m.away_cards >= 2)
                  OR (v_pred.selection = 'UNDER_1_5' AND v_m.away_cards <  2);
          WHEN v_pred.market = 'red_card_match' THEN
            IF v_m.red_card_occurred IS NULL THEN v_void := true;
            ELSE
              v_won := (v_pred.selection = 'YES' AND v_m.red_card_occurred)
                    OR (v_pred.selection = 'NO'  AND NOT v_m.red_card_occurred);
            END IF;
          WHEN v_pred.market = 'first_card' THEN
            IF v_m.first_card_team IS NULL THEN v_void := true;
            ELSE v_won := v_pred.selection = v_m.first_card_team;
            END IF;
        END CASE;
      END IF;
    END IF;

    -- CORNERS markets
    IF v_pred.market = ANY(v_corners_markets) THEN
      IF v_m.home_corners IS NULL OR v_m.away_corners IS NULL THEN
        v_void := true;
      ELSE
        v_total := v_m.home_corners + v_m.away_corners;
        CASE
          WHEN v_pred.market LIKE 'corners_over_under_%' THEN
            v_line := CASE v_pred.market
              WHEN 'corners_over_under_8_5' THEN 9
              WHEN 'corners_over_under_9_5' THEN 10
              WHEN 'corners_over_under_10_5' THEN 11
              WHEN 'corners_over_under_11_5' THEN 12 END;
            v_won := (v_pred.selection LIKE 'OVER_%' AND v_total >= v_line)
                  OR (v_pred.selection LIKE 'UNDER_%' AND v_total < v_line);
          WHEN v_pred.market = 'home_corners_over_under_4_5' THEN
            v_won := (v_pred.selection = 'OVER_4_5'  AND v_m.home_corners >= 5)
                  OR (v_pred.selection = 'UNDER_4_5' AND v_m.home_corners <  5);
          WHEN v_pred.market = 'away_corners_over_under_4_5' THEN
            v_won := (v_pred.selection = 'OVER_4_5'  AND v_m.away_corners >= 5)
                  OR (v_pred.selection = 'UNDER_4_5' AND v_m.away_corners <  5);
          WHEN v_pred.market = 'first_corner' THEN
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
      -- refund stake to user
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
END $$;

-- 5) Stub safe-refund helper if not already present (idempotent best-effort)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'credit_user_void_refund' AND pronamespace = 'public'::regnamespace) THEN
    CREATE OR REPLACE FUNCTION public.credit_user_void_refund(p_user uuid, p_match uuid, p_pred uuid, p_amount numeric)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
    BEGIN
      -- credit wallet
      UPDATE public.wallets SET points_balance = points_balance + p_amount, updated_at = now()
        WHERE user_id = p_user;
      INSERT INTO public.wallet_transactions(user_id, amount, type, reference_id, match_id, metadata)
      VALUES (p_user, p_amount, 'refund', p_pred, p_match, jsonb_build_object('reason','bet_void'));
    END $f$;
  END IF;
END $$;

-- 6) Risk: include cards/corners into existing correlation groups (cards_total, corners_total)
UPDATE public.platform_settings
SET correlation_groups = correlation_groups
  || jsonb_build_object(
       'cards_up', jsonb_build_array(
         'cards_over_under_2_5:OVER_2_5','cards_over_under_3_5:OVER_3_5',
         'cards_over_under_4_5:OVER_4_5','cards_over_under_5_5:OVER_5_5',
         'home_cards_over_under_1_5:OVER_1_5','away_cards_over_under_1_5:OVER_1_5',
         'red_card_match:YES'
       ),
       'cards_down', jsonb_build_array(
         'cards_over_under_2_5:UNDER_2_5','cards_over_under_3_5:UNDER_3_5',
         'cards_over_under_4_5:UNDER_4_5','cards_over_under_5_5:UNDER_5_5',
         'home_cards_over_under_1_5:UNDER_1_5','away_cards_over_under_1_5:UNDER_1_5',
         'red_card_match:NO'
       ),
       'corners_up', jsonb_build_array(
         'corners_over_under_8_5:OVER_8_5','corners_over_under_9_5:OVER_9_5',
         'corners_over_under_10_5:OVER_10_5','corners_over_under_11_5:OVER_11_5',
         'home_corners_over_under_4_5:OVER_4_5','away_corners_over_under_4_5:OVER_4_5'
       ),
       'corners_down', jsonb_build_array(
         'corners_over_under_8_5:UNDER_8_5','corners_over_under_9_5:UNDER_9_5',
         'corners_over_under_10_5:UNDER_10_5','corners_over_under_11_5:UNDER_11_5',
         'home_corners_over_under_4_5:UNDER_4_5','away_corners_over_under_4_5:UNDER_4_5'
       )
     )
WHERE id = 1;

-- 7) Hook into the full-match settlement so cards/corners get processed automatically
CREATE OR REPLACE FUNCTION public.settle_match_all_markets_atomic(
  p_match_id uuid, p_home integer, p_away integer,
  p_home_ht integer DEFAULT NULL::integer, p_away_ht integer DEFAULT NULL::integer,
  p_qualifier text DEFAULT NULL::text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count int := 0;
BEGIN
  v_count := v_count + public.settle_new_markets_for_match(p_match_id, p_home, p_away, p_home_ht, p_away_ht);
  IF p_qualifier IS NOT NULL THEN
    v_count := v_count + public.settle_to_qualify_for_match(p_match_id, p_qualifier);
  END IF;
  v_count := v_count + public.settle_cards_corners_for_match(p_match_id);
  RETURN v_count;
END $$;
