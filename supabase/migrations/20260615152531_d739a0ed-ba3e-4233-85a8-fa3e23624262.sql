UPDATE public.matches
SET
  reference_odds = jsonb_build_object('home', 1.07, 'draw', 13.90, 'away', 30.82),
  odds_source = 'the-odds-api',
  odds_updated_at = now(),
  updated_at = now()
WHERE id = '6cd3b91e-e04e-4720-9ab8-92b29b884d81'
  AND home_team = 'Spain'
  AND away_team = 'Cape Verde Islands';