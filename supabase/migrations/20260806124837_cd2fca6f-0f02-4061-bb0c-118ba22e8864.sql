ALTER TABLE public.arcade_rps_configurations
  ADD COLUMN IF NOT EXISTS ladder_multipliers numeric(10,4)[] NOT NULL DEFAULT ARRAY[1.35,1.35,1.85]::numeric(10,4)[],
  ADD COLUMN IF NOT EXISTS ladder_tail_multiplier numeric(10,4) NOT NULL DEFAULT 2.0;

ALTER TABLE public.arcade_rps_rounds
  ADD COLUMN IF NOT EXISTS parent_round_id uuid REFERENCES public.arcade_rps_rounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ladder_step integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS arcade_rps_rounds_parent_idx ON public.arcade_rps_rounds(parent_round_id);

CREATE OR REPLACE FUNCTION public.arcade_rps_step_multiplier(p_cfg public.arcade_rps_configurations, p_step integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_step <= 0 THEN 1::numeric
    WHEN p_step <= coalesce(array_length(p_cfg.ladder_multipliers,1),0)
      THEN p_cfg.ladder_multipliers[p_step]
    ELSE coalesce(p_cfg.ladder_tail_multiplier, p_cfg.win_multiplier)
  END
$$;

CREATE OR REPLACE FUNCTION public.arcade_rps_prepare_round(p_user uuid, p_parent_round_id uuid DEFAULT NULL)
 RETURNS TABLE(out_round_id uuid, out_server_seed_hash text, out_nonce integer, out_expires_at timestamp with time zone, out_ladder_step integer, out_win_multiplier numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.arcade_rps_configurations;
  v_cfg_version int;
  v_seed public.arcade_randomness_seeds;
  v_new_seed text;
  v_round_seed text;
  v_today int;
  v_round public.arcade_rps_rounds;
  v_parent public.arcade_rps_rounds;
  v_step int := 1;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_cfg_version := public.arcade_config_version_for('rps', p_user);
  SELECT * INTO v_cfg FROM public.arcade_rps_configurations
    WHERE (v_cfg_version IS NOT NULL AND version = v_cfg_version)
       OR (v_cfg_version IS NULL AND status = 'active')
    ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;
  IF v_cfg.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;

  UPDATE public.arcade_rps_rounds r
     SET status = 'EXPIRED', result_reason = 'ttl'
   WHERE r.user_id = p_user AND r.status = 'PREPARED' AND r.expires_at < now();

  SELECT count(*) INTO v_today FROM public.arcade_rps_rounds r
   WHERE r.user_id = p_user AND r.status = 'SETTLED' AND r.created_at >= date_trunc('day', now());
  IF v_today >= v_cfg.daily_round_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  IF p_parent_round_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.arcade_rps_rounds r
     WHERE r.id = p_parent_round_id AND r.user_id = p_user AND r.status = 'SETTLED';
    IF FOUND AND v_parent.outcome IN ('WIN','DRAW') THEN
      -- a draw holds the ladder position, a win advances it
      v_step := v_parent.ladder_step + CASE WHEN v_parent.outcome = 'WIN' THEN 1 ELSE 0 END;
    END IF;
  END IF;

  SELECT * INTO v_round FROM public.arcade_rps_rounds r
   WHERE r.user_id = p_user AND r.status = 'PREPARED' AND r.expires_at > now()
   ORDER BY r.prepared_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_round.id, v_round.server_seed_hash, v_round.nonce, v_round.expires_at,
                        v_round.ladder_step, public.arcade_rps_step_multiplier(v_cfg, v_round.ladder_step);
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
    user_id, config_id, config_version, status, seed_id, server_seed, server_seed_hash, nonce, expires_at,
    parent_round_id, ladder_step
  ) VALUES (
    p_user, v_cfg.id, v_cfg.version, 'PREPARED', v_seed.id, v_round_seed,
    encode(extensions.digest(v_round_seed,'sha256'),'hex'), v_seed.nonce,
    now() + make_interval(secs => v_cfg.round_ttl_seconds),
    CASE WHEN v_parent.id IS NOT NULL THEN v_parent.id ELSE NULL END, v_step
  ) RETURNING * INTO v_round;

  RETURN QUERY SELECT v_round.id, v_round.server_seed_hash, v_round.nonce, v_round.expires_at,
                      v_round.ladder_step, public.arcade_rps_step_multiplier(v_cfg, v_round.ladder_step);
END $function$;

CREATE OR REPLACE FUNCTION public.arcade_rps_settle(p_user uuid, p_round_id uuid, p_player_choice text, p_client_seed text, p_stake numeric, p_idempotency_key text, p_client_reveal_ms integer DEFAULT NULL::integer)
 RETURNS arcade_rps_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_round public.arcade_rps_rounds;
  v_cfg public.arcade_rps_configurations;
  v_wallet public.wallets;
  v_new_balance numeric(14,2);
  v_stake numeric(14,2);
  v_win_mult numeric(10,4);
  v_choice text;
  v_hex text;
  v_input text;
  v_outcome text;
  v_mult numeric(10,4);
  v_gross numeric(14,2);
  v_max_gross numeric(14,2);
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN
    RAISE EXCEPTION 'INVALID_CLIENT_SEED';
  END IF;
  IF p_player_choice NOT IN ('ROCK','PAPER','SCISSORS') THEN
    RAISE EXCEPTION 'INVALID_CHOICE';
  END IF;

  SELECT * INTO v_round FROM public.arcade_rps_rounds
   WHERE user_id = p_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_round.id <> p_round_id OR v_round.player_choice <> p_player_choice THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_round;
  END IF;

  SELECT * INTO v_round FROM public.arcade_rps_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.user_id <> p_user THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'PREPARED' THEN RAISE EXCEPTION 'ROUND_ALREADY_USED'; END IF;
  IF v_round.expires_at < now() THEN
    UPDATE public.arcade_rps_rounds SET status = 'EXPIRED', result_reason = 'ttl' WHERE id = v_round.id;
    RAISE EXCEPTION 'ROUND_EXPIRED';
  END IF;

  SELECT * INTO v_cfg FROM public.arcade_rps_configurations WHERE id = v_round.config_id;
  IF v_cfg.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;

  v_stake := round(coalesce(p_stake,0), 2);
  IF v_stake < v_cfg.min_stake THEN RAISE EXCEPTION 'BELOW_MIN_STAKE'; END IF;
  IF v_stake > v_cfg.max_stake THEN RAISE EXCEPTION 'ABOVE_MAX_STAKE'; END IF;

  v_win_mult := public.arcade_rps_step_multiplier(v_cfg, v_round.ladder_step);

  v_max_gross := round(v_stake * GREATEST(v_win_mult, v_cfg.draw_multiplier), 2);
  PERFORM public.accounting_arcade_assert_capacity('rps', p_user, v_max_gross, v_stake);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets(user_id, balance) VALUES (p_user, 0) RETURNING * INTO v_wallet;
  END IF;
  IF v_wallet.balance < v_stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  UPDATE public.wallets SET balance = balance - v_stake, updated_at = now()
   WHERE user_id = p_user RETURNING balance INTO v_new_balance;
  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, note, transaction_category, metadata
  ) VALUES (
    p_user, 'debit', v_stake, v_new_balance + v_stake, v_new_balance,
    'bet_placement', v_round.id, 'Rock-Paper-Scissors stake', 'arcade_rps',
    jsonb_build_object('idempotency_key', p_idempotency_key, 'round_id', v_round.id)
  );

  PERFORM public.accounting_reserve_liability('rps','rps','arcade_rps_round', v_round.id,
    p_user, v_max_gross, v_stake, v_cfg.version::text,
    jsonb_build_object('player_choice', p_player_choice, 'ladder_step', v_round.ladder_step), true);

  v_input := p_client_seed || ':' || v_round.nonce::text || ':' || v_round.id::text;
  SELECT d.choice, d.random_hex INTO v_choice, v_hex
    FROM public.arcade_rps_draw(v_round.server_seed, v_input) d;

  v_outcome := CASE
    WHEN v_choice = p_player_choice THEN 'DRAW'
    WHEN (p_player_choice = 'ROCK' AND v_choice = 'SCISSORS')
      OR (p_player_choice = 'PAPER' AND v_choice = 'ROCK')
      OR (p_player_choice = 'SCISSORS' AND v_choice = 'PAPER') THEN 'WIN'
    ELSE 'LOSS' END;

  v_mult := CASE v_outcome WHEN 'WIN' THEN v_win_mult
                           WHEN 'DRAW' THEN v_cfg.draw_multiplier
                           ELSE 0 END;
  v_gross := round(v_stake * v_mult, 2);

  IF v_gross > 0 THEN
    UPDATE public.wallets SET balance = balance + v_gross, updated_at = now()
     WHERE user_id = p_user RETURNING balance INTO v_new_balance;
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata
    ) VALUES (
      p_user, 'credit', v_gross, v_new_balance - v_gross, v_new_balance,
      'bet_settlement', v_round.id, 'Rock-Paper-Scissors return', 'arcade_rps',
      jsonb_build_object('outcome', v_outcome, 'multiplier', v_mult, 'stake', v_stake,
                         'ladder_step', v_round.ladder_step)
    );
  END IF;

  UPDATE public.arcade_rps_rounds SET
    status = 'SETTLED',
    player_choice = p_player_choice,
    server_choice = v_choice,
    client_seed = p_client_seed,
    hmac_input = v_input,
    random_hex = v_hex,
    outcome = v_outcome,
    stake = v_stake,
    multiplier = v_mult,
    gross_return = v_gross,
    user_net = v_gross - v_stake,
    house_net = v_stake - v_gross,
    idempotency_key = p_idempotency_key,
    settled_at = now(),
    server_seed_revealed_at = now(),
    client_reveal_ms = p_client_reveal_ms,
    processing_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::int)
  WHERE id = v_round.id RETURNING * INTO v_round;

  PERFORM public.accounting_arcade_hook('rps','arcade_rps_round', v_round.id, p_user,
    v_stake, v_gross, v_round.created_at,
    jsonb_build_object('source','arcade_rps','outcome', v_outcome,
                       'player_choice', p_player_choice, 'server_choice', v_choice,
                       'config_version', v_cfg.version::text,
                       'ladder_step', v_round.ladder_step,
                       'verification_id', v_round.verification_id),
    'arcade_rps', p_idempotency_key);

  RETURN v_round;
END $function$;