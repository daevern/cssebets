-- 1. Draw: 37 equally likely pockets
CREATE OR REPLACE FUNCTION public.arcade_roulette_draw(p_server_seed text, p_client_seed text, p_nonce integer, OUT pocket smallint, OUT random_hex text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_round int := 0;
  v_hex text;
  v_chunk text;
  v_u bigint;
  v_limit bigint := 4294967289; -- floor(2^32 / 37) * 37
  i int;
BEGIN
  LOOP
    v_hex := encode(extensions.hmac(p_client_seed || ':' || p_nonce::text || ':' || v_round::text,
                                    p_server_seed, 'sha256'), 'hex');
    FOR i IN 0..7 LOOP
      v_chunk := substr(v_hex, i * 8 + 1, 8);
      v_u := ('x' || v_chunk)::bit(32)::bigint;
      IF v_u < v_limit THEN
        pocket := (v_u % 37)::smallint;
        random_hex := v_hex;
        RETURN;
      END IF;
    END LOOP;
    v_round := v_round + 1;
    IF v_round > 32 THEN
      pocket := 0; random_hex := v_hex; RETURN;
    END IF;
  END LOOP;
END;
$function$;

-- 2. Configuration: European wheel
UPDATE public.arcade_roulette_configurations
SET wheel_order = ARRAY[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]::smallint[],
    red_pockets = ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]::smallint[],
    black_pockets = ARRAY[2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]::smallint[],
    version = version + 1,
    updated_at = now()
WHERE status = 'active';

-- 3. Spin engine
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
    IF v_covered NOT IN (1,2,3,4,6,12,18) THEN RAISE EXCEPTION 'INVALID_COVERAGE'; END IF;
    IF v_covered <> jsonb_array_length(v_bet->'pockets') THEN RAISE EXCEPTION 'INVALID_COVERAGE'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_pockets) p WHERE p < 0 OR p > 36) THEN
      RAISE EXCEPTION 'INVALID_POCKET';
    END IF;
    IF v_stake IS NULL OR v_stake <= 0 THEN RAISE EXCEPTION 'INVALID_STAKE'; END IF;
    IF v_stake > v_cfg.max_stake_per_position THEN RAISE EXCEPTION 'POSITION_LIMIT'; END IF;
    v_total_stake := v_total_stake + v_stake;
    v_count := v_count + 1;
  END LOOP;

  IF v_total_stake < v_cfg.min_total_stake THEN RAISE EXCEPTION 'BELOW_MIN_STAKE'; END IF;
  IF v_total_stake > v_cfg.max_total_stake THEN RAISE EXCEPTION 'ABOVE_MAX_STAKE'; END IF;

  -- Result-specific exposure across all 37 pockets.
  FOR v_p IN 0..36 LOOP
    v_pocket_gross := 0;
    FOR v_bet IN SELECT * FROM jsonb_array_elements(p_bets) LOOP
      v_stake := round((v_bet->>'stake')::numeric, 2);
      SELECT array_agg(DISTINCT x)::smallint[] INTO v_pockets
        FROM jsonb_array_elements_text(v_bet->'pockets') AS t(x);
      IF v_p = ANY (v_pockets) THEN
        v_pocket_gross := v_pocket_gross
          + round(v_stake * round(36.0 / array_length(v_pockets,1), 4), 2);
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
    v_mult := round(36.0 / v_covered, 4);
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