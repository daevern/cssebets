-- Ensure Kalshi-style live odds crons exist: World Cup odds-live every minute,
-- UFC fight-night odds every minute, F1 odds every 5 minutes. Uses vault-backed
-- reschedule helper from Phase B when available.

CREATE OR REPLACE FUNCTION public.reschedule_cron_hooks_with_vault()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'net', 'vault'
AS $function$
DECLARE
  v_base text;
  v_headers jsonb;
  v_jobs int := 0;
  j text;
BEGIN
  BEGIN
    v_headers := public.cron_hook_headers();
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CRON_HOOK_SECRET_MISSING', 'jobs', 0);
  END;

  v_base := public.cron_hook_base_url();

  FOREACH j IN ARRAY ARRAY[
    'apifootball-sync-5min-global-odds',
    'apifootball-sync-1min-near-kickoff',
    'odds-live-1min',
    'football-live-1min',
    'f1-live-1min',
    'f1-odds-5min',
    'ufc-discovery-30min',
    'ufc-odds-5min',
    'ufc-odds-1min-fight-night',
    'ufc-settle-2min',
    'football-settle-2min',
    'f1-settle-5min',
    'health-check-5min'
  ]
  LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  PERFORM cron.schedule(
    'apifootball-sync-5min-global-odds',
    '*/5 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/apifootball-sync?max=6&hours=48&freshness=0.08'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'apifootball-sync-1min-near-kickoff',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/apifootball-sync?max=3&hours=4&freshness=0.015'
    )
  );
  v_jobs := v_jobs + 1;

  -- World Cup + club football in-play odds → dense match/sports odds snapshots
  -- for MarketAnalyticsCard LIVE (Kalshi-style).
  PERFORM cron.schedule(
    'odds-live-1min',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/odds-live'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'football-live-1min',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/football-live'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'f1-live-1min',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/f1-live'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'f1-odds-5min',
    '*/5 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/f1-odds'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'ufc-discovery-30min',
    '7-59/30 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/ufc-discovery'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'ufc-odds-5min',
    '*/5 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/ufc-odds'
    )
  );
  v_jobs := v_jobs + 1;

  -- Fight-night: force a refresh every minute so live moneyline graphs move.
  PERFORM cron.schedule(
    'ufc-odds-1min-fight-night',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/ufc-odds?maxEvents=2'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'ufc-settle-2min',
    '*/2 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/ufc-settle'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'football-settle-2min',
    '*/2 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/football-settle'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'f1-settle-5min',
    '*/5 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/f1-settle'
    )
  );
  v_jobs := v_jobs + 1;

  PERFORM cron.schedule(
    'health-check-5min',
    '*/5 * * * *',
    format(
      $cmd$SELECT net.http_post(url := %L, headers := public.cron_hook_headers(), body := '{}'::jsonb);$cmd$,
      v_base || '/api/public/hooks/health-check'
    )
  );
  v_jobs := v_jobs + 1;

  RETURN jsonb_build_object('ok', true, 'jobs', v_jobs, 'base_url', v_base);
END;
$function$;

SELECT public.reschedule_cron_hooks_with_vault();
