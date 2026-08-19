CREATE OR REPLACE FUNCTION public.ops_noop_write_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_orig numeric;
  v_xmin_0 bigint;
  v_xmin_after_noop bigint;
  v_xmin_after_change bigint;
  v_wal_0 numeric; v_wal_1 numeric; v_wal_2 numeric;
BEGIN
  IF v_uid IS NOT NULL
     AND NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin'))
  THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id, odds INTO v_id, v_orig
  FROM public.match_market_odds
  WHERE active = true
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no active market odds row');
  END IF;

  SELECT xmin::text::bigint INTO v_xmin_0 FROM public.match_market_odds WHERE id = v_id;
  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0') INTO v_wal_0;

  -- 1) no-change heartbeat: write the exact same odds back
  UPDATE public.match_market_odds SET odds = v_orig, updated_at = now() WHERE id = v_id;
  SELECT xmin::text::bigint INTO v_xmin_after_noop FROM public.match_market_odds WHERE id = v_id;
  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0') INTO v_wal_1;

  -- 2) real price change
  UPDATE public.match_market_odds SET odds = round(v_orig + 0.01, 2), updated_at = now() WHERE id = v_id;
  SELECT xmin::text::bigint INTO v_xmin_after_change FROM public.match_market_odds WHERE id = v_id;
  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0') INTO v_wal_2;

  -- restore
  UPDATE public.match_market_odds SET odds = v_orig WHERE id = v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'row_id', v_id,
    'original_odds', v_orig,
    'noop_write_skipped', (v_xmin_after_noop = v_xmin_0),
    'real_change_written', (v_xmin_after_change <> v_xmin_after_noop),
    'wal_bytes_noop', v_wal_1 - v_wal_0,
    'wal_bytes_real_change', v_wal_2 - v_wal_1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_noop_write_test() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ops_noop_write_test() TO authenticated, service_role;