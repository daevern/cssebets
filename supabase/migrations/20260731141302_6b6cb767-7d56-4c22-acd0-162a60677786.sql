-- blackjack capacity helper now passes the stake so net liability is used
CREATE OR REPLACE FUNCTION public.arcade_bj_assert_capacity(p_user uuid, p_stake numeric, p_max_payout numeric)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.accounting_arcade_assert_capacity('blackjack', p_user, p_max_payout, p_stake);
END;
$fn$;

-- ============ Plinko ============
CREATE OR REPLACE FUNCTION public.arcade_place_plinko_drop(
  p_user uuid, p_rows integer, p_risk public.arcade_risk_mode,
  p_idempotency_key text, p_client_seed text, p_stake numeric)
RETURNS public.arcade_plinko_games
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_existing public.arcade_plinko_games;
  v_profile  public.arcade_score_profiles;
  v_seed     public.arcade_randomness_seeds;
  v_new_server_seed text;
  v_path smallint[];
  v_slot int := 0;
  i int;
  v_mult numeric(10,4);
  v_stake numeric(10,2);
  v_payout numeric(14,2);
  v_score int;
  v_outcome public.arcade_outcome;
  v_band public.arcade_score_band;
  v_wallet public.wallets;
  v_new_balance numeric(14,2);
  v_game public.arcade_plinko_games;
  v_flags public.accounting_migration_flags;
  v_max_mult numeric(10,4);
  v_max_exposure numeric(18,2);
BEGIN
  IF p_rows NOT IN (8,10,12,14,16) THEN RAISE EXCEPTION 'INVALID_ROWS'; END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN
    RAISE EXCEPTION 'INVALID_CLIENT_SEED';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF p_stake IS NULL OR p_stake < 1 OR p_stake > 100 THEN
    RAISE EXCEPTION 'INVALID_STAKE';
  END IF;
  v_stake := round(p_stake, 2);

  SELECT * INTO v_existing FROM public.arcade_plinko_games
    WHERE user_id = p_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets(user_id, balance) VALUES (p_user, 0) RETURNING * INTO v_wallet;
  END IF;
  IF v_wallet.balance < v_stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  SELECT * INTO v_profile FROM public.arcade_score_profiles
    WHERE rows = p_rows AND risk_mode = p_risk AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_PROFILE'; END IF;

  -- Phase 6: maximum gross exposure = stake x highest configured multiplier.
  -- Net liability (gross - stake) is checked against available bankroll
  -- (house bankroll less active reserved liability) under the environment lock.
  SELECT max(multiplier) INTO v_max_mult FROM public.arcade_score_profile_slots
   WHERE profile_id = v_profile.id;
  v_max_exposure := round(v_stake * coalesce(v_max_mult, 0), 2);
  PERFORM public.accounting_arcade_assert_capacity('plinko', p_user, v_max_exposure, v_stake);

  SELECT * INTO v_flags FROM public.accounting_migration_flags WHERE product = 'plinko';

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

  v_path := public.arcade_generate_path(v_seed.server_seed, p_client_seed, v_seed.nonce, p_rows);
  FOR i IN 1..p_rows LOOP v_slot := v_slot + v_path[i]; END LOOP;

  SELECT multiplier, score INTO v_mult, v_score
    FROM public.arcade_score_profile_slots
    WHERE profile_id = v_profile.id AND slot_index = v_slot;
  IF v_mult IS NULL THEN RAISE EXCEPTION 'MISSING_SLOT_MULTIPLIER'; END IF;

  v_payout := round(v_stake * v_mult, 2);
  v_outcome := CASE WHEN v_payout > v_stake THEN 'WIN'
                    WHEN v_payout = v_stake THEN 'VOID'
                    ELSE 'LOSS' END::public.arcade_outcome;
  v_band := public.arcade_score_band_for(COALESCE(v_score, 0));

  UPDATE public.wallets SET balance = balance - v_stake, updated_at = now()
    WHERE user_id = p_user RETURNING balance INTO v_new_balance;
  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after,
    reference_type, note, transaction_category, metadata
  ) VALUES (
    p_user, 'debit', v_stake, v_new_balance + v_stake, v_new_balance,
    'bet_placement', 'Plinko drop stake', 'arcade_plinko',
    jsonb_build_object('rows', p_rows, 'risk', p_risk, 'idempotency_key', p_idempotency_key)
  );

  INSERT INTO public.arcade_plinko_games(
    user_id, rows, risk_mode, profile_id, seed_id, nonce, path,
    landing_slot, score, outcome, score_band, drop_type,
    idempotency_key, verification_id, client_seed, server_seed_hash,
    stake_per_ball, multiplier, payout
  ) VALUES (
    p_user, p_rows, p_risk, v_profile.id, v_seed.id, v_seed.nonce, v_path,
    v_slot, COALESCE(v_score, 0), v_outcome, v_band, 'paid',
    p_idempotency_key, encode(extensions.gen_random_bytes(8),'hex'),
    p_client_seed, v_seed.server_seed_hash,
    v_stake, v_mult, v_payout
  ) RETURNING * INTO v_game;

  -- single-shot round: reservation opens and closes inside this transaction
  PERFORM public.accounting_reserve_liability('plinko','plinko','arcade_plinko_game', v_game.id,
    p_user, v_max_exposure, v_stake, v_profile.id::text,
    jsonb_build_object('rows', p_rows, 'risk', p_risk), true);

  IF v_payout > 0 THEN
    UPDATE public.wallets SET balance = balance + v_payout, updated_at = now()
      WHERE user_id = p_user RETURNING balance INTO v_new_balance;
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata
    ) VALUES (
      p_user, 'credit', v_payout, v_new_balance - v_payout, v_new_balance,
      'bet_settlement', v_game.id, 'Plinko payout', 'arcade_plinko',
      jsonb_build_object('multiplier', v_mult, 'stake', v_stake, 'rows', p_rows, 'risk', p_risk)
    );
  END IF;

  IF v_flags.product IS NOT NULL AND (v_flags.journal_enabled OR v_flags.dual_write) THEN
    IF v_flags.journal_enabled THEN
      PERFORM public.accounting_post_plinko_game(v_game.id);
    ELSE
      BEGIN
        PERFORM public.accounting_post_plinko_game(v_game.id);
      EXCEPTION WHEN others THEN
        UPDATE public.wallet_transactions
           SET accounting_sync_status = 'ERROR', accounting_sync_error = SQLERRM
         WHERE transaction_category = 'arcade_plinko'
           AND user_id = p_user
           AND (reference_id = v_game.id
                OR metadata->>'idempotency_key' = p_idempotency_key);
      END;
    END IF;
  END IF;

  RETURN v_game;
END;
$fn$;