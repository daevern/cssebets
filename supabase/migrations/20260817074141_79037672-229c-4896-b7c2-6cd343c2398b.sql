ALTER TABLE public.sports_markets ALTER COLUMN stale_after_seconds SET DEFAULT 21600;

UPDATE public.sports_markets m
SET stale_after_seconds = 21600
FROM public.sports_events e
WHERE e.id = m.sports_event_id
  AND e.sport_code = 'football'
  AND coalesce(m.stale_after_seconds, 10800) < 21600;

UPDATE public.sports_markets m
SET status = 'open', suspension_reason = NULL
FROM public.sports_events e
WHERE e.id = m.sports_event_id
  AND e.sport_code = 'football'
  AND e.status NOT IN ('finished','postponed','cancelled','abandoned')
  AND e.scheduled_at > now()
  AND m.status = 'suspended'
  AND m.suspension_reason = 'odds stale';