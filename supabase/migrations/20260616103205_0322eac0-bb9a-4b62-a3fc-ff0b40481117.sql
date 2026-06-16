
CREATE OR REPLACE FUNCTION public.check_match_market_betting(p_match_id uuid, p_market text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status text; v_suspended text[]; v_override boolean;
  v_updated timestamptz; v_ref jsonb; v_max_age int;
BEGIN
  SELECT odds_status, COALESCE(suspended_markets,'{}'::text[]),
         COALESCE(manual_override,false), odds_updated_at, reference_odds
    INTO v_status, v_suspended, v_override, v_updated, v_ref
    FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN 'OK'; END IF;
  IF v_override THEN RETURN 'OK'; END IF;
  IF 'ALL' = ANY(v_suspended) OR p_market = ANY(v_suspended) THEN
    RETURN 'MARKET_SUSPENDED';
  END IF;
  IF v_ref IS NULL THEN RETURN 'ODDS_MISSING'; END IF;
  IF v_updated IS NULL THEN RETURN 'ODDS_AWAITING_SYNC'; END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('trusted','') THEN
    IF v_status = 'stale' THEN RETURN 'ODDS_STALE';
    ELSIF v_status = 'missing' THEN RETURN 'ODDS_MISSING';
    ELSIF v_status = 'awaiting_sync' THEN RETURN 'ODDS_AWAITING_SYNC';
    ELSE RETURN 'ODDS_NOT_TRUSTED';
    END IF;
  END IF;
  SELECT COALESCE(max_odds_age_minutes, 15) INTO v_max_age FROM public.platform_settings WHERE id = 1;
  IF v_max_age > 0 AND v_updated < now() - (v_max_age || ' minutes')::interval THEN
    RETURN 'ODDS_STALE';
  END IF;
  RETURN 'OK';
END $$;
GRANT EXECUTE ON FUNCTION public.check_match_market_betting(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_odds_status_for_open_matches()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_max_age int; r record; v_new_status text; v_was_trusted boolean;
BEGIN
  SELECT COALESCE(max_odds_age_minutes,15) INTO v_max_age FROM public.platform_settings WHERE id = 1;
  FOR r IN
    SELECT id, home_team, away_team, odds_updated_at, reference_odds, odds_status, suspended_markets, manual_override
      FROM public.matches
     WHERE status = 'scheduled' AND COALESCE(is_simulation,false) = false AND kickoff_at > now()
  LOOP
    IF COALESCE(r.manual_override,false) THEN CONTINUE; END IF;
    v_was_trusted := COALESCE(r.odds_status,'trusted') = 'trusted'
                     AND NOT ('ALL' = ANY(COALESCE(r.suspended_markets,'{}'::text[])));
    IF r.reference_odds IS NULL THEN v_new_status := 'missing';
    ELSIF r.odds_updated_at IS NULL THEN v_new_status := 'awaiting_sync';
    ELSIF v_max_age > 0 AND r.odds_updated_at < now() - (v_max_age || ' minutes')::interval THEN v_new_status := 'stale';
    ELSE v_new_status := 'trusted';
    END IF;
    IF v_new_status = 'trusted' THEN
      UPDATE public.matches SET odds_status='trusted', suspended_markets='{}'::text[]
       WHERE id=r.id AND (odds_status<>'trusted' OR array_length(suspended_markets,1) IS NOT NULL);
    ELSE
      UPDATE public.matches SET odds_status=v_new_status, suspended_markets=ARRAY['ALL']::text[]
       WHERE id=r.id AND (odds_status<>v_new_status OR NOT ('ALL'=ANY(COALESCE(suspended_markets,'{}'::text[]))));
      UPDATE public.predictions SET flagged_for_review=true, flagged_reason=v_new_status
       WHERE match_id=r.id AND status='pending'::public.prediction_status
         AND COALESCE(is_simulation,false)=false AND flagged_for_review=false;
      IF v_was_trusted THEN
        INSERT INTO public.operational_alerts (level, category, title, message, metadata)
        VALUES ('critical','odds_integrity',
                'Match auto-suspended (' || v_new_status || ')',
                r.home_team || ' vs ' || r.away_team || ' suspended: ' || v_new_status,
                jsonb_build_object('match_id', r.id, 'status', v_new_status,
                                   'home_team', r.home_team, 'away_team', r.away_team));
      END IF;
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_odds_status_for_open_matches() TO service_role;

CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market prediction_market, p_outcome text,
  p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL::uuid,
  p_cap_pct numeric DEFAULT NULL::numeric, p_client_request_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
  v_sim BOOLEAN := false; v_row_id INT := 1; v_existing UUID;
  v_settings public.platform_settings; v_cap_pct NUMERIC; v_caller text;
BEGIN
  v_caller := current_setting('request.jwt.claim.role', true);
  IF v_caller IS NOT NULL AND v_caller <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: place_bet_atomic is service-role only';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds IS NULL OR p_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL OR v_settings.max_potential_payout IS NULL OR v_settings.max_potential_payout <= 0 THEN
    RAISE EXCEPTION 'MAX_PAYOUT_NOT_CONFIGURED';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id=p_user_id AND client_request_id=p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;
  v_potential := ROUND(p_stake * p_odds, 2);
  IF p_match_id IS NOT NULL THEN
    SELECT id,kickoff_at,status,is_simulation INTO v_match
      FROM public.matches WHERE id=p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
    v_sim := COALESCE(v_match.is_simulation, false);
    v_row_id := CASE WHEN v_sim THEN 2 ELSE 1 END;
  END IF;
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market::text, p_odds, v_sim);
  IF NOT v_sim AND p_match_id IS NOT NULL THEN
    PERFORM public.assert_bet_within_liability_caps(p_match_id, p_market::text, p_outcome, p_stake, p_odds);
  END IF;
  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;
  SELECT balance INTO v_bankroll FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;
  v_cap_pct := COALESCE(p_cap_pct, v_settings.exposure_cap_pct, 1.0);
  IF v_cap_pct <= 0 OR v_cap_pct > 1 THEN v_cap_pct := 1.0; END IF;
  IF NOT v_sim AND p_match_id IS NOT NULL
     AND p_market = 'result'::public.prediction_market
     AND p_outcome IN ('HOME','DRAW','AWAY') THEN
    SELECT
      COALESCE(SUM(CASE WHEN outcome='HOME' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='DRAW' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='AWAY' THEN virtual_stake*reference_odds ELSE 0 END),0)
      INTO v_h,v_d,v_a
      FROM public.predictions
     WHERE match_id=p_match_id AND market='result'::public.prediction_market
       AND status='pending'::public.prediction_status;
    IF p_outcome='HOME' THEN v_h := v_h + v_potential;
    ELSIF p_outcome='DRAW' THEN v_d := v_d + v_potential;
    ELSE v_a := v_a + v_potential; END IF;
    v_new_worst := GREATEST(v_h, v_d, v_a);
    SELECT COALESCE(SUM(worst_case_exposure),0) INTO v_other_sum
      FROM public.matches WHERE id <> p_match_id AND is_simulation = false;
    IF (v_bankroll * v_cap_pct) < (v_other_sum + v_new_worst) THEN
      RAISE EXCEPTION 'MAX_EXPOSURE_REACHED';
    END IF;
  END IF;
  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type,p_stake,
    'bet_placement'::public.wallet_ref_type,gen_random_uuid(),'Bet placed (stake_debit)', v_sim);
  BEGIN
    INSERT INTO public.predictions(
      user_id,match_id,market,outcome,reference_odds,
      reference_odds_snapshot_id,virtual_stake,potential_return,is_simulation,client_request_id)
     VALUES (p_user_id,p_match_id,p_market,p_outcome,p_odds,p_snapshot_id,p_stake,v_potential,v_sim,p_client_request_id)
     RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST';
  END;
  IF p_match_id IS NOT NULL THEN
    PERFORM public.pool_apply_change(
      p_match_id,p_outcome,p_stake,'stake_held',v_pred_id,p_user_id,'Stake held in match pool');
    PERFORM public.recalc_match_liabilities(p_match_id);
  ELSE
    PERFORM public.platform_apply_change(
      'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, NULL,
      'Stake collected (no-match bet)', v_sim);
  END IF;
  RETURN v_pred_id;
