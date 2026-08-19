-- Retention v2: downsample old odds history instead of deleting it, so finished
-- events keep a readable market-movement line.
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
  -- ---- F1: full detail 7d, then 5-min buckets to 30d ----
  DELETE FROM public.f1_race_odds_snapshots WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (
        PARTITION BY market_id, floor(extract(epoch FROM snapshot_at) / 300)
        ORDER BY snapshot_at
      ) rn
      FROM public.f1_race_odds_snapshots
      WHERE snapshot_at < now() - interval '7 days'
        AND snapshot_at >= now() - interval '30 days'
    ) x WHERE rn > 1 LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_f1 := v_deleted;

  DELETE FROM public.f1_race_odds_snapshots WHERE id IN (
    SELECT id FROM public.f1_race_odds_snapshots
    WHERE snapshot_at < now() - interval '30 days'
    ORDER BY snapshot_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_f1 := v_f1 + v_deleted;

  -- ---- World Cup match tape: full detail 14d, 5-min buckets to 90d ----
  DELETE FROM public.match_odds_snapshots WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (
        PARTITION BY match_id, source, floor(extract(epoch FROM sampled_at) / 300)
        ORDER BY sampled_at
      ) rn
      FROM public.match_odds_snapshots
      WHERE sampled_at < now() - interval '14 days'
        AND sampled_at >= now() - interval '90 days'
    ) x WHERE rn > 1 LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_match := v_deleted;

  DELETE FROM public.match_odds_snapshots WHERE id IN (
    SELECT id FROM public.match_odds_snapshots
    WHERE sampled_at < now() - interval '90 days'
    ORDER BY sampled_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_match := v_match + v_deleted;

  -- ---- Derived market tape ----
  DELETE FROM public.market_odds_snapshots WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (
        PARTITION BY match_id, market, selection, floor(extract(epoch FROM snapshot_at) / 300)
        ORDER BY snapshot_at
      ) rn
      FROM public.market_odds_snapshots
      WHERE snapshot_at < now() - interval '14 days'
        AND snapshot_at >= now() - interval '90 days'
    ) x WHERE rn > 1 LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_market := v_deleted;

  DELETE FROM public.market_odds_snapshots WHERE id IN (
    SELECT id FROM public.market_odds_snapshots
    WHERE snapshot_at < now() - interval '90 days'
    ORDER BY snapshot_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_market := v_market + v_deleted;

  -- ---- Club football tape ----
  DELETE FROM public.sports_odds_snapshots WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (
        PARTITION BY sports_market_id, selection_key, floor(extract(epoch FROM fetched_at) / 300)
        ORDER BY fetched_at
      ) rn
      FROM public.sports_odds_snapshots
      WHERE fetched_at < now() - interval '14 days'
        AND fetched_at >= now() - interval '90 days'
    ) x WHERE rn > 1 LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_sports := v_deleted;

  DELETE FROM public.sports_odds_snapshots WHERE id IN (
    SELECT id FROM public.sports_odds_snapshots
    WHERE fetched_at < now() - interval '90 days'
    ORDER BY fetched_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_sports := v_sports + v_deleted;

  -- ---- UFC tape ----
  DELETE FROM public.ufc_market_snapshots WHERE id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (
        PARTITION BY fight_id, market_type, selection_key, floor(extract(epoch FROM sampled_at) / 300)
        ORDER BY sampled_at
      ) rn
      FROM public.ufc_market_snapshots
      WHERE sampled_at < now() - interval '14 days'
        AND sampled_at >= now() - interval '90 days'
    ) x WHERE rn > 1 LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_ufc := v_deleted;

  DELETE FROM public.ufc_market_snapshots WHERE id IN (
    SELECT id FROM public.ufc_market_snapshots
    WHERE sampled_at < now() - interval '90 days'
    ORDER BY sampled_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_ufc := v_ufc + v_deleted;

  -- ---- Non-chart operational history (unchanged policy) ----
  DELETE FROM public.apifootball_odds_raw WHERE id IN (
    SELECT id FROM public.apifootball_odds_raw
    WHERE fetched_at < now() - interval '3 days'
    ORDER BY fetched_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_raw := v_deleted;

  DELETE FROM public.health_check_runs WHERE id IN (
    SELECT id FROM public.health_check_runs
    WHERE created_at < now() - interval '7 days'
    ORDER BY created_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_health := v_deleted;

  DELETE FROM public.audit_log WHERE id IN (
    SELECT id FROM public.audit_log
    WHERE created_at < now() - interval '90 days'
    ORDER BY created_at LIMIT v_batch
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_audit := v_deleted;

  RETURN jsonb_build_object(
    'f1', v_f1, 'match', v_match, 'market', v_market, 'sports', v_sports,
    'ufc', v_ufc, 'raw', v_raw, 'health', v_health, 'audit', v_audit
  );
END;
$function$;