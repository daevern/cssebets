REVOKE SELECT ON public.matches FROM anon, authenticated;

GRANT SELECT (
  id, external_id, stage, group_name,
  home_team, away_team, home_crest, away_crest,
  kickoff_at, status, home_score, away_score, winner,
  reference_odds, created_at, updated_at,
  odds_updated_at, odds_source,
  is_simulation, home_score_ht, away_score_ht
) ON public.matches TO authenticated;

GRANT SELECT (
  id, external_id, stage, group_name,
  home_team, away_team, home_crest, away_crest,
  kickoff_at, status, home_score, away_score, winner,
  reference_odds, created_at, updated_at,
  odds_updated_at, odds_source,
  is_simulation, home_score_ht, away_score_ht
) ON public.matches TO anon;

GRANT ALL ON public.matches TO service_role;