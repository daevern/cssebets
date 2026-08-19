-- 1. Recurring, batched cron-log housekeeping (keeps last 3 days)
CREATE OR REPLACE FUNCTION public.prune_cron_history(p_batch_size integer DEFAULT 50000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_batch integer := GREATEST(1000, LEAST(COALESCE(p_batch_size, 50000), 200000));
  v_deleted integer;
BEGIN
  DELETE FROM cron.job_run_details
  WHERE runid IN (
    SELECT runid FROM cron.job_run_details
    WHERE end_time < now() - interval '3 days'
    ORDER BY runid
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.prune_cron_history(integer) FROM PUBLIC;

-- 3. Extend ops history prune with sync-run retention (30 days)
CREATE OR REPLACE FUNCTION public.prune_sync_runs(p_batch_size integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch integer := GREATEST(100, LEAST(COALESCE(p_batch_size, 5000), 25000));
  v_f1 integer := 0;
  v_sports integer := 0;
BEGIN
  DELETE FROM public.f1_sync_runs
  WHERE id IN (
    SELECT id FROM public.f1_sync_runs
    WHERE started_at < now() - interval '30 days'
    ORDER BY started_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_f1 = ROW_COUNT;

  DELETE FROM public.sports_sync_runs
  WHERE id IN (
    SELECT id FROM public.sports_sync_runs
    WHERE started_at < now() - interval '30 days'
    ORDER BY started_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_sports = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'f1_sync_runs', v_f1, 'sports_sync_runs', v_sports);
END;
$$;

REVOKE ALL ON FUNCTION public.prune_sync_runs(integer) FROM PUBLIC;

-- 4. Schedule the housekeeping jobs
SELECT cron.unschedule('prune-ops-history') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-ops-history');
SELECT cron.schedule('prune-ops-history', '*/10 * * * *', $$SELECT public.prune_ops_history(8000); SELECT public.prune_sync_runs(5000);$$);

SELECT cron.unschedule('prune-cron-history') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-cron-history');
SELECT cron.schedule('prune-cron-history', '*/2 * * * *', $$SELECT public.prune_cron_history(50000);$$);

-- 5. Drop duplicate live-odds pollers (all four fired identically every minute)
SELECT cron.unschedule('odds-live-poll-15') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'odds-live-poll-15');
SELECT cron.unschedule('odds-live-poll-30') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'odds-live-poll-30');
SELECT cron.unschedule('odds-live-poll-45') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'odds-live-poll-45');