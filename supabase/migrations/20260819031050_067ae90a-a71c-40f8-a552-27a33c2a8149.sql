CREATE OR REPLACE FUNCTION public.prune_ops_history(p_batch_size integer DEFAULT 8000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch integer := GREATEST(100, LEAST(COALESCE(p_batch_size, 8000), 100000));
  v_deleted integer;
  v_f1 integer := 0;
  v_match integer := 0;
  v_market integer := 0;
  v_sports integer := 0;
  v_ufc integer := 0;
  v_raw integer := 0;
  v_health integer := 0;
  v_audit integer := 0;
  v_net integer := 0;
BEGIN
  -- F1 odds tape: keep 3 days (largest table)
  DELETE FROM public.f1_race_odds_snapshots
  WHERE id IN (
    SELECT id FROM public.f1_race_odds_snapshots
    WHERE snapshot_at < now() - interval '3 days'
    ORDER BY snapshot_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_f1 := v_deleted;

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

  DELETE FROM public.apifootball_odds_raw
  WHERE id IN (
    SELECT id FROM public.apifootball_odds_raw
    WHERE fetched_at < now() - interval '3 days'
    ORDER BY fetched_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_raw := v_deleted;

  DELETE FROM public.health_check_runs
  WHERE id IN (
    SELECT id FROM public.health_check_runs
    WHERE created_at < now() - interval '7 days'
    ORDER BY created_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_health := v_deleted;

  DELETE FROM public.audit_log
  WHERE id IN (
    SELECT id FROM public.audit_log
    WHERE created_at < now() - interval '90 days'
    ORDER BY created_at
    LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_audit := v_deleted;

  -- pg_net response log: keep 1 hour
  BEGIN
    DELETE FROM net._http_response
    WHERE id IN (
      SELECT id FROM net._http_response
      WHERE created < now() - interval '1 hour'
      ORDER BY created
      LIMIT v_batch
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_net := v_deleted;
  EXCEPTION WHEN OTHERS THEN
    v_net := -1;
  END;

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
      'audit_log', v_audit,
      'net_http_response', v_net
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prune_ops_history(integer) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(15);

SELECT cron.alter_job(212, schedule := '*/10 * * * *', command := 'SELECT public.prune_ops_history(50000); SELECT public.prune_sync_runs(10000);');