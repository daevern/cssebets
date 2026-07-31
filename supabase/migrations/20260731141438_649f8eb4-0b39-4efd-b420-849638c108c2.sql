-- ============ Mini Roulette ============
CREATE OR REPLACE FUNCTION public.arcade_place_roulette_spin(
  p_user uuid, p_idempotency_key text, p_client_seed text, p_bets jsonb)
RETURNS public.arcade_roulette_spins
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_existing public.arcade_roulette_spins;
  v_cfg public.arcade_roulette_configurations;
  v_seed public.arcade_randomness_seeds;
  v_new_server_seed text;
  v_wallet public.wallets;
  v_new_balance numeric(14,2);
  v_bet jsonb;
  v_total_stake numeric(14,2) := 0;
  v_count int := 0;
  v_pockets smallint[];
  v_covered int;
  v_stake numeric(14,2);
  v_pocket smallint;
  v_hex text;
  v_colour text;
  v_mult numeric(10,4);
  v_gross numeric(14,2);
  v_total_return numeric(14,2) := 0;
  v_wins int := 0;
  v_losses int := 0;
  v_status public.arcade_roulette_status;
  v_spin public.arcade_roulette_spins;
  v_today_count int;
  v_max_gross numeric(14,2) := 0;
  v_p smallint;
  v_pocket_gross numeric(14,2);
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN
    RAISE EXCEPTION 'INVALID_CLIENT_SEED';
  END IF;

  SELECT * INTO v_existing FROM public.arcade_roulette_spins
    WHERE user_id = p_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO v_cfg FROM public.arcade_roulette_configurations WHERE status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;
  IF v_cfg.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;

  IF p_bets IS NULL OR jsonb_typeof(p_bets) <> 'array' OR jsonb_array_length(p_bets) = 0 THEN
    RAISE EXCEPTION 'NO_BETS';
  END IF;
  IF jsonb_array_length(p_bets) > v_cfg.max_positions THEN
    RAISE EXCEPTION 'TOO_MANY_POSITIONS';
  END IF;

  FOR v_bet IN SELECT * FROM jsonb_array_elements(p_bets) LOOP
    v_stake := round((v_bet->>'stake')::numeric, 2);
    SELECT array_agg(DISTINCT x)::smallint[] INTO v_pockets
      FROM jsonb_array_elements_text(v_bet->'pockets') AS t(x);
    v_covered := coalesce(array_length(v_pockets, 1), 0);
    IF v_covered NOT IN (1,2,3,4,6) THEN RAISE EXCEPTION 'INVALID_COVERAGE'; END IF;
    IF v_covered <> jsonb_array_length(v_bet->'pockets') THEN RAISE EXCEPTION 'INVALID_COVERAGE'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_pockets) p WHERE p < 0 OR p > 12) THEN
      RAISE EXCEPTION 'INVALID_POCKET';
    END IF;
    IF v_stake IS NULL OR v_stake <= 0 THEN RAISE EXCEPTION 'INVALID_STAKE'; END IF;
    IF v_stake > v_cfg.max_stake_per_position THEN RAISE EXCEPTION 'POSITION_LIMIT'; END IF;
    v_total_stake := v_total_stake + v_stake;
    v_count := v_count + 1;
  END LOOP;

  IF v_total_stake < v_cfg.min_total_stake THEN RAISE EXCEPTION 'BELOW_MIN_STAKE'; END IF;
  IF v_total_stake > v_cfg.max_total_stake THEN RAISE EXCEPTION 'ABOVE_MAX_STAKE'; END IF;

  -- Phase 6: result-specific exposure. For each possible pocket, sum the gross
  -- return of the bets that win on it; the maximum across pockets is the true
  -- exposure (never the sum of independent per-bet maxima).
  FOR v_p IN 0..12 LOOP
    v_pocket_gross := 0;
    FOR v_bet IN SELECT * FROM jsonb_array_elements(p_bets) LOOP
      v_stake := round((v_bet->>'stake')::numeric, 2);
      SELECT array_agg(DISTINCT x)::smallint[] INTO v_pockets
        FROM jsonb_array_elements_text(v_bet->'pockets') AS t(x);
      IF v_p = ANY (v_pockets) THEN
        v_pocket_gross := v_pocket_gross
          + round(v_stake * round(12.0 / array_length(v_pockets,1), 4), 2);
      END IF;
    END LOOP;
    IF v_pocket_gross > v_max_gross THEN v_max_gross := v_pocket_gross; END IF;
  END LOOP;

  SELECT count(*) INTO v_today_count FROM public.arcade_roulette_spins
    WHERE user_id = p_user AND created_at >= date_trunc('day', now());
  IF v_today_count >= v_cfg.daily_spin_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  PERFORM public.accounting_arcade_assert_capacity('roulette', p_user, v_max_gross, v_total_stake);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets(user_id, balance) VALUES (p_user, 0) RETURNING * INTO v_wallet;
  END IF;
  IF v_wallet.balance < v_total_stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  SELECT * INTO v_seed FROM public.arcade_randomness_seeds
    WHERE user_id = p_user AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    v_new_server_seed := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.arcade_randomness_seeds(user_id, server_seed, server_seed_hash, client_seed, nonce, status)
      VALUES (p_user, v_new_server_seed,
              encode(extensions.digest(v_new_server_seed,'sha256'),'hex'),
              p_client_seed, 0, 'active')
      RETURNING * INTO v_seed;
  END IF;
  UPDATE public.arcade_randomness_seeds SET nonce = nonce + 1
    WHERE id = v_seed.id RETURNING * INTO v_seed;

  SELECT d.pocket, d.random_hex INTO v_pocket, v_hex
    FROM public.arcade_roulette_draw(v_seed.server_seed, p_client_seed, v_seed.nonce) d;

  v_colour := CASE WHEN v_pocket = 0 THEN 'green'
                   WHEN v_pocket = ANY (v_cfg.red_pockets) THEN 'red'
                   ELSE 'black' END;

  UPDATE public.wallets SET balance = balance - v_total_stake, updated_at = now()
    WHERE user_id = p_user RETURNING balance INTO v_new_balance;
  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after,
    reference_type, note, transaction_category, metadata
  ) VALUES (
    p_user, 'debit', v_total_stake, v_new_balance + v_total_stake, v_new_balance,
    'bet_placement', 'Roulette spin stake', 'arcade_roulette',
    jsonb_build_object('idempotency_key', p_idempotency_key, 'positions', v_count)
  );

  INSERT INTO public.arcade_roulette_spins(
    user_id, config_id, config_version, seed_id, nonce, client_seed, server_seed_hash,
    random_hex, winning_pocket, winning_colour, total_stake, position_count,
    status, idempotency_key, verification_id
  ) VALUES (
    p_user, v_cfg.id, v_cfg.version, v_seed.id, v_seed.nonce, p_client_seed, v_seed.server_seed_hash,
    v_hex, v_pocket, v_colour, v_total_stake, v_count,
    'PENDING', p_idempotency_key, encode(extensions.gen_random_bytes(8),'hex')
  ) RETURNING * INTO v_spin;

  PERFORM public.accounting_reserve_liability('roulette','roulette','arcade_roulette_spin', v_spin.id,
    p_user, v_max_gross, v_total_stake, v_cfg.version::text,
    jsonb_build_object('positions', v_count), true);

  FOR v_bet IN SELECT * FROM jsonb_array_elements(p_bets) LOOP
    v_stake := round((v_bet->>'stake')::numeric, 2);
    SELECT array_agg(DISTINCT x)::smallint[] INTO v_pockets
      FROM jsonb_array_elements_text(v_bet->'pockets') AS t(x);
    v_covered := array_length(v_pockets, 1);
    v_mult := round(12.0 / v_covered, 4);
    IF v_pocket = ANY (v_pockets) THEN
      v_gross := round(v_stake * v_mult, 2);
      v_wins := v_wins + 1;
    ELSE
      v_gross := 0;
      v_losses := v_losses + 1;
    END IF;
    v_total_return := v_total_return + v_gross;
    INSERT INTO public.arcade_roulette_bets(
      spin_id, user_id, bet_type, bet_label, covered_pockets, covered_count,
      stake, return_multiplier, winning_pocket, is_win, gross_return, net_result
    ) VALUES (
      v_spin.id, p_user,
      coalesce(v_bet->>'bet_type','custom'),
      coalesce(v_bet->>'label', coalesce(v_bet->>'bet_type','custom')),
      v_pockets, v_covered, v_stake, v_mult, v_pocket,
      v_gross > 0, v_gross, v_gross - v_stake
    );
  END LOOP;

  IF v_total_return > 0 THEN
    UPDATE public.wallets SET balance = balance + v_total_return, updated_at = now()
      WHERE user_id = p_user RETURNING balance INTO v_new_balance;
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata
    ) VALUES (
      p_user, 'credit', v_total_return, v_new_balance - v_total_return, v_new_balance,
      'bet_settlement', v_spin.id, 'Roulette return', 'arcade_roulette',
      jsonb_build_object('winning_pocket', v_pocket, 'total_stake', v_total_stake)
    );
  END IF;

  v_status := CASE WHEN v_total_return > v_total_stake THEN 'WIN'
                   WHEN v_total_return = v_total_stake THEN 'PUSH'
                   ELSE 'LOSS' END::public.arcade_roulette_status;

  UPDATE public.arcade_roulette_spins SET
    total_return = v_total_return,
    user_net = v_total_return - v_total_stake,
    house_net = v_total_stake - v_total_return,
    winning_positions = v_wins,
    losing_positions = v_losses,
    status = v_status,
    completed_at = now(),
    processing_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::int)
  WHERE id = v_spin.id RETURNING * INTO v_spin;

  PERFORM public.accounting_arcade_hook('roulette','arcade_roulette_spin', v_spin.id, p_user,
    v_total_stake, v_total_return, v_spin.created_at,
    jsonb_build_object('source','arcade_roulette','winning_pocket', v_pocket,
                       'positions', v_count, 'status', v_status,
                       'verification_id', v_spin.verification_id),
    'arcade_roulette', p_idempotency_key);

  RETURN v_spin;
