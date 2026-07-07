UPDATE public.match_market_odds mmo
SET active = false, updated_at = now()
FROM public.matches m
WHERE mmo.match_id = m.id
  AND mmo.generated = true
  AND mmo.active = true
  AND COALESCE(m.is_simulation, false) = false;