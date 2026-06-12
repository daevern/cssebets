-- 1) Hide internal house risk columns from clients (Data API roles).
-- We revoke column-level SELECT on the four liability columns from anon/authenticated.
-- Server functions use the service_role client and are unaffected.
REVOKE SELECT (home_liability, draw_liability, away_liability, worst_case_exposure)
  ON public.matches FROM authenticated, anon;

-- 2) Defense-in-depth: explicit admin-only write policies on match_market_odds.
-- RLS already denies by default; these make the intent explicit.
DROP POLICY IF EXISTS "Admins can insert match_market_odds" ON public.match_market_odds;
DROP POLICY IF EXISTS "Admins can update match_market_odds" ON public.match_market_odds;
DROP POLICY IF EXISTS "Admins can delete match_market_odds" ON public.match_market_odds;

CREATE POLICY "Admins can insert match_market_odds"
  ON public.match_market_odds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "Admins can update match_market_odds"
  ON public.match_market_odds
  FOR UPDATE
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY "Admins can delete match_market_odds"
  ON public.match_market_odds
  FOR DELETE
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- 3) Pin search_path on the only IMMUTABLE math helper that lacked one.
CREATE OR REPLACE FUNCTION public.poisson_pmf(lambda numeric, k integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_fact numeric := 1; i int;
BEGIN
  IF lambda <= 0 THEN RETURN CASE WHEN k = 0 THEN 1 ELSE 0 END; END IF;
  FOR i IN 1..k LOOP v_fact := v_fact * i; END LOOP;
  RETURN exp(-lambda) * power(lambda, k) / v_fact;
END $function$;
