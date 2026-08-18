-- Cloud IO relief without instance upgrade:
-- 1) Bounded retention deletes for forever-growing history tables
-- 2) Collapse duplicate odds-live crons (4× same-minute writers) to 1/min
-- 3) Indexes for admin audit listing + prune scans
-- 4) Schedule prune every 10 minutes

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
  ON public.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS f1_race_odds_snapshots_snapshot_at_idx
  ON public.f1_race_odds_snapshots (snapshot_at);

CREATE INDEX IF NOT EXISTS match_odds_snapshots_sampled_at_idx
  ON public.match_odds_snapshots (sampled_at);

CREATE INDEX IF NOT EXISTS market_odds_snapshots_snapshot_at_idx
  ON public.market_odds_snapshots (snapshot_at);

CREATE INDEX IF NOT EXISTS sports_odds_snapshots_fetched_at_idx
  ON public.sports_odds_snapshots (fetched_at);

CREATE INDEX IF NOT EXISTS ufc_market_snapshots_sampled_at_idx
  ON public.ufc_market_snapshots (sampled_at);

CREATE INDEX IF NOT EXISTS apifootball_odds_raw_fetched_at_idx
  ON public.apifootball_odds_raw (fetched_at);

-- ---------- Bounded prune ----------
CREATE OR REPLACE FUNCTION public.prune_ops_history(p_batch_size integer DEFAULT 8000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch integer := GREATEST(100, LEAST(COALESCE(p_batch_size, 8000), 25000));
  v_deleted integer;
  v_f1 integer := 0;
  v_match integer := 0;
  v_market integer := 0;
  v_sports integer := 0;
  v_ufc integer := 0;
  v_raw integer := 0;
  v_health integer := 0;
  v_audit integer := 0;
BEGIN
  -- F1 odds tape: keep 7 days (largest table)
  DELETE FROM public.f1_race_odds_snapshots
  WHERE id IN (
    SELECT id FROM public.f1_race_odds_snapshots
    WHERE snapshot_at < now() - interval '7 days'
    ORDER BY snapshot_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_f1 := v_deleted;

  -- WC / market tapes: keep 14 days
  DELETE FROM public.match_odds_snapshots
  WHERE id IN (
    SELECT id FROM public.match_odds_snapshots
    WHERE sampled_at < now() - interval '14 days'
    ORDER BY sampled_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_match := v_deleted;

  DELETE FROM public.market_odds_snapshots
  WHERE id IN (
    SELECT id FROM public.market_odds_snapshots
    WHERE snapshot_at < now() - interval '14 days'
    ORDER BY snapshot_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_market := v_deleted;

  DELETE FROM public.sports_odds_snapshots
  WHERE id IN (
    SELECT id FROM public.sports_odds_snapshots
    WHERE fetched_at < now() - interval '14 days'
    ORDER BY fetched_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_sports := v_deleted;

  DELETE FROM public.ufc_market_snapshots
  WHERE id IN (
    SELECT id FROM public.ufc_market_snapshots
    WHERE sampled_at < now() - interval '14 days'
    ORDER BY sampled_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_ufc := v_deleted;

  -- Raw provider blobs: keep 3 days
  DELETE FROM public.apifootball_odds_raw
  WHERE id IN (
    SELECT id FROM public.apifootball_odds_raw
    WHERE fetched_at < now() - interval '3 days'
    ORDER BY fetched_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_raw := v_deleted;

  -- Health runs: keep 7 days
  DELETE FROM public.health_check_runs
  WHERE id IN (
    SELECT id FROM public.health_check_runs
    WHERE created_at < now() - interval '7 days'
    ORDER BY created_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_health := v_deleted;

  -- Audit log: keep 90 days (admin actions still retained)
  DELETE FROM public.audit_log
  WHERE id IN (
    SELECT id FROM public.audit_log
    WHERE created_at < now() - interval '90 days'
    ORDER BY created_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_audit := v_deleted;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_size', v_batch,
    'deleted', jsonb_build_object(
      'f1_race_odds_snapshots', v_f1,
      'match_odds_snapshots', v_match,
      'market_odds_snapshots', v_market,
      'sports_odds_snapshots', v_sports,
      'ufc_market_snapshots', v_ufc,
      'apifootball_odds_raw', v_raw,
      'health_check_runs', v_health,
      'audit_log', v_audit
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_ops_history(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_ops_history(integer) TO service_role;

-- ---------- Cron: one odds-live + prune ----------
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
    'odds-live-0',
    'odds-live-15',
    'odds-live-30',
    'odds-live-45',
    'odds-live-poll-00',
    'odds-live-poll-15',
    'odds-live-poll-30',
    'odds-live-poll-45',
    'football-live-1min',
    'f1-live-1min',
    'f1-odds-5min',
    'ufc-discovery-30min',
    'ufc-odds-5min',
    'ufc-odds-1min-fight-night',
    'ufc-settle-2min',
    'football-settle-2min',
    'f1-settle-5min',
    'health-check-5min',
    'prune-ops-history-10min'
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

  -- Single live-odds poll per minute (was 4× overlapping writers).
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

  -- Pure SQL prune (no HTTP). Catches up ~8k rows/table every 10 minutes.
  PERFORM cron.schedule(
    'prune-ops-history-10min',
    '*/10 * * * *',
    $cmd$SELECT public.prune_ops_history(8000);$cmd$
  );
  v_jobs := v_jobs + 1;

  RETURN jsonb_build_object('ok', true, 'jobs', v_jobs, 'base_url', v_base);
END;
$function$;

SELECT public.reschedule_cron_hooks_with_vault();

-- Kick off one prune pass immediately (bounded).
SELECT public.prune_ops_history(8000);
