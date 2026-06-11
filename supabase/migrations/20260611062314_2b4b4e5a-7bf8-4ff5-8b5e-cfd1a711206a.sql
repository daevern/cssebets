
-- Batch-settle all live simulation matches together. Idempotent (skips already-settled pools).
CREATE OR REPLACE FUNCTION public.run_simulation_batch_settle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_started_count INT := 0;
  v_settled_count INT := 0;
  v_total_preds INT := 0;
  v_home INT; v_away INT; v_preds INT;
  v_t0 TIMESTAMPTZ := clock_timestamp();
  v_duration_ms NUMERIC;
BEGIN
  -- 1) Force-start any scheduled simulation matches (kickoff to now)
  FOR v_match IN
    SELECT id FROM public.matches
     WHERE is_simulation = true AND status = 'scheduled'::public.match_status
     FOR UPDATE
  LOOP
    UPDATE public.matches
       SET status = 'live'::public.match_status,
           kickoff_at = LEAST(kickoff_at, now())
     WHERE id = v_match.id;
    v_started_count := v_started_count + 1;
  END LOOP;

  -- 2) Settle every live simulation match in one pass
  FOR v_match IN
    SELECT id FROM public.matches
     WHERE is_simulation = true AND status = 'live'::public.match_status
     FOR UPDATE
  LOOP
    v_home := floor(random() * 6)::int;
    v_away := floor(random() * 6)::int;
    SELECT public.settle_match_atomic(v_match.id, v_home, v_away) INTO v_preds;
    v_settled_count := v_settled_count + 1;
    v_total_preds := v_total_preds + COALESCE(v_preds, 0);
  END LOOP;

  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000;

  RETURN jsonb_build_object(
    'started', v_started_count,
    'settled', v_settled_count,
    'predictions_settled', v_total_preds,
    'duration_ms', v_duration_ms,
    'avg_ms_per_match', CASE WHEN v_settled_count > 0 THEN v_duration_ms / v_settled_count ELSE 0 END,
    'at', now()
  );
END $$;

-- Stress-test counters across the simulation ledgers
CREATE OR REPLACE FUNCTION public.get_simulation_stress_metrics()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'wallet_txns', (SELECT count(*) FROM public.wallet_transactions WHERE is_simulation = true),
    'platform_txns', (SELECT count(*) FROM public.platform_transactions WHERE is_simulation = true),
    'pool_txns', (SELECT count(*) FROM public.match_pool_transactions WHERE is_simulation = true),
    'predictions_total', (SELECT count(*) FROM public.predictions WHERE is_simulation = true),
    'predictions_settled', (SELECT count(*) FROM public.predictions WHERE is_simulation = true AND status IN ('won','lost','void')),
    'matches_total', (SELECT count(*) FROM public.matches WHERE is_simulation = true),
    'matches_finished', (SELECT count(*) FROM public.matches WHERE is_simulation = true AND status = 'finished'),
    'matches_live', (SELECT count(*) FROM public.matches WHERE is_simulation = true AND status = 'live'),
    'matches_scheduled', (SELECT count(*) FROM public.matches WHERE is_simulation = true AND status = 'scheduled'),
    'pools_settled', (SELECT count(*) FROM public.match_stake_pools WHERE is_simulation = true AND settled = true)
  );
$$;
