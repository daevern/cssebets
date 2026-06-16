ALTER TABLE public.matches REPLICA IDENTITY DEFAULT;

UPDATE public.platform_settings
SET max_odds_age_minutes = 180, updated_at = now()
WHERE id = 1;

SELECT public.refresh_odds_status_for_open_matches();