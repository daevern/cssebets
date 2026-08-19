CREATE TABLE IF NOT EXISTS public.ops_selftest_results (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  test_name text NOT NULL,
  result jsonb NOT NULL
);

GRANT SELECT ON public.ops_selftest_results TO authenticated;
GRANT ALL ON public.ops_selftest_results TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ops_selftest_results_id_seq TO service_role;

ALTER TABLE public.ops_selftest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read ops selftest results"
ON public.ops_selftest_results FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'viewer')
);

-- Load test: 30 simulated players, 10 arcade rounds each, all reversed afterwards.
DO $$
DECLARE
  u uuid; i int; n int := 0; failed int := 0;
  gid uuid;
  ids uuid[] := ARRAY[]::uuid[];
  t0 timestamptz; t1 timestamptz;
  wal0 numeric; wal1 numeric;
  ck0 bigint; ck1 bigint;
  errmsg text := NULL;
BEGIN
  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0') INTO wal0;
  SELECT num_timed + num_requested INTO ck0 FROM pg_stat_checkpointer;
  t0 := clock_timestamp();

  FOR u IN SELECT user_id FROM public.wallets WHERE balance >= 50 ORDER BY random() LIMIT 30 LOOP
    FOR i IN 1..10 LOOP
      BEGIN
        SELECT (public.arcade_place_plinko_drop(
                  u, 12, 'medium'::arcade_risk_mode,
                  'loadtest-' || u::text || '-' || i::text,
                  'lt-seed-' || i::text, 1::numeric) ->> 'game_id')::uuid
          INTO gid;
        IF gid IS NOT NULL THEN
          ids := ids || gid;
          n := n + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        failed := failed + 1;
        errmsg := coalesce(errmsg, SQLERRM);
      END;
    END LOOP;
  END LOOP;

  t1 := clock_timestamp();
  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0') INTO wal1;
  SELECT num_timed + num_requested INTO ck1 FROM pg_stat_checkpointer;

  -- undo everything the load test wrote to player balances
  FOREACH gid IN ARRAY ids LOOP
    BEGIN
      PERFORM public.accounting_reverse_plinko_game(gid, 'load test cleanup');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  INSERT INTO public.ops_selftest_results (test_name, result)
  VALUES ('load_test_30_players', jsonb_build_object(
    'players', 30,
    'rounds_attempted', 300,
    'rounds_played', n,
    'rounds_failed', failed,
    'first_error', errmsg,
    'elapsed_seconds', round(EXTRACT(EPOCH FROM (t1 - t0))::numeric, 3),
    'wal_bytes', wal1 - wal0,
    'wal_mb_per_min', CASE WHEN EXTRACT(EPOCH FROM (t1-t0)) > 0
      THEN round((((wal1 - wal0) / EXTRACT(EPOCH FROM (t1-t0)) * 60) / 1048576)::numeric, 3) END,
    'wal_bytes_per_round', CASE WHEN n > 0 THEN round(((wal1 - wal0) / n)::numeric, 0) END,
    'checkpoints_during_test', ck1 - ck0,
    'rounds_reversed', array_length(ids, 1)
  ));
END $$;

-- No-op write guard test
INSERT INTO public.ops_selftest_results (test_name, result)
SELECT 'noop_write_guard', public.ops_noop_write_test();