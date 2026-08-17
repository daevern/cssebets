ALTER TABLE public.sports_markets ALTER COLUMN stale_after_seconds SET DEFAULT 10800;

UPDATE public.sports_markets m
SET stale_after_seconds = 10800, updated_at = now()
FROM public.sports_events e
WHERE e.id = m.sports_event_id
  AND e.sport_code = 'football'
  AND m.stale_after_seconds < 10800;

UPDATE public.sports_markets m
SET status = 'open', suspension_reason = NULL, updated_at = now()
FROM public.sports_events e
WHERE e.id = m.sports_event_id
  AND e.sport_code = 'football'
  AND m.status = 'suspended'
  AND m.suspension_reason = 'odds stale'
  AND e.scheduled_at > now()
  AND e.status NOT IN ('finished','postponed','cancelled','abandoned');