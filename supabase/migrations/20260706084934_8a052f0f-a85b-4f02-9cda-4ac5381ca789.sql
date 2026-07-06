UPDATE public.match_stats
SET corners = 5, fetched_at = now()
WHERE match_id = '2a2e429d-20fa-48c5-bee1-3fe1c2580797'
  AND side IN ('home','away');