END $function$;
REVOKE ALL ON FUNCTION public.place_bet_atomic(uuid,uuid,prediction_market,text,numeric,numeric,uuid,numeric,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_bet_atomic(uuid,uuid,prediction_market,text,numeric,numeric,uuid,numeric,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market text, p_selection text,
  p_stake numeric, p_client_request_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_pred_id uuid; v_existing uuid; v_odds numeric; v_potential numeric;
  v_match RECORD; v_sim boolean; v_settings public.platform_settings; v_snap_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_market NOT IN ('over_under_2_5','btts','correct_score','half_time_full_time','exact_total_goals') THEN
    RAISE EXCEPTION 'unsupported market %', p_market;
  END IF;
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL OR v_settings.max_potential_payout IS NULL OR v_settings.max_potential_payout <= 0 THEN
    RAISE EXCEPTION 'MAX_PAYOUT_NOT_CONFIGURED';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id=p_user_id AND client_request_id=p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;
  SELECT id,kickoff_at,status,is_simulation INTO v_match
    FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status::text <> 'scheduled' OR v_match.kickoff_at <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;
  v_sim := COALESCE(v_match.is_simulation, false);
  SELECT odds INTO v_odds FROM public.match_market_odds
    WHERE match_id=p_match_id AND market=p_market AND selection=p_selection AND active=true LIMIT 1;
  IF v_odds IS NULL AND v_sim THEN
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds INTO v_odds FROM public.match_market_odds
      WHERE match_id=p_match_id AND market=p_market AND selection=p_selection AND active=true LIMIT 1;
  END IF;
  IF v_odds IS NULL THEN RAISE EXCEPTION 'ODDS_MISSING'; END IF;
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market, v_odds, v_sim);
  IF NOT v_sim THEN
    PERFORM public.assert_bet_within_liability_caps(p_match_id, p_market, p_selection, p_stake, v_odds);
  END IF;
  v_potential := ROUND(p_stake * v_odds, 2);
  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;
  INSERT INTO public.market_odds_snapshots(match_id, market, selection, odds, source)
    VALUES (p_match_id, p_market, p_selection, v_odds, 'internal')
    RETURNING id INTO v_snap_id;
  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type, p_stake,
    'bet_placement'::public.wallet_ref_type, gen_random_uuid(),
    'Bet placed ('||p_market||')', v_sim);
  BEGIN
    INSERT INTO public.predictions(
      user_id, match_id, market, outcome,
      reference_odds, reference_odds_snapshot_id, virtual_stake, potential_return,
      is_simulation, client_request_id, market_text, selection_label)
    VALUES (
      p_user_id, p_match_id,
      CASE p_market
        WHEN 'over_under_2_5' THEN 'total_goals'::public.prediction_market
        WHEN 'btts' THEN 'btts'::public.prediction_market
        WHEN 'correct_score' THEN 'correct_score'::public.prediction_market
        WHEN 'half_time_full_time' THEN 'first_scorer'::public.prediction_market
        WHEN 'exact_total_goals' THEN 'group_winner'::public.prediction_market
      END,
      p_market || ':' || p_selection,
      v_odds, NULL, p_stake, v_potential,
      v_sim, p_client_request_id, p_market, p_selection
    ) RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: one bet per market per match allowed';
  END;
  PERFORM public.platform_apply_change(
    'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, p_match_id,
    'Stake collected ('||p_market||')', v_sim);
  RETURN v_pred_id;
