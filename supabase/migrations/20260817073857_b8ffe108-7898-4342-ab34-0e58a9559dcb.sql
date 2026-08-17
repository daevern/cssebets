UPDATE public.sports_markets m
SET status = 'open', suspension_reason = NULL, updated_at = now()
FROM public.sports_events e
WHERE e.id = m.sports_event_id
  AND e.sport_code = 'football'
  AND e.status = 'scheduled'
  AND e.scheduled_at > now() + interval '12 hours'
  AND m.status = 'suspended'
  AND m.suspension_reason = 'odds stale';