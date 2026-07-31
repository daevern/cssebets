
-- ---------- shared hook: honours migration flags, strict when journal_enabled ----------
CREATE OR REPLACE FUNCTION public.accounting_arcade_hook(
  p_product text, p_ref_type text, p_ref_id uuid, p_user uuid,
  p_stake numeric, p_payout numeric, p_effective timestamptz,
  p_meta jsonb, p_wallet_category text, p_wallet_idem text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_flags public.accounting_migration_flags;
BEGIN
  SELECT * INTO v_flags FROM public.accounting_migration_flags WHERE product = p_product;
  IF NOT FOUND OR NOT (v_flags.journal_enabled OR v_flags.dual_write) THEN RETURN; END IF;

  IF v_flags.journal_enabled THEN
    PERFORM public.accounting_post_arcade_settlement(p_product, p_ref_type, p_ref_id, p_user,
      p_stake, p_payout, p_effective, p_meta, p_wallet_category, p_wallet_idem);
  ELSE
    BEGIN
      PERFORM public.accounting_post_arcade_settlement(p_product, p_ref_type, p_ref_id, p_user,
        p_stake, p_payout, p_effective, p_meta, p_wallet_category, p_wallet_idem);
    EXCEPTION WHEN others THEN
      UPDATE public.wallet_transactions
         SET accounting_sync_status = 'ERROR', accounting_sync_error = SQLERRM
       WHERE transaction_category = p_wallet_category
         AND user_id = p_user
         AND (reference_id = p_ref_id
              OR (p_wallet_idem IS NOT NULL AND metadata->>'idempotency_key' = p_wallet_idem));
    END;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.accounting_arcade_hook(text,text,uuid,uuid,numeric,numeric,timestamptz,jsonb,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_arcade_hook(text,text,uuid,uuid,numeric,numeric,timestamptz,jsonb,text,text) TO service_role;

-- shared exposure guard (locks the reserve row for the transaction)
CREATE OR REPLACE FUNCTION public.accounting_arcade_assert_capacity(
  p_product text, p_user uuid, p_max_gross numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_flags public.accounting_migration_flags; v_env public.acct_environment; v_reserve numeric(18,2);
BEGIN
  SELECT * INTO v_flags FROM public.accounting_migration_flags WHERE product = p_product;
  IF NOT FOUND OR NOT v_flags.journal_enabled THEN RETURN; END IF;
  SELECT a.environment INTO v_env FROM public.accounting_accounts a
   WHERE a.user_id = p_user AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  IF v_env IS NULL THEN RETURN; END IF;
  v_reserve := public.accounting_available_reserve_locked(v_env);
  IF round(coalesce(p_max_gross,0),2) > v_reserve THEN
    RAISE EXCEPTION 'EXPOSURE_LIMIT: max payout % exceeds available reserve %',
      round(coalesce(p_max_gross,0),2), v_reserve;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.accounting_arcade_assert_capacity(text,uuid,numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_arcade_assert_capacity(text,uuid,numeric) TO service_role;

-- ================= TREASURE GRID =================
CREATE OR REPLACE FUNCTION public.arcade_treasure_start_round(p_user uuid, p_difficulty text, p_stake integer, p_client_seed text, p_idempotency_key text)
 RETURNS arcade_treasure_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- house payout-capacity control (conservative: gross vs reserve before stake)
  PERFORM public.accounting_arcade_assert_capacity('treasure', p_user, v_max_ret);

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
END $function$;

CREATE OR REPLACE FUNCTION public.arcade_treasure_collect(p_user uuid, p_round uuid, p_state_version integer, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.arcade_treasure_rounds;
  v_wallet public.wallets;
  v_mult numeric; v_unrounded numeric; v_gross int;
  v_status public.arcade_treasure_status;
  v_seq int; v_new_balance numeric(14,2);
  v_action public.arcade_treasure_round_actions;
BEGIN
  SELECT * INTO r FROM public.arcade_treasure_rounds
    WHERE id = p_round AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;

  SELECT * INTO v_action FROM public.arcade_treasure_round_actions
    WHERE round_id = r.id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'round', to_jsonb(r));
  END IF;

  IF r.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_NOT_ACTIVE'; END IF;
  IF p_state_version IS DISTINCT FROM r.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;
  IF r.safe_reveals < 1 THEN RAISE EXCEPTION 'NOTHING_TO_COLLECT'; END IF;

  SELECT actual_multiplier INTO v_mult FROM public.arcade_treasure_multiplier_tables
    WHERE config_id = r.config_id AND safe_reveals = r.safe_reveals;
  IF v_mult IS NULL THEN RAISE EXCEPTION 'MULTIPLIER_NOT_FOUND'; END IF;

  v_unrounded := r.stake * v_mult;
  v_gross := floor(v_unrounded)::int;
  v_status := CASE WHEN v_gross > r.stake THEN 'WON'
                   WHEN v_gross = r.stake THEN 'PUSH'
                   ELSE 'LOST' END::public.arcade_treasure_status;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  v_new_balance := v_wallet.balance + v_gross;
  UPDATE public.wallets SET balance = v_new_balance WHERE user_id = p_user;

  UPDATE public.arcade_treasure_rounds SET
    status = v_status, gross_return = v_gross, unrounded_return = v_unrounded,
    final_multiplier = round(v_mult, 4), current_multiplier = round(v_mult, 4),
    user_net = v_gross - r.stake, platform_net = r.stake - v_gross,
    state_version = r.state_version + 1, last_action_at = now(), settled_at = now(),
    result_reason = 'Player collected'
    WHERE id = r.id RETURNING * INTO r;

  SELECT coalesce(max(action_sequence),0) + 1 INTO v_seq
    FROM public.arcade_treasure_round_actions WHERE round_id = r.id;

  INSERT INTO public.arcade_treasure_round_actions(
    round_id, user_id, action_type, action_sequence, state_version_before, state_version_after,
    multiplier_after, potential_return_after, outcome, idempotency_key
  ) VALUES (r.id, p_user, 'COLLECT', v_seq, r.state_version - 1, r.state_version,
    round(v_mult,4), v_gross, v_status::text, p_idempotency_key);

  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after, reference_type, reference_id,
    note, transaction_category, metadata
  ) VALUES (
    p_user, 'credit', v_gross, v_new_balance - v_gross, v_new_balance, 'bet_settlement', r.id,
    'Treasure Grid return', 'arcade_treasure',
    jsonb_build_object('multiplier', round(v_mult,4), 'safe_reveals', r.safe_reveals, 'stake', r.stake)
  );

  PERFORM public.accounting_arcade_hook('treasure','arcade_treasure_round', r.id, p_user,
    r.stake, v_gross, now(),
    jsonb_build_object('source','arcade_treasure','event','collect','multiplier',round(v_mult,4),
                       'safe_reveals', r.safe_reveals, 'status', v_status),
    'arcade_treasure', r.idempotency_key);

  RETURN jsonb_build_object(
    'round', to_jsonb(r),
    'traps', (SELECT jsonb_agg(tile_index ORDER BY tile_index) FROM public.arcade_treasure_tiles
                WHERE round_id = r.id AND tile_type = 'TRAP')
  );
END $function$;

CREATE OR REPLACE FUNCTION public.arcade_treasure_expire_rounds(p_limit integer DEFAULT 200)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.arcade_treasure_rounds;
  v_new_balance numeric(14,2);
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.arcade_treasure_rounds
     WHERE status IN ('CREATED','ACTIVE','COLLECTING')
       AND expires_at < now()
     ORDER BY expires_at
     LIMIT greatest(1, least(p_limit, 1000))
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM 1 FROM public.wallets WHERE user_id = r.user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wallets(user_id, balance) VALUES (r.user_id, 0);
    END IF;

    UPDATE public.wallets SET balance = balance + r.stake, updated_at = now()
      WHERE user_id = r.user_id RETURNING balance INTO v_new_balance;

    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata
    ) VALUES (
      r.user_id, 'refund'::public.wallet_txn_type, r.stake,
      v_new_balance - r.stake, v_new_balance,
      'admin_adjustment', r.id, 'Treasure Grid round expired', 'arcade_treasure',
      jsonb_build_object('round_id', r.id, 'reason', 'ROUND_TIMEOUT')
    );

    UPDATE public.arcade_treasure_rounds
       SET status = 'EXPIRED', result_reason = 'ROUND_TIMEOUT',
           gross_return = r.stake, user_net = 0, platform_net = 0,
           settled_at = now(), state_version = state_version + 1, updated_at = now()
     WHERE id = r.id;

    -- refund leg: stake and refund cancel out, bankroll unchanged
    PERFORM public.accounting_arcade_hook('treasure','arcade_treasure_round', r.id, r.user_id,
      r.stake, r.stake, now(),
      jsonb_build_object('source','arcade_treasure','event','expired','reason','ROUND_TIMEOUT'),
      'arcade_treasure', r.idempotency_key);

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- ================= MINI ROULETTE =================
CREATE OR REPLACE FUNCTION public.arcade_place_roulette_spin(p_user uuid, p_idempotency_key text, p_client_seed text, p_bets jsonb)
 RETURNS arcade_roulette_spins
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- worst-case gross return across every possible pocket
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

  PERFORM public.accounting_arcade_assert_capacity('roulette', p_user, v_max_gross);

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
$function$;

-- ================= BLACKJACK =================
CREATE OR REPLACE FUNCTION public.arcade_bj_settle(p_hand uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h public.arcade_bj_hands; sc public.arcade_bj_score_configs; rc public.arcade_bj_rule_configs;
  dranks int[]; v int[]; ph record; pranks int[]; pv int[]; pcards int;
  pts int; total_pts int := 0; res public.bj_result; overall public.bj_result;
  results text[] := '{}'; bal bigint; any_live boolean;
  pay numeric(14,2); total_pay numeric(14,2) := 0; w public.wallets;
  v_final_stake numeric(14,2);
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id = p_hand FOR UPDATE;
  IF h.status IN ('COMPLETED','VOID','REVERSED') THEN RETURN; END IF;
  SELECT * INTO sc FROM public.arcade_bj_score_configs WHERE id = h.score_config_id;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id = h.rule_config_id;

  UPDATE public.arcade_bj_hands SET status='DEALER_TURN' WHERE id = p_hand;
  UPDATE public.arcade_bj_cards SET face_up = true, revealed_at = now()
    WHERE hand_id = p_hand AND owner_type='DEALER' AND face_up = false;

  SELECT EXISTS(SELECT 1 FROM public.arcade_bj_player_hands
                WHERE hand_id=p_hand AND status NOT IN ('BUST','LOST')) INTO any_live;

  SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks
    FROM public.arcade_bj_cards WHERE hand_id=p_hand AND owner_type='DEALER';
  v := public.arcade_bj_value(dranks);
  IF any_live AND NOT h.dealer_blackjack THEN
    WHILE v[1] < 17 OR (v[1] = 17 AND v[2] = 1 AND rc.dealer_hits_soft_17) LOOP
      PERFORM public.arcade_bj_draw(p_hand, NULL, 'DEALER', true);
      SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks
        FROM public.arcade_bj_cards WHERE hand_id=p_hand AND owner_type='DEALER';
      v := public.arcade_bj_value(dranks);
    END LOOP;
  END IF;

  UPDATE public.arcade_bj_hands
    SET status='SETTLING', dealer_total=v[1], dealer_soft=(v[2]=1), dealer_bust=(v[3]=1)
    WHERE id = p_hand;

  FOR ph IN SELECT * FROM public.arcade_bj_player_hands WHERE hand_id=p_hand ORDER BY hand_index LOOP
    SELECT array_agg(rank ORDER BY deal_sequence), count(*) INTO pranks, pcards
      FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
    pv := public.arcade_bj_value(pranks);
    pts := sc.loss_score; pay := 0;

    IF pv[3] = 1 THEN res := 'BUST';
    ELSIF ph.is_blackjack AND NOT h.dealer_blackjack THEN res := 'BLACKJACK';
    ELSIF ph.is_blackjack AND h.dealer_blackjack THEN res := 'PUSH';
    ELSIF h.dealer_blackjack THEN res := 'LOSS';
    ELSIF v[3] = 1 THEN res := 'WIN';
    ELSIF pv[1] > v[1] THEN res := 'WIN';
    ELSIF pv[1] = v[1] THEN res := 'PUSH';
    ELSE res := 'LOSS';
    END IF;

    IF res = 'BLACKJACK' THEN
      pts := sc.natural_blackjack_score;
      pay := round(ph.stake * (1 + rc.blackjack_payout), 2);
    ELSIF res = 'WIN' THEN
      pay := ph.stake * 2;
      IF ph.is_doubled THEN pts := sc.double_win_score;
      ELSIF pcards >= 5 THEN pts := sc.five_card_win_score;
      ELSIF ph.is_split THEN pts := sc.split_win_score;
      ELSE pts := sc.win_score; END IF;
    ELSIF res = 'PUSH' THEN
      pts := sc.push_score; pay := ph.stake;
    ELSE
      pts := sc.loss_score; pay := 0;
    END IF;

    total_pts := total_pts + pts;
    total_pay := total_pay + pay;
    results := results || res::text;
    UPDATE public.arcade_bj_player_hands
      SET status = CASE res WHEN 'BUST' THEN 'BUST'::public.bj_ph_status
                            WHEN 'PUSH' THEN 'PUSH'::public.bj_ph_status
                            WHEN 'LOSS' THEN 'LOST'::public.bj_ph_status
                            ELSE 'WON'::public.bj_ph_status END,
          result = res, final_total = pv[1], is_soft = (pv[2]=1), is_bust = (pv[3]=1),
          score_awarded = pts, payout = pay, settled_at = now()
      WHERE id = ph.id;
  END LOOP;

  IF total_pts > sc.max_score_per_round THEN total_pts := sc.max_score_per_round; END IF;
  IF total_pay > rc.max_payout THEN total_pay := rc.max_payout; END IF;

  IF array_length(results,1) = 1 OR (SELECT count(DISTINCT x) FROM unnest(results) x) = 1 THEN
    overall := results[1]::public.bj_result;
  ELSE overall := 'MIXED'; END IF;

  IF total_pay > 0 THEN
    SELECT * INTO w FROM public.wallets WHERE user_id = h.user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wallets(user_id, balance) VALUES (h.user_id, 0) RETURNING * INTO w;
    END IF;
    UPDATE public.wallets SET balance = w.balance + total_pay WHERE user_id = h.user_id;
    INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata)
    VALUES (h.user_id, 'credit', total_pay, w.balance, w.balance + total_pay,
      'bet_settlement', p_hand, 'Blackjack payout', 'arcade_blackjack',
      jsonb_build_object('result', overall, 'dealer_total', v[1]));
  END IF;

  INSERT INTO public.arcade_bj_score_balances(user_id, total_score) VALUES (h.user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT total_score INTO bal FROM public.arcade_bj_score_balances WHERE user_id = h.user_id FOR UPDATE;
  IF total_pts > 0 THEN
    INSERT INTO public.arcade_bj_score_ledger(user_id, hand_id, score_type, score_amount,
      total_before, total_after, score_config_version, reason, idempotency_key)
    VALUES (h.user_id, p_hand,
      CASE WHEN overall='BLACKJACK' THEN 'blackjack_result'::public.bj_score_txn
           WHEN overall='PUSH' THEN 'push_result'::public.bj_score_txn
           ELSE 'win_result'::public.bj_score_txn END,
      total_pts, bal, bal + total_pts, h.score_version, 'settlement', 'settle:'||p_hand::text)
    ON CONFLICT DO NOTHING;
    UPDATE public.arcade_bj_score_balances SET total_score = bal + total_pts WHERE user_id = h.user_id;
  END IF;

  SELECT coalesce(sum(stake),0) INTO v_final_stake
    FROM public.arcade_bj_player_hands WHERE hand_id = p_hand;

  UPDATE public.arcade_bj_hands
    SET status='COMPLETED', result=overall, total_score_awarded=total_pts,
        total_payout=total_pay, user_net = total_pay - v_final_stake,
        total_stake = v_final_stake,
        settled_at=now(), last_action_at=now(), state_version = state_version + 1,
        result_reason = 'Dealer ' || v[1]::text
    WHERE id = p_hand;

  -- consolidated stake + payout journal for the whole hand (includes doubles/splits)
  PERFORM public.accounting_arcade_hook('blackjack','arcade_bj_hand', p_hand, h.user_id,
    v_final_stake, total_pay, now(),
    jsonb_build_object('source','arcade_blackjack','result', overall,
                       'dealer_total', v[1], 'rule_version', h.rule_version),
    'arcade_blackjack', h.idempotency_key);
END $function$;

CREATE OR REPLACE FUNCTION public.arcade_bj_reverse_settlement(p_hand uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h public.arcade_bj_hands; w public.wallets;
  v_admin uuid := auth.uid(); v_delta numeric(14,2); v_before numeric(14,2); v_after numeric(14,2);
  v_version int; v_claim uuid; v_score int; v_journal jsonb := NULL;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO h FROM public.arcade_bj_hands WHERE id = p_hand FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF h.status <> 'COMPLETED' THEN RAISE EXCEPTION 'NOT_REVERSIBLE: status %', h.status; END IF;

  v_version := public.settlement_next_version('blackjack', p_hand, 'reverse');
  v_claim := public.settlement_claim('blackjack', p_hand, 'reverse', h.status::text, 'REVERSED',
              h.user_id, h.total_payout, jsonb_build_object('reason', p_reason, 'admin', v_admin), v_version);

  v_delta := coalesce(h.total_stake,0) - coalesce(h.total_payout,0);
  IF v_delta <> 0 THEN
    SELECT * INTO w FROM public.wallets WHERE user_id = h.user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wallets(user_id, balance) VALUES (h.user_id, 0) RETURNING * INTO w;
    END IF;
    v_before := w.balance; v_after := v_before + v_delta;
    UPDATE public.wallets SET balance = v_after WHERE user_id = h.user_id;
    INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category)
    VALUES (h.user_id, CASE WHEN v_delta > 0 THEN 'refund' ELSE 'adjustment' END, abs(v_delta),
      v_before, v_after, 'admin_adjustment', p_hand,
      'Blackjack settlement reversal: '||p_reason, 'arcade_blackjack');
  END IF;

  v_score := coalesce(h.total_score_awarded, 0);
  IF v_score <> 0 THEN
    UPDATE public.arcade_bj_score_balances
       SET total_score = greatest(0, total_score - v_score)
     WHERE user_id = h.user_id;
  END IF;

  -- reverse the house journal for this hand, when journalling is on
  IF EXISTS (SELECT 1 FROM public.accounting_journals
              WHERE product = 'blackjack' AND reference_id = p_hand::text AND status = 'POSTED') THEN
    v_journal := public.accounting_reverse_arcade_settlement('blackjack', p_hand, p_reason);
  END IF;

  PERFORM set_config('app.bj_reversal', '1', true);
  UPDATE public.arcade_bj_hands
     SET status = 'REVERSED', resolved_by = v_admin, resolution_reason = p_reason, updated_at = now()
   WHERE id = p_hand;
  UPDATE public.arcade_bj_player_hands SET status = 'REVERSED' WHERE hand_id = p_hand;
  PERFORM set_config('app.bj_reversal', '0', true);

  PERFORM public.create_audit_log('blackjack.settlement_reversed','arcade_bj_hands', p_hand, v_admin, h.user_id,
    jsonb_build_object('status', h.status, 'result', h.result, 'total_payout', h.total_payout,
                       'total_stake', h.total_stake, 'score', v_score),
    jsonb_build_object('status','REVERSED','wallet_delta', v_delta, 'settlement_version', v_version,
                       'journal_reversal', v_journal),
    jsonb_build_object('claim_id', v_claim), p_reason);

  RETURN jsonb_build_object('ok', true, 'hand_id', p_hand, 'wallet_delta', v_delta,
                            'settlement_version', v_version, 'journal_reversal', v_journal);
END $function$;

-- blackjack capacity guard at hand start (worst case: max_payout cap)
CREATE OR REPLACE FUNCTION public.arcade_bj_assert_capacity(p_user uuid, p_stake numeric, p_max_payout numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.accounting_arcade_assert_capacity('blackjack', p_user, least(p_max_payout, p_stake * 4));
$$;
REVOKE ALL ON FUNCTION public.arcade_bj_assert_capacity(uuid,numeric,numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_bj_assert_capacity(uuid,numeric,numeric) TO service_role;

-- ---------- enable journalling ----------
UPDATE public.accounting_migration_flags
   SET journal_enabled = true, dual_write = true, updated_at = now()
 WHERE product IN ('treasure','roulette','blackjack');
