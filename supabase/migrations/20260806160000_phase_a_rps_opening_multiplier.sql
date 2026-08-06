-- Rock-Paper-Scissors: lower "opening" win multiplier for win #1 of a
-- fresh ladder run; every win after that keeps compounding at today's flat
-- win_multiplier exactly as before (arcade.rps.tsx ladder: wagerStake =
-- stake x winMultiplier^(wins so far)).
--
-- Player-reported concern: the first round or two of a run "feels" too
-- easy to win for a flat 1.85x return. The RNG itself is unbiased
-- HMAC-SHA256 rejection sampling (arcade_rps_draw) — the server's move is
-- derived from server_seed + clientSeed:nonce:roundId only, committed
-- BEFORE the player chooses, and is statistically independent of the
-- player's move and of how many rounds deep into a run they are. Every
-- round is an independent 1/3 WIN / 1/3 DRAW / 1/3 LOSS draw regardless of
-- opening move or round number. What changes here is only the payout
-- curve, never the odds.
--
-- New shape: win #1 of a run pays opening_win_multiplier (1.35x), win #2+
-- pays win_multiplier (1.85x) same as before. Ladder position is tracked
-- server-side (parent_round_id / chain_win_depth) rather than trusted from
-- the client, so a player cannot claim a fabricated "this is round 3" to
-- dodge the lower opening rate.
--
-- NOTE: this materially raises the house edge on a single, non-laddered
-- bet — EV per round 1 = (1.35 + 1.00 + 0) / 3 = 0.7833, i.e. ~21.7% house
-- edge on round 1 specifically (vs ~5% before). Rounds 2+ are unchanged.

ALTER TABLE public.arcade_rps_configurations
  ADD COLUMN IF NOT EXISTS opening_win_multiplier numeric(10,4) NOT NULL DEFAULT 1.3500;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'arcade_rps_cfg_opening_mult_chk'
  ) THEN
    ALTER TABLE public.arcade_rps_configurations
      ADD CONSTRAINT arcade_rps_cfg_opening_mult_chk
        CHECK (opening_win_multiplier > 0 AND opening_win_multiplier <= win_multiplier);
  END IF;
END $do$;

UPDATE public.arcade_rps_configurations SET opening_win_multiplier = 1.3500, updated_at = now()
 WHERE opening_win_multiplier <> 1.3500;

ALTER TABLE public.arcade_rps_rounds
  ADD COLUMN IF NOT EXISTS parent_round_id uuid REFERENCES public.arcade_rps_rounds(id),
  ADD COLUMN IF NOT EXISTS chain_win_depth int NOT NULL DEFAULT 0;

-- A settled round can seed at most one continuation. Closes the "fan-out"
-- exploit: reusing one win to spawn several independent bets that each
-- falsely claim the (higher) continuation rate instead of the opening rate.
CREATE UNIQUE INDEX IF NOT EXISTS arcade_rps_rounds_parent_once
  ON public.arcade_rps_rounds (parent_round_id) WHERE parent_round_id IS NOT NULL;

-- prepare: same commit-before-choice flow (including the per-environment
-- config resolution added in 20260805155841), now chain-aware. Signature
-- changes (adds p_parent_round_id), so drop the old 1-arg overload first —
-- CREATE OR REPLACE cannot change a function's argument list.
DROP FUNCTION IF EXISTS public.arcade_rps_prepare_round(uuid);

CREATE FUNCTION public.arcade_rps_prepare_round(p_user uuid, p_parent_round_id uuid DEFAULT NULL)
RETURNS TABLE(out_round_id uuid, out_server_seed_hash text, out_nonce integer, out_expires_at timestamp with time zone)
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
  v_chain_depth int := 0;
  v_parent_id uuid := p_parent_round_id;
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

  SELECT * INTO v_round FROM public.arcade_rps_rounds r
   WHERE r.user_id = p_user AND r.status = 'PREPARED' AND r.expires_at > now()
   ORDER BY r.prepared_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_round.id, v_round.server_seed_hash, v_round.nonce, v_round.expires_at;
    RETURN;
  END IF;

  -- Validate the claimed chain parent server-side. A client can only ever
  -- under-claim its own chain depth (falling back to 0, the opening rate),
  -- never inflate it — 0 is always the safer-for-the-house default.
  IF v_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.arcade_rps_rounds
     WHERE id = v_parent_id AND user_id = p_user AND status = 'SETTLED'
       AND outcome IN ('WIN','DRAW');
    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM public.arcade_rps_rounds WHERE parent_round_id = v_parent_id
    ) THEN
      v_chain_depth := v_parent.chain_win_depth + (CASE WHEN v_parent.outcome = 'WIN' THEN 1 ELSE 0 END);
    ELSE
      v_parent_id := NULL;
      v_chain_depth := 0;
    END IF;
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
    parent_round_id, chain_win_depth
  ) VALUES (
    p_user, v_cfg.id, v_cfg.version, 'PREPARED', v_seed.id, v_round_seed,
    encode(extensions.digest(v_round_seed,'sha256'),'hex'), v_seed.nonce,
    now() + make_interval(secs => v_cfg.round_ttl_seconds),
    v_parent_id, v_chain_depth
  ) RETURNING * INTO v_round;

  RETURN QUERY SELECT v_round.id, v_round.server_seed_hash, v_round.nonce, v_round.expires_at;
