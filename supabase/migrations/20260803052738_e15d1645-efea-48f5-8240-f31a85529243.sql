DROP FUNCTION IF EXISTS public.arcade_rps_prepare_round(uuid);

CREATE OR REPLACE FUNCTION public.arcade_rps_prepare_round(p_user uuid)
RETURNS TABLE(out_round_id uuid, out_server_seed_hash text, out_nonce integer, out_expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.arcade_rps_configurations;
  v_seed public.arcade_randomness_seeds;
  v_new_seed text;
  v_round_seed text;
  v_today int;
  v_round public.arcade_rps_rounds;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_cfg FROM public.arcade_rps_configurations WHERE status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;
  IF v_cfg.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;

  UPDATE public.arcade_rps_rounds r
     SET status = 'EXPIRED', result_reason = 'ttl'
   WHERE r.user_id = p_user AND r.status = 'PREPARED' AND r.expires_at < now();

  SELECT count(*) INTO v_today FROM public.arcade_rps_rounds r
   WHERE r.user_id = p_user AND r.status = 'SETTLED' AND r.created_at >= date_trunc('day', now());
  IF v_today >= v_cfg.daily_round_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  SELECT * INTO v_round FROM public.arcade_rps_rounds r
   WHERE r.user_id = p_user AND r.status = 'PREPARED' AND r.expires_at > now()
   ORDER BY r.prepared_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_round.id, v_round.server_seed_hash, v_round.nonce, v_round.expires_at;
    RETURN;
  END IF;

  SELECT * INTO v_seed FROM public.arcade_randomness_seeds s
   WHERE s.user_id = p_user AND s.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    v_new_seed := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.arcade_randomness_seeds(user_id, server_seed, server_seed_hash, client_seed, nonce, status)
      VALUES (p_user, v_new_seed, encode(extensions.digest(v_new_seed,'sha256'),'hex'), '', 0, 'active')
      RETURNING * INTO v_seed;
  END IF;
  UPDATE public.arcade_randomness_seeds s SET nonce = s.nonce + 1
   WHERE s.id = v_seed.id RETURNING * INTO v_seed;

  v_round_seed := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.arcade_rps_rounds(
    user_id, config_id, config_version, status, seed_id, server_seed, server_seed_hash, nonce, expires_at
  ) VALUES (
    p_user, v_cfg.id, v_cfg.version, 'PREPARED', v_seed.id, v_round_seed,
    encode(extensions.digest(v_round_seed,'sha256'),'hex'), v_seed.nonce,
    now() + make_interval(secs => v_cfg.round_ttl_seconds)
  ) RETURNING * INTO v_round;

  RETURN QUERY SELECT v_round.id, v_round.server_seed_hash, v_round.nonce, v_round.expires_at;
END $function$;

REVOKE ALL ON FUNCTION public.arcade_rps_prepare_round(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_rps_prepare_round(uuid) TO service_role;