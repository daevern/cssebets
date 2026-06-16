
-- Match odds integrity columns
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS odds_status text NOT NULL DEFAULT 'trusted',
  ADD COLUMN IF NOT EXISTS suspended_markets text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;

-- Per-prediction flag set when its match/market is auto-suspended after placement
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS flagged_for_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_reason text;

-- Returns 'OK' or an exception code string; used by assert_betting_allowed
CREATE OR REPLACE FUNCTION public.check_match_market_betting(p_match_id uuid, p_market text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status text;
  v_suspended text[];
  v_override boolean;
  v_updated timestamptz;
  v_max_age int;
BEGIN
  SELECT odds_status, COALESCE(suspended_markets,'{}'::text[]), COALESCE(manual_override,false), odds_updated_at
    INTO v_status, v_suspended, v_override, v_updated
    FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN 'OK'; END IF;
  IF v_override THEN RETURN 'OK'; END IF;
  IF 'ALL' = ANY(v_suspended) OR p_market = ANY(v_suspended) THEN
    RETURN 'MARKET_SUSPENDED';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('trusted','') THEN
    IF v_status = 'stale' THEN RETURN 'ODDS_STALE';
    ELSIF v_status = 'missing' THEN RETURN 'ODDS_MISSING';
    ELSIF v_status = 'awaiting_sync' THEN RETURN 'ODDS_AWAITING_SYNC';
    ELSE RETURN 'ODDS_NOT_TRUSTED';
    END IF;
  END IF;
  SELECT COALESCE(max_odds_age_minutes, 15) INTO v_max_age FROM public.platform_settings WHERE id = 1;
  IF v_updated IS NULL THEN RETURN 'OK'; END IF;
  IF v_max_age > 0 AND v_updated < now() - (v_max_age || ' minutes')::interval THEN
    RETURN 'ODDS_STALE';
  END IF;
  RETURN 'OK';
END $$;

GRANT EXECUTE ON FUNCTION public.check_match_market_betting(uuid, text) TO authenticated, service_role;

-- Soft cap: enforce per-bet payout, per-outcome liability, per-match worst case
CREATE OR REPLACE FUNCTION public.assert_bet_within_liability_caps(
  p_match_id uuid, p_market text, p_selection text, p_stake numeric, p_odds numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_s public.platform_settings;
  v_potential numeric;
  v_outcome_liab numeric;
  v_match_worst numeric;
BEGIN
  SELECT * INTO v_s FROM public.platform_settings WHERE id = 1;
  IF v_s IS NULL THEN RETURN; END IF;

  v_potential := COALESCE(p_stake,0) * COALESCE(p_odds,0);

  IF COALESCE(v_s.max_single_bet_payout,0) > 0 AND v_potential > v_s.max_single_bet_payout THEN
    RAISE EXCEPTION 'MAX_SINGLE_BET_PAYOUT';
  END IF;

  IF COALESCE(v_s.max_high_odds_stake,0) > 0
     AND p_odds IS NOT NULL AND p_odds >= COALESCE(v_s.high_odds_threshold, 9999)
     AND p_stake > v_s.max_high_odds_stake THEN
    RAISE EXCEPTION 'HIGH_ODDS_STAKE_LIMIT';
  END IF;

  -- Liability if THIS selection wins: sum of potential_return for matching pending bets + this one
  IF COALESCE(v_s.max_single_outcome_liability,0) > 0 THEN
    SELECT COALESCE(SUM(potential_return),0) + v_potential
      INTO v_outcome_liab
      FROM public.predictions
      WHERE match_id = p_match_id
        AND market_text = p_market
        AND selection_label = p_selection
        AND status = 'pending'::public.prediction_status
        AND COALESCE(is_simulation,false) = false;
    IF v_outcome_liab > v_s.max_single_outcome_liability THEN
      RAISE EXCEPTION 'MAX_OUTCOME_LIABILITY';
    END IF;
  END IF;

  -- Correct-score "OTHER" extra cap
  IF p_market = 'correct_score' AND p_selection = 'OTHER'
     AND COALESCE(v_s.max_correct_score_other_liability,0) > 0
     AND v_outcome_liab IS NOT NULL
     AND v_outcome_liab > v_s.max_correct_score_other_liability THEN
    RAISE EXCEPTION 'CORRECT_SCORE_OTHER_LIMIT';
  END IF;

  -- Match worst-case
  IF COALESCE(v_s.max_match_worst_case_liability,0) > 0 THEN
    SELECT COALESCE(worst_case_exposure,0) INTO v_match_worst
      FROM public.matches WHERE id = p_match_id;
    IF v_match_worst + v_potential > v_s.max_match_worst_case_liability THEN
      RAISE EXCEPTION 'MAX_MATCH_LIABILITY';
    END IF;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.assert_bet_within_liability_caps(uuid, text, text, numeric, numeric) TO service_role;

-- Platform settings: ensure risk columns exist (idempotent)
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS max_odds_age_minutes int DEFAULT 15,
  ADD COLUMN IF NOT EXISTS odds_deviation_threshold_pct numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_single_bet_payout numeric DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS max_single_outcome_liability numeric DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS max_match_worst_case_liability numeric DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS max_correct_score_other_liability numeric DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS max_high_odds_stake numeric DEFAULT 20;

-- Scan open matches, set odds_status / suspended_markets, raise alerts, flag pending bets
CREATE OR REPLACE FUNCTION public.refresh_odds_status_for_open_matches()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_max_age int;
  r record;
  v_new_status text;
  v_was_trusted boolean;
BEGIN
  SELECT COALESCE(max_odds_age_minutes,15) INTO v_max_age FROM public.platform_settings WHERE id = 1;

  FOR r IN
    SELECT id, home_team, away_team, odds_updated_at, reference_odds, odds_status, suspended_markets, manual_override
      FROM public.matches
      WHERE status = 'scheduled'
        AND COALESCE(is_simulation,false) = false
        AND kickoff_at > now()
  LOOP
    IF COALESCE(r.manual_override,false) THEN
      CONTINUE;
    END IF;

    v_was_trusted := COALESCE(r.odds_status,'trusted') = 'trusted'
                     AND NOT ('ALL' = ANY(COALESCE(r.suspended_markets,'{}'::text[])));

    IF r.reference_odds IS NULL THEN
      v_new_status := 'missing';
    ELSIF r.odds_updated_at IS NULL THEN
      v_new_status := 'awaiting_sync';
    ELSIF v_max_age > 0 AND r.odds_updated_at < now() - (v_max_age || ' minutes')::interval THEN
      v_new_status := 'stale';
    ELSE
      v_new_status := 'trusted';
    END IF;

    IF v_new_status = 'trusted' THEN
      UPDATE public.matches
        SET odds_status = 'trusted',
            suspended_markets = '{}'::text[]
      WHERE id = r.id
        AND (odds_status <> 'trusted' OR array_length(suspended_markets,1) IS NOT NULL);
    ELSE
      UPDATE public.matches
        SET odds_status = v_new_status,
            suspended_markets = ARRAY['ALL']::text[]
      WHERE id = r.id
        AND (odds_status <> v_new_status
             OR NOT ('ALL' = ANY(COALESCE(suspended_markets,'{}'::text[]))));

      -- Flag any pending bets on this match for staff review (once)
      UPDATE public.predictions
        SET flagged_for_review = true,
            flagged_reason = v_new_status
      WHERE match_id = r.id
        AND status = 'pending'::public.prediction_status
        AND COALESCE(is_simulation,false) = false
        AND flagged_for_review = false;

      -- Raise an alert only on the transition trusted -> suspended
      IF v_was_trusted THEN
        INSERT INTO public.operational_alerts (severity, source, message, metadata)
        VALUES (
          'critical',
          'odds_integrity',
          'Match auto-suspended: ' || r.home_team || ' vs ' || r.away_team || ' (' || v_new_status || ')',
          jsonb_build_object('match_id', r.id, 'status', v_new_status)
        );
      END IF;
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.refresh_odds_status_for_open_matches() TO service_role;