END $function$;

REVOKE ALL ON FUNCTION public.arcade_rps_prepare_round(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_rps_prepare_round(uuid, uuid) TO service_role;

-- settle: same signature, chain-aware multiplier selection.
CREATE OR REPLACE FUNCTION public.arcade_rps_settle(
  p_user uuid,
  p_round_id uuid,
  p_player_choice text,
  p_client_seed text,
  p_stake numeric,
  p_idempotency_key text,
  p_client_reveal_ms int DEFAULT NULL
)
 RETURNS public.arcade_rps_rounds
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
  v_choice text;
  v_hex text;
  v_input text;
  v_outcome text;
  v_win_mult numeric(10,4);
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

  -- retry short-circuit: identical key returns the already-settled round untouched
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

  -- win #1 of a fresh chain (chain_win_depth = 0, fixed at prepare time,
  -- immune to client tampering) pays the opening rate; every win after
  -- that pays the standard rate exactly as before.
  v_win_mult := CASE WHEN v_round.chain_win_depth = 0 THEN v_cfg.opening_win_multiplier ELSE v_cfg.win_multiplier END;

  v_max_gross := round(v_stake * v_win_mult, 2);
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
    jsonb_build_object('player_choice', p_player_choice), true);

  -- derive the server move from the seed committed at prepare time
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
      jsonb_build_object('outcome', v_outcome, 'multiplier', v_mult, 'stake', v_stake)
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
                       'verification_id', v_round.verification_id),
    'arcade_rps', p_idempotency_key);

  RETURN v_round;
END $function$;

