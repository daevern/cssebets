DO $$
DECLARE
  u uuid; i int; n int := 0; failed int := 0;
  g public.arcade_plinko_games;
  gid uuid;
  ids uuid[] := ARRAY[]::uuid[];
  t0 timestamptz; t1 timestamptz;
  wal0 numeric; wal1 numeric;
  ck0 bigint; ck1 bigint;
  errmsg text := NULL;
BEGIN
  SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(),'0/0') INTO wal0;
  SELECT num_timed + num_requested INTO ck0 FROM pg_stat_checkpointer;
  t0 := clock_timestamp();

  FOR u IN SELECT user_id FROM public.wallets WHERE balance >= 50 ORDER BY random() LIMIT 30 LOOP
    FOR i IN 1..10 LOOP
      BEGIN
        g := public.arcade_place_plinko_drop(
               u, 12, 'medium'::arcade_risk_mode,
               'loadtest2-' || u::text || '-' || i::text,
               'lt-seed-' || i::text, 1::numeric);
        IF g.id IS NOT NULL THEN
          ids := ids || g.id;
          n := n + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        failed := failed + 1;
        errmsg := coalesce(errmsg, SQLERRM);
      END;
    END LOOP;
  END LOOP;

  t1 := clock_timestamp();
  SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(),'0/0') INTO wal1;
  SELECT num_timed + num_requested INTO ck1 FROM pg_stat_checkpointer;

  FOREACH gid IN ARRAY coalesce(ids, ARRAY[]::uuid[]) LOOP
    BEGIN
      PERFORM public.accounting_reverse_plinko_game(gid, 'load test cleanup');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  INSERT INTO public.ops_selftest_results (test_name, result)
  VALUES ('load_test_30_players_v2', jsonb_build_object(
    'players', 30,
    'rounds_attempted', 300,
    'rounds_played', n,
    'rounds_failed', failed,
    'first_error', errmsg,
    'elapsed_seconds', round(EXTRACT(EPOCH FROM (t1 - t0))::numeric, 3),
    'rounds_per_second', CASE WHEN EXTRACT(EPOCH FROM (t1-t0)) > 0
      THEN round((n / EXTRACT(EPOCH FROM (t1-t0)))::numeric, 2) END,
    'wal_bytes', wal1 - wal0,
    'wal_mb_per_min', CASE WHEN EXTRACT(EPOCH FROM (t1-t0)) > 0
      THEN round((((wal1 - wal0) / EXTRACT(EPOCH FROM (t1-t0)) * 60) / 1048576)::numeric, 3) END,
    'wal_bytes_per_round', CASE WHEN n > 0 THEN round(((wal1 - wal0) / n)::numeric, 0) END,
    'checkpoints_during_test', ck1 - ck0,
    'rounds_reversed', coalesce(array_length(ids, 1), 0)
  ));
END $$;