
-- Revoke column-level SELECT for sensitive internal fields from client roles.
-- Admin server functions use the service_role key, which bypasses column grants.

REVOKE SELECT (generated, source) ON public.match_market_odds FROM authenticated;
REVOKE SELECT (generated, source) ON public.match_market_odds FROM anon;

REVOKE SELECT (home_liability, draw_liability, away_liability, worst_case_exposure)
  ON public.matches FROM authenticated;
REVOKE SELECT (home_liability, draw_liability, away_liability, worst_case_exposure)
  ON public.matches FROM anon;
