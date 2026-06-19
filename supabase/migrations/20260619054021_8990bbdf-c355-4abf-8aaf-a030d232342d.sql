-- Restrict authenticated SELECT on match_market_odds to exclude internal provenance columns
REVOKE SELECT ON public.match_market_odds FROM authenticated;
GRANT SELECT (id, match_id, market, selection, odds, active, created_at, updated_at)
  ON public.match_market_odds TO authenticated;

-- Defense-in-depth: restrict authenticated SELECT on matches to non-sensitive columns
REVOKE SELECT ON public.matches FROM authenticated;
GRANT SELECT (
  id, home_team, away_team, kickoff_at, status,
  home_score, away_score, home_score_ht, away_score_ht,
  stage, group_name, odds_updated_at, odds_source,
  odds_status, suspended_markets, manual_override,
  is_simulation, created_at, updated_at
) ON public.matches TO authenticated;

-- Explicit deny policies on admin_reauth to make intent unambiguous
CREATE POLICY "admin_reauth deny insert" ON public.admin_reauth
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "admin_reauth deny update" ON public.admin_reauth
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "admin_reauth deny delete" ON public.admin_reauth
  FOR DELETE TO authenticated, anon USING (false);