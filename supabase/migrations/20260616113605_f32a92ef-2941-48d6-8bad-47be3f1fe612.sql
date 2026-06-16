-- Restrict Realtime broadcast on public.matches to non-sensitive columns only.
-- Excludes: reference_odds, home_liability, draw_liability, away_liability, worst_case_exposure.
-- Realtime payloads are built server-side with the service role and bypass column GRANTs,
-- so the publication itself must be filtered.

ALTER PUBLICATION supabase_realtime DROP TABLE public.matches;

ALTER PUBLICATION supabase_realtime ADD TABLE public.matches
  (id, external_id, stage, group_name, home_team, away_team, home_crest, away_crest,
   kickoff_at, status, home_score, away_score, winner, created_at, updated_at,
   odds_updated_at, odds_source, odds_status, suspended_markets,
   home_score_ht, away_score_ht, manual_override, is_simulation);