-- Replay self-test must also resolve the tiered rate by the round's own
-- immutable chain_win_depth, not a single flat win_multiplier.
CREATE OR REPLACE FUNCTION public.arcade_config_selftest()
RETURNS TABLE(check_name text, passed boolean, detail text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.arcade_rps_rounds;
  v_cfg   public.arcade_rps_configurations;
  v_expected numeric(14,2);
  v_bad int := 0;
  v_n int := 0;
  r record;
  v_msg text;
BEGIN
  -- 1. environment matrix -------------------------------------------------
  FOR r IN SELECT unnest(ARRAY['plinko','rps','blackjack']) AS p LOOP
    check_name := format('env_matrix_%s', r.p);
    detail := format('PRODUCTION=v%s SIMULATION=v%s TEST=v%s',
      public.arcade_config_version_in_env(r.p,'PRODUCTION'),
      public.arcade_config_version_in_env(r.p,'SIMULATION'),
      public.arcade_config_version_in_env(r.p,'TEST'));
    passed := public.arcade_config_version_in_env(r.p,'PRODUCTION') = 1
          AND public.arcade_config_version_in_env(r.p,'SIMULATION') = 2
          AND public.arcade_config_version_in_env(r.p,'TEST') = 2;
    RETURN NEXT;
  END LOOP;

  -- 2. missing activation fails safe --------------------------------------
  BEGIN
    PERFORM public.arcade_config_version_in_env('__nonexistent__','PRODUCTION');
    check_name := 'missing_activation_fails_safe'; passed := false;
    detail := 'resolver returned a value for an unactivated product';
  EXCEPTION WHEN OTHERS THEN
    check_name := 'missing_activation_fails_safe'; passed := true;
    detail := SQLERRM;
  END;
  RETURN NEXT;

  -- 3. promotion requires an admin ----------------------------------------
  BEGIN
    PERFORM public.arcade_promote_config('rps','TEST',1,'selftest must not succeed');
    check_name := 'promotion_requires_admin'; passed := false;
    detail := 'promotion succeeded without an admin caller';
  EXCEPTION WHEN OTHERS THEN
    check_name := 'promotion_requires_admin'; passed := true; detail := SQLERRM;
  END;
  RETURN NEXT;

  BEGIN
    PERFORM public.arcade_rollback_config('rps','TEST','selftest must not succeed');
    check_name := 'rollback_requires_admin'; passed := false;
    detail := 'rollback succeeded without an admin caller';
  EXCEPTION WHEN OTHERS THEN
    check_name := 'rollback_requires_admin'; passed := true; detail := SQLERRM;
  END;
  RETURN NEXT;

  -- 4. round configuration is immutable ------------------------------------
  SELECT * INTO v_round FROM public.arcade_rps_rounds
   WHERE status = 'SETTLED' ORDER BY settled_at DESC LIMIT 1;
  IF FOUND THEN
    BEGIN
      UPDATE public.arcade_rps_rounds SET config_version = config_version + 1 WHERE id = v_round.id;
      check_name := 'round_config_immutable'; passed := false;
      detail := 'config_version was mutable on a settled round';
      RAISE EXCEPTION 'ROLLBACK_SELFTEST';
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        check_name := 'round_config_immutable';
        passed := v_msg LIKE 'ROUND_CONFIG_IMMUTABLE%';
        detail := v_msg;
    END;
    RETURN NEXT;

    -- 5. flipping activation does not change a stored round ----------------
    BEGIN
      UPDATE public.arcade_config_activation
         SET config_version = CASE WHEN config_version = 1 THEN 2 ELSE 1 END
       WHERE product = 'rps' AND environment = 'SIMULATION';
      SELECT * INTO v_cfg FROM public.arcade_rps_configurations WHERE id = v_round.config_id;
      check_name := 'round_pinned_across_activation_flip';
      passed := v_cfg.version = v_round.config_version;
      detail := format('round v%s still resolves config v%s while SIMULATION was flipped',
                       v_round.config_version, v_cfg.version);
      RAISE EXCEPTION 'ROLLBACK_SELFTEST';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg <> 'ROLLBACK_SELFTEST' THEN
        check_name := 'round_pinned_across_activation_flip'; passed := false; detail := v_msg;
      END IF;
    END;
    RETURN NEXT;
  END IF;

  -- 6. replay recent settled rounds against their stored configuration -----
  FOR r IN
    SELECT ro.stake, ro.outcome, ro.gross_return, ro.chain_win_depth,
           c.win_multiplier, c.opening_win_multiplier, c.draw_multiplier, c.version
      FROM public.arcade_rps_rounds ro
      JOIN public.arcade_rps_configurations c ON c.id = ro.config_id
     WHERE ro.status = 'SETTLED'
     ORDER BY ro.settled_at DESC LIMIT 500
  LOOP
    v_n := v_n + 1;
    v_expected := round(r.stake * CASE r.outcome
      WHEN 'WIN' THEN (CASE WHEN r.chain_win_depth = 0 THEN r.opening_win_multiplier ELSE r.win_multiplier END)
      WHEN 'DRAW' THEN r.draw_multiplier ELSE 0 END, 2);
    IF v_expected <> r.gross_return THEN v_bad := v_bad + 1; END IF;
  END LOOP;
  check_name := 'historical_replay_matches_stored_config';
  passed := v_bad = 0;
  detail := format('%s rounds replayed, %s mismatches', v_n, v_bad);
  RETURN NEXT;

  -- 7. capacity enforcement (Phase A: all liability-enforced arcade) -------
  SELECT count(*) INTO v_bad FROM public.accounting_migration_flags
   WHERE product IN ('plinko','rps','blackjack','roulette','treasure')
     AND liability_enforced = true
     AND capacity_enforced = false;
  check_name := 'capacity_enforced';
  passed := v_bad = 0;
  detail := format('%s liability-enforced arcade products with capacity_enforced=false', v_bad);
  RETURN NEXT;

  -- 8. every arcade product honours a 1-point minimum stake ---------------
  SELECT count(*) INTO v_bad FROM (
    SELECT 'rps' AS product WHERE EXISTS (
      SELECT 1 FROM public.arcade_rps_configurations WHERE status = 'active' AND min_stake > 1)
    UNION ALL
    SELECT 'blackjack' WHERE EXISTS (
      SELECT 1 FROM public.arcade_bj_rule_configs WHERE status = 'active' AND min_stake > 1)
    UNION ALL
    SELECT 'treasure' WHERE EXISTS (
      SELECT 1 FROM public.arcade_treasure_configurations WHERE status = 'active' AND min_stake > 1)
    UNION ALL
    SELECT 'roulette' WHERE EXISTS (
      SELECT 1 FROM public.arcade_roulette_configurations WHERE status = 'active' AND min_total_stake > 1)
  ) offenders;
  check_name := 'min_stake_floor_consistent';
  passed := v_bad = 0;
  detail := format('%s active arcade configs with a minimum stake above 1 point', v_bad);
  RETURN NEXT;

  -- 9. RPS ladder chain cannot be fanned out (parent used more than once) --
  SELECT count(*) INTO v_bad FROM (
    SELECT parent_round_id FROM public.arcade_rps_rounds
     WHERE parent_round_id IS NOT NULL
     GROUP BY parent_round_id HAVING count(*) > 1
  ) forks;
  check_name := 'rps_ladder_chain_not_forked';
  passed := v_bad = 0;
  detail := format('%s RPS rounds reused as a parent by more than one continuation', v_bad);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_config_selftest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arcade_config_selftest() TO service_role;
