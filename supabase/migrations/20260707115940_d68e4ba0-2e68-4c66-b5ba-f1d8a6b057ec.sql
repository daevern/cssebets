CREATE OR REPLACE FUNCTION public.reprice_match_reference_odds(p_match_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.platform_settings;
  v_match_disabled boolean;
  v_target_overround numeric;
  v_odds jsonb;
  v_ho numeric;
  v_do numeric;
  v_ao numeric;
  v_ph numeric;
  v_pd numeric;
  v_pa numeric;
  v_total numeric;
  v_new jsonb;
BEGIN
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

  SELECT reference_odds, COALESCE(margin_disabled, false)
    INTO v_odds, v_match_disabled
    FROM public.matches
   WHERE id = p_match_id;

  IF v_odds IS NULL
     OR (v_odds->>'home') IS NULL
     OR (v_odds->>'draw') IS NULL
     OR (v_odds->>'away') IS NULL
     OR NULLIF((v_odds->>'home')::numeric, 0) IS NULL
     OR NULLIF((v_odds->>'draw')::numeric, 0) IS NULL
     OR NULLIF((v_odds->>'away')::numeric, 0) IS NULL
  THEN
    RETURN false;
  END IF;

  v_target_overround := CASE
    WHEN v_match_disabled OR NOT COALESCE(v_settings.apply_margin_to_real, true)
      THEN 1.0
    ELSE 1.0 + (COALESCE(v_settings.margin_pct, 25) / 100.0)
  END;

  v_ho := GREATEST((v_odds->>'home')::numeric, 1.001);
  v_do := GREATEST((v_odds->>'draw')::numeric, 1.001);
  v_ao := GREATEST((v_odds->>'away')::numeric, 1.001);

  v_ph := 1.0 / v_ho;
  v_pd := 1.0 / v_do;
  v_pa := 1.0 / v_ao;
  v_total := v_ph + v_pd + v_pa;

  IF v_total <= 0 THEN
    RETURN false;
  END IF;

  v_ph := v_ph / v_total;
  v_pd := v_pd / v_total;
  v_pa := v_pa / v_total;

  v_new := jsonb_build_object(
    'home', ROUND(GREATEST(1.01, 1.0 / GREATEST(v_ph * v_target_overround, 0.000001))::numeric, 2),
    'draw', ROUND(GREATEST(1.01, 1.0 / GREATEST(v_pd * v_target_overround, 0.000001))::numeric, 2),
    'away', ROUND(GREATEST(1.01, 1.0 / GREATEST(v_pa * v_target_overround, 0.000001))::numeric, 2)
  );

  UPDATE public.matches
     SET reference_odds = v_new,
         odds_updated_at = now(),
         updated_at = now()
   WHERE id = p_match_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reprice_match_reference_odds(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprice_match_reference_odds(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reprice_match_market_odds(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.platform_settings;
  v_match_disabled boolean;
  v_target_overround numeric;
  v_updated integer := 0;
BEGIN
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

  SELECT COALESCE(margin_disabled, false)
    INTO v_match_disabled
    FROM public.matches
   WHERE id = p_match_id;

  v_target_overround := CASE
    WHEN COALESCE(v_match_disabled, false) OR NOT COALESCE(v_settings.apply_margin_to_real, true)
      THEN 1.0
    ELSE 1.0 + (COALESCE(v_settings.margin_pct, 25) / 100.0)
  END;

  WITH market_sums AS (
    SELECT
      market,
      SUM(1.0 / GREATEST(odds, 1.001)) AS raw_sum
    FROM public.match_market_odds
    WHERE match_id = p_match_id
      AND active = true
      AND odds IS NOT NULL
      AND odds > 1
    GROUP BY market
  ), repriced AS (
    UPDATE public.match_market_odds AS o
       SET odds = ROUND(
             LEAST(
               public.market_odds_cap(o.market),
               GREATEST(
                 1.01,
                 1.0 / GREATEST(((1.0 / GREATEST(o.odds, 1.001)) / NULLIF(s.raw_sum, 0)) * v_target_overround, 0.000001)
               )
             )::numeric,
             2
           ),
           updated_at = now()
      FROM market_sums AS s
     WHERE o.match_id = p_match_id
       AND o.active = true
       AND o.market = s.market
       AND s.raw_sum > 0
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM repriced;

  RETURN COALESCE(v_updated, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reprice_match_market_odds(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprice_match_market_odds(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.regenerate_match_market_odds(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.platform_settings;
  v_disabled boolean;
  v_target numeric;
BEGIN
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

  SELECT COALESCE(margin_disabled, false)
    INTO v_disabled
    FROM public.matches
   WHERE id = p_match_id;

  v_target := CASE
    WHEN COALESCE(v_disabled, false) OR NOT COALESCE(v_settings.apply_margin_to_real, true)
      THEN 1.0
    ELSE 1.0 + (COALESCE(v_settings.margin_pct, 25) / 100.0)
  END;

  PERFORM public.seed_match_market_odds(p_match_id);
  PERFORM public.adjust_correct_score_odds(p_match_id, v_target, 1000000.0);
  PERFORM public.reprice_match_market_odds(p_match_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_match_market_odds(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_match_margin_disabled(
  p_match_id uuid,
  p_disabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.matches
     SET margin_disabled = p_disabled,
         updated_at = now()
   WHERE id = p_match_id;

  PERFORM public.reprice_match_reference_odds(p_match_id);
  PERFORM public.regenerate_match_market_odds(p_match_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_match_margin_disabled(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_match_margin_disabled(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.reprice_open_match_market_odds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_total_updated integer := 0;
BEGIN
  FOR v_match IN
    SELECT id
      FROM public.matches
     WHERE status IN ('scheduled', 'lineups')
  LOOP
    PERFORM public.reprice_match_reference_odds(v_match.id);
    PERFORM public.regenerate_match_market_odds(v_match.id);
    v_total_updated := v_total_updated + COALESCE(public.reprice_match_market_odds(v_match.id), 0);
  END LOOP;

  RETURN v_total_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reprice_open_match_market_odds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprice_open_match_market_odds() TO service_role;