-- Real matches must only expose trusted provider odds.
-- Generated/derived odds remain allowed for simulation matches only.

CREATE OR REPLACE FUNCTION public.enforce_real_match_trusted_market_odds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_sim boolean := false;
BEGIN
  SELECT COALESCE(is_simulation, false)
    INTO v_is_sim
    FROM public.matches
   WHERE id = NEW.match_id;

  IF NOT COALESCE(v_is_sim, false) THEN
    IF COALESCE(NEW.generated, true) = true
       OR NEW.source IS DISTINCT FROM 'api-football' THEN
      NEW.active := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_real_match_trusted_market_odds_trg ON public.match_market_odds;
CREATE TRIGGER enforce_real_match_trusted_market_odds_trg
BEFORE INSERT OR UPDATE OF match_id, source, generated, active
ON public.match_market_odds
FOR EACH ROW
EXECUTE FUNCTION public.enforce_real_match_trusted_market_odds();

CREATE OR REPLACE FUNCTION public.reprice_match_market_odds(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings public.platform_settings;
  v_match_disabled boolean;
  v_is_sim boolean := false;
  v_target_overround numeric;
  v_updated integer := 0;
BEGIN
  SELECT COALESCE(is_simulation, false), COALESCE(margin_disabled, false)
    INTO v_is_sim, v_match_disabled
    FROM public.matches
   WHERE id = p_match_id;

  -- Provider-sourced odds for real matches are written by the provider sync.
  -- Repricing them here is not safe for markets like double chance, and can
  -- turn real prices into fabricated-looking prices. Simulations keep using
  -- the internal generated book.
  IF NOT COALESCE(v_is_sim, false) THEN
    UPDATE public.match_market_odds
       SET active = false,
           updated_at = now()
     WHERE match_id = p_match_id
       AND active = true
       AND (COALESCE(generated, true) = true OR source IS DISTINCT FROM 'api-football');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN COALESCE(v_updated, 0);
  END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

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

CREATE OR REPLACE FUNCTION public.regenerate_match_market_odds(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings public.platform_settings;
  v_disabled boolean;
  v_is_sim boolean := false;
  v_target numeric;
BEGIN
  SELECT COALESCE(is_simulation, false), COALESCE(margin_disabled, false)
    INTO v_is_sim, v_disabled
    FROM public.matches
   WHERE id = p_match_id;

  -- Never generate fallback market odds for real matches.
  IF NOT COALESCE(v_is_sim, false) THEN
    UPDATE public.match_market_odds
       SET active = false,
           updated_at = now()
     WHERE match_id = p_match_id
       AND active = true
       AND (COALESCE(generated, true) = true OR source IS DISTINCT FROM 'api-football');
    RETURN;
  END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

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

-- Restore real provider odds from the latest provider snapshots. These snapshots
-- are written by the provider sync before any later database repricing can alter rows.
WITH latest_provider_snapshots AS (
  SELECT DISTINCT ON (s.match_id, s.market, s.selection)
    s.match_id,
    s.market,
    s.selection,
    s.odds
  FROM public.market_odds_snapshots s
  JOIN public.matches m ON m.id = s.match_id
  WHERE COALESCE(m.is_simulation, false) = false
    AND s.source = 'api-football'
    AND s.odds IS NOT NULL
    AND s.odds > 1
  ORDER BY s.match_id, s.market, s.selection, s.snapshot_at DESC
)
UPDATE public.match_market_odds o
   SET odds = l.odds,
       source = 'api-football',
       generated = false,
       active = true,
       updated_at = now()
  FROM latest_provider_snapshots l
 WHERE o.match_id = l.match_id
   AND o.market = l.market
   AND o.selection = l.selection;

-- Deactivate all generated/derived/fallback market odds on real matches.
UPDATE public.match_market_odds o
   SET active = false,
       updated_at = now()
  FROM public.matches m
 WHERE o.match_id = m.id
   AND COALESCE(m.is_simulation, false) = false
   AND o.active = true
   AND (COALESCE(o.generated, true) = true OR o.source IS DISTINCT FROM 'api-football');

DROP POLICY IF EXISTS "Active market odds readable by authenticated" ON public.match_market_odds;

CREATE POLICY "Active market odds readable by authenticated"
ON public.match_market_odds
FOR SELECT
TO authenticated
USING (
  active = true
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      source = 'api-football'
      AND COALESCE(generated, true) = false
      AND EXISTS (
        SELECT 1
        FROM public.matches m
        WHERE m.id = match_market_odds.match_id
          AND COALESCE(m.is_simulation, false) = false
      )
    )
  )
);