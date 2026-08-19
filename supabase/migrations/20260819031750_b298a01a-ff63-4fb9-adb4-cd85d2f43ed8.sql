CREATE TABLE IF NOT EXISTS public.ops_pulse_samples (
  id bigserial PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  wal_bytes numeric NOT NULL,
  checkpoints_total bigint NOT NULL,
  active_users integer NOT NULL DEFAULT 0,
  total_balance numeric NOT NULL DEFAULT 0,
  db_connections integer NOT NULL DEFAULT 0
);

GRANT SELECT ON public.ops_pulse_samples TO authenticated;
GRANT ALL ON public.ops_pulse_samples TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ops_pulse_samples_id_seq TO service_role;

ALTER TABLE public.ops_pulse_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read ops pulse samples"
ON public.ops_pulse_samples FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'viewer')
);

CREATE INDEX IF NOT EXISTS ops_pulse_samples_captured_at_idx
  ON public.ops_pulse_samples (captured_at DESC);

CREATE OR REPLACE FUNCTION public.admin_live_pulse()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_wal numeric;
  v_ckpt bigint;
  v_active integer;
  v_balance numeric;
  v_conns integer;
  v_prev public.ops_pulse_samples%ROWTYPE;
  v_secs numeric;
  v_wal_rate numeric := NULL;
  v_ckpt_rate numeric := NULL;
BEGIN
  IF v_uid IS NOT NULL
     AND NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin') OR public.has_role(v_uid,'viewer'))
  THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0'::pg_lsn) INTO v_wal;
  SELECT num_timed + num_requested INTO v_ckpt FROM pg_stat_checkpointer;
  SELECT count(*) INTO v_conns FROM pg_stat_activity;
  SELECT coalesce(sum(balance),0) INTO v_balance FROM public.wallets;

  SELECT count(DISTINCT u) INTO v_active FROM (
    SELECT user_id AS u FROM public.wallet_transactions WHERE created_at > v_now - interval '5 minutes'
    UNION
    SELECT user_id FROM public.predictions WHERE created_at > v_now - interval '5 minutes'
  ) s WHERE u IS NOT NULL;

  SELECT * INTO v_prev FROM public.ops_pulse_samples ORDER BY captured_at DESC LIMIT 1;

  INSERT INTO public.ops_pulse_samples (captured_at, wal_bytes, checkpoints_total, active_users, total_balance, db_connections)
  VALUES (v_now, v_wal, v_ckpt, v_active, v_balance, v_conns);

  IF v_prev.id IS NOT NULL THEN
    v_secs := GREATEST(EXTRACT(EPOCH FROM (v_now - v_prev.captured_at)), 1);
    v_wal_rate := (v_wal - v_prev.wal_bytes) / v_secs * 60;
    v_ckpt_rate := (v_ckpt - v_prev.checkpoints_total)::numeric / v_secs * 3600;
  END IF;

  DELETE FROM public.ops_pulse_samples WHERE captured_at < v_now - interval '6 hours';

  RETURN jsonb_build_object(
    'captured_at', v_now,
    'active_users', v_active,
    'total_balance', v_balance,
    'db_connections', v_conns,
    'wal_bytes', v_wal,
    'wal_bytes_per_min', v_wal_rate,
    'checkpoints_total', v_ckpt,
    'checkpoints_per_hour', v_ckpt_rate,
    'sample_gap_seconds', CASE WHEN v_prev.id IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (v_now - v_prev.captured_at)) END,
    'history', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'captured_at', h.captured_at,
        'active_users', h.active_users,
        'total_balance', h.total_balance,
        'wal_bytes', h.wal_bytes
      ) ORDER BY h.captured_at), '[]'::jsonb)
      FROM (SELECT * FROM public.ops_pulse_samples ORDER BY captured_at DESC LIMIT 60) h
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_live_pulse() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_live_pulse() TO authenticated, service_role;