-- Phase B.1: cron hooks read secret from Vault; schedule settle/health crons;
-- ops selftest for margin + capacity. Secret value is NEVER committed.
--
-- Ops (once on live): 
--   select vault.create_secret('<CRON_HOOK_SECRET>', 'cron_hook_secret', 'Cron hook auth');
-- then re-run the reschedule block below (or apply this migration after creating the secret).
-- On ephemeral CI: workflow seeds vault with e2e-cron-secret-for-ci before relying on jobs.

CREATE OR REPLACE FUNCTION public.cron_hook_headers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'cron_hook_secret'
   LIMIT 1;
  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RAISE EXCEPTION 'CRON_HOOK_SECRET_MISSING: create vault secret cron_hook_secret';
  END IF;
  RETURN jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', v_secret
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_hook_headers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_hook_headers() TO postgres, service_role;

-- Base URL for hooks (Lovable / Cloudflare host). Override via vault `app_base_url` if set.
CREATE OR REPLACE FUNCTION public.cron_hook_base_url()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_url text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
   WHERE name = 'app_base_url'
   LIMIT 1;
  IF v_url IS NOT NULL AND length(trim(v_url)) > 0 THEN
    RETURN rtrim(trim(v_url), '/');
  END IF;
  -- Fallback: last known hosted project URL from prior migrations (ops should set vault).
  RETURN 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app';
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_hook_base_url() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_hook_base_url() TO postgres, service_role;

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
  -- Fail soft if vault secret missing (fresh CI before seed, or prod pre-ops).
  BEGIN
    v_headers := public.cron_hook_headers();
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CRON_HOOK_SECRET_MISSING', 'jobs', 0);
  END;

  v_base := public.cron_hook_base_url();

  FOREACH j IN ARRAY ARRAY[
    'apifootball-sync-5min-global-odds',
    'apifootball-sync-1min-near-kickoff',
    'f1-live-1min',
    'ufc-discovery-30min',
    'ufc-odds-5min',
    'ufc-settle-2min',
    'football-settle-2min',
    'f1-settle-5min',
    'health-check-5min'
  ]
  LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- job may not exist yet
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

REVOKE ALL ON FUNCTION public.reschedule_cron_hooks_with_vault() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_cron_hooks_with_vault() TO service_role;

-- Attempt schedule now (no-op-ish soft fail if vault empty).
SELECT public.reschedule_cron_hooks_with_vault();

-- Ops / CI selftest: margin + capacity + cron helper present.
CREATE OR REPLACE FUNCTION public.phase_b_ops_selftest()
RETURNS TABLE(check_name text, passed boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 'apply_margin_to_real'::text,
         coalesce((SELECT apply_margin_to_real FROM platform_settings WHERE id = 1), false),
         'platform_settings.apply_margin_to_real must be true'::text;

  RETURN QUERY
  SELECT 'capacity_enforced_core'::text,
         NOT EXISTS (
           SELECT 1 FROM accounting_migration_flags
            WHERE product IN ('plinko','rps','blackjack','roulette','treasure')
              AND capacity_enforced = false
         ),
         'core arcade products must have capacity_enforced'::text;

  RETURN QUERY
  SELECT 'cron_hook_headers_fn'::text,
         EXISTS (
           SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'cron_hook_headers'
         ),
         'cron_hook_headers() must exist'::text;

  RETURN QUERY
  SELECT 'ufc_props_inactive'::text,
         NOT EXISTS (
           SELECT 1 FROM ufc_fight_markets
            WHERE market_type IN ('method','round','total_rounds')
              AND is_active = true
         ),
         'method/round/total_rounds must not be publicly active'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.phase_b_ops_selftest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phase_b_ops_selftest() TO service_role, authenticated;
