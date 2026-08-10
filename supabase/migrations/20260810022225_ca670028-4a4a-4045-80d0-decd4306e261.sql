UPDATE public.sports_competitions
SET current_season = '2026',
    fixture_sync_enabled = true,
    odds_sync_enabled = true,
    live_sync_enabled = true,
    settlement_enabled = true,
    is_enabled = true,
    updated_at = now()
WHERE competition_code = 'LA_LIGA';

UPDATE public.sports_events
SET season = '2026',
    updated_at = now()
WHERE competition_code = 'LA_LIGA'
  AND season IS DISTINCT FROM '2026';