END;
$fn$;

-- ============ Treasure Grid ============
CREATE OR REPLACE FUNCTION public.arcade_treasure_start_round(
  p_user uuid, p_difficulty text, p_stake integer, p_client_seed text, p_idempotency_key text)
RETURNS public.arcade_treasure_rounds
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_existing public.arcade_treasure_rounds;
  c public.arcade_treasure_configurations;
  v_seed public.arcade_randomness_seeds;
  v_new_seed text;
  v_wallet public.wallets;
  v_new_balance numeric(14,2);
  v_traps int[]; v_n int; v_t int;
  v_max_mult numeric; v_max_ret numeric;
  v_round public.arcade_treasure_rounds;
  v_today int;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN RAISE EXCEPTION 'INVALID_CLIENT_SEED'; END IF;

  SELECT * INTO v_existing FROM public.arcade_treasure_rounds
    WHERE user_id = p_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO c FROM public.arcade_treasure_configurations
    WHERE difficulty = p_difficulty AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_DIFFICULTY'; END IF;
  IF c.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;

  IF p_stake IS NULL OR p_stake < c.min_stake THEN RAISE EXCEPTION 'BELOW_MIN_STAKE'; END IF;
  IF p_stake > c.max_stake THEN RAISE EXCEPTION 'ABOVE_MAX_STAKE'; END IF;

  SELECT count(*) INTO v_today FROM public.arcade_treasure_rounds
    WHERE user_id = p_user AND created_at >= date_trunc('day', now());
  IF v_today >= c.daily_round_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  IF EXISTS (SELECT 1 FROM public.arcade_treasure_rounds
             WHERE user_id = p_user AND status IN ('CREATED','ACTIVE','COLLECTING')) THEN
    RAISE EXCEPTION 'ACTIVE_ROUND_EXISTS';
  END IF;

  SELECT max(actual_multiplier) INTO v_max_mult
    FROM public.arcade_treasure_multiplier_tables WHERE config_id = c.id;
  v_max_ret := floor(p_stake * coalesce(v_max_mult, 1));
  IF v_max_ret > c.max_return THEN RAISE EXCEPTION 'EXPOSURE_LIMIT'; END IF;

  -- Phase 6: maximum collect return is the gross exposure; net liability is
  -- checked against available bankroll and reserved for the life of the round.
  PERFORM public.accounting_arcade_assert_capacity('treasure', p_user, v_max_ret, p_stake);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets(user_id, balance) VALUES (p_user, 0) RETURNING * INTO v_wallet;
  END IF;
  IF v_wallet.balance < p_stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  SELECT * INTO v_seed FROM public.arcade_randomness_seeds
    WHERE user_id = p_user AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    v_new_seed := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.arcade_randomness_seeds(user_id, server_seed, server_seed_hash, client_seed, nonce, status)
      VALUES (p_user, v_new_seed, encode(extensions.digest(v_new_seed,'sha256'),'hex'), p_client_seed, 0, 'active')
      RETURNING * INTO v_seed;
  END IF;
  UPDATE public.arcade_randomness_seeds SET nonce = nonce + 1, client_seed = p_client_seed
    WHERE id = v_seed.id RETURNING * INTO v_seed;

  v_n := c.grid_rows * c.grid_cols;
  v_t := c.trap_count;
  v_traps := public.arcade_treasure_generate_traps(v_seed.server_seed, p_client_seed, v_seed.nonce, v_n, v_t);

  v_new_balance := v_wallet.balance - p_stake;
  UPDATE public.wallets SET balance = v_new_balance WHERE user_id = p_user;

  INSERT INTO public.arcade_treasure_rounds(
    user_id, status, difficulty, grid_rows, grid_cols, trap_count, stake,
    config_id, config_version, rtp_version, seed_id, client_seed, server_seed_hash,
    nonce, verification_id, state_version, idempotency_key, expires_at
  ) VALUES (
    p_user, 'ACTIVE', c.difficulty, c.grid_rows, c.grid_cols, v_t, p_stake,
    c.id, c.version, c.rtp_version, v_seed.id, p_client_seed, v_seed.server_seed_hash,
    v_seed.nonce, encode(extensions.gen_random_bytes(9),'hex'), 1, p_idempotency_key,
    now() + make_interval(secs => c.round_timeout_seconds)
  ) RETURNING * INTO v_round;

  PERFORM public.accounting_reserve_liability('treasure','treasure','arcade_treasure_round',
    v_round.id, p_user, v_max_ret, p_stake, c.version::text,
    jsonb_build_object('difficulty', c.difficulty, 'trap_count', v_t));

  INSERT INTO public.arcade_treasure_tiles(round_id, tile_index, tile_type)
  SELECT v_round.id, g, CASE WHEN g = ANY(v_traps) THEN 'TRAP' ELSE 'SAFE' END
    FROM generate_series(0, v_n - 1) g;

  INSERT INTO public.arcade_treasure_round_actions(
    round_id, user_id, action_type, action_sequence, state_version_before, state_version_after,
    multiplier_after, potential_return_after, idempotency_key
  ) VALUES (v_round.id, p_user, 'START', 1, 0, 1, 1, p_stake, p_idempotency_key);

  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after, reference_type, reference_id,
    note, transaction_category, metadata
  ) VALUES (
    p_user, 'debit', p_stake, v_wallet.balance, v_new_balance, 'bet_placement', v_round.id,
    'Treasure Grid stake', 'arcade_treasure',
    jsonb_build_object('difficulty', c.difficulty, 'trap_count', v_t, 'config_version', c.version)
  );

  PERFORM public.accounting_arcade_hook('treasure','arcade_treasure_round', v_round.id, p_user,
    p_stake, 0, v_round.created_at,
    jsonb_build_object('source','arcade_treasure','difficulty',c.difficulty,'trap_count',v_t,
                       'config_version',c.version,'verification_id',v_round.verification_id),
    'arcade_treasure', p_idempotency_key);

  RETURN v_round;
END;
$fn$;