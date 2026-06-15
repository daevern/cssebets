UPDATE public.matches
SET
  reference_odds = jsonb_build_object('home', 1.07, 'draw', 13.90, 'away', 30.82),
  odds_source = 'the-odds-api',
  odds_updated_at = now(),
  updated_at = now()
WHERE id = '6cd3b91e-e04e-4720-9ab8-92b29b884d81'
  AND home_team = 'Spain'
  AND away_team = 'Cape Verde Islands';

INSERT INTO public.match_odds_snapshots (
  match_id,
  source,
  home_odds,
  draw_odds,
  away_odds,
  raw_bookmaker_count,
  sampled_at
)
SELECT
  id,
  'the-odds-api',
  1.07,
  13.90,
  30.82,
  24,
  now()
FROM public.matches
WHERE id = '6cd3b91e-e04e-4720-9ab8-92b29b884d81'
  AND home_team = 'Spain'
  AND away_team = 'Cape Verde Islands';