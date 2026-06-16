-- Restrict authenticated SELECT on match_market_odds to safe columns only.
-- Hides internal `generated` and `source` columns from regular users; admins
-- still read everything via service_role (supabaseAdmin) on the server.

REVOKE SELECT ON public.match_market_odds FROM authenticated;

GRANT SELECT
  (id, match_id, market, selection, odds, active, created_at, updated_at)
  ON public.match_market_odds
  TO authenticated;

-- service_role keeps full access (already granted via GRANT ALL elsewhere,
-- but re-assert defensively).
GRANT ALL ON public.match_market_odds TO service_role;