END $function$;
REVOKE ALL ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid, uuid, text, text, numeric, uuid)
  TO service_role;

SELECT public.refresh_odds_status_for_open_matches();

WITH targets AS (
  SELECT id, home_team, away_team,
         CASE
           WHEN reference_odds IS NULL THEN 'missing'
           WHEN odds_updated_at IS NULL THEN 'awaiting_sync'
           ELSE NULL
         END AS new_status
    FROM public.matches
   WHERE status = 'scheduled'
     AND COALESCE(is_simulation, false) = false
     AND COALESCE(manual_override, false) = false
     AND (reference_odds IS NULL OR odds_updated_at IS NULL)
), upd AS (
  UPDATE public.matches m
     SET odds_status = t.new_status,
         suspended_markets = ARRAY['ALL']::text[]
    FROM targets t
   WHERE m.id = t.id
     AND t.new_status IS NOT NULL
     AND (m.odds_status <> t.new_status
          OR NOT ('ALL' = ANY(COALESCE(m.suspended_markets,'{}'::text[]))))
  RETURNING m.id, m.home_team, m.away_team, m.odds_status
)
INSERT INTO public.audit_log (user_id, action, entity, entity_id, metadata)
SELECT NULL, 'odds.hotfix.auto_suspend', 'matches', u.id,
       jsonb_build_object('status', u.odds_status, 'home_team', u.home_team, 'away_team', u.away_team)
  FROM upd u;

UPDATE public.predictions p
   SET flagged_for_review = true,
       flagged_reason = m.odds_status
  FROM public.matches m
 WHERE p.match_id = m.id
   AND m.status = 'scheduled'
   AND COALESCE(m.is_simulation,false) = false
   AND m.odds_status IN ('missing','awaiting_sync','stale')
   AND p.status = 'pending'::public.prediction_status
   AND p.flagged_for_review = false;
