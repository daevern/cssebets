CREATE OR REPLACE FUNCTION public.arcade_bj_start_hand(
  p_user uuid, p_stake numeric, p_client_seed text, p_idempotency_key text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  rc public.arcade_bj_rule_configs; sc public.arcade_bj_score_configs;
  s public.arcade_bj_shoes; h public.arcade_bj_hands; ph public.arcade_bj_player_hands;
  w public.wallets; v_existing uuid; v_seed text; v_nonce int; n int; v_today int;
  pranks int[]; pv int[]; dranks int[]; dv int[]; up int; v_worst numeric;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN RAISE EXCEPTION 'INVALID_CLIENT_SEED'; END IF;

  SELECT id INTO v_existing FROM public.arcade_bj_hands WHERE user_id=p_user AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;
  IF rc.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;
  SELECT * INTO sc FROM public.arcade_bj_score_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;

  IF p_stake IS NULL OR p_stake < rc.min_stake THEN RAISE EXCEPTION 'BELOW_MIN_STAKE'; END IF;
  IF p_stake > rc.max_stake THEN RAISE EXCEPTION 'ABOVE_MAX_STAKE'; END IF;

  -- worst-case gross return across the complete legal state tree
  v_worst := public.arcade_bj_worst_case_gross(rc.id, p_stake);
  IF v_worst > rc.max_payout THEN
    RAISE EXCEPTION 'EXPOSURE_LIMIT: worst-case payout % exceeds table ceiling %', v_worst, rc.max_payout;
  END IF;
  PERFORM public.arcade_bj_assert_capacity(p_user, p_stake, v_worst);

  SELECT count(*) INTO v_today FROM public.arcade_bj_hands
    WHERE user_id=p_user AND created_at >= date_trunc('day', now());
  IF v_today >= rc.daily_hand_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  IF EXISTS (SELECT 1 FROM public.arcade_bj_hands WHERE user_id=p_user
             AND status IN ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING')) THEN
    RAISE EXCEPTION 'ACTIVE_HAND_EXISTS';
  END IF;

  SELECT * INTO w FROM public.wallets WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.wallets(user_id, balance) VALUES (p_user, 0) RETURNING * INTO w; END IF;
  IF w.balance < p_stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  SELECT * INTO s FROM public.arcade_bj_shoes
    WHERE user_id=p_user AND status IN ('ACTIVE','NEAR_CUT') AND current_index < cut_index
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.arcade_bj_shoes SET status='AWAITING_REVEAL', retired_at=now()
      WHERE user_id=p_user AND status IN ('ACTIVE','NEAR_CUT');
    v_seed := encode(extensions.gen_random_bytes(32),'hex');
    SELECT coalesce(max(nonce),0) + 1 INTO v_nonce FROM public.arcade_bj_shoes WHERE user_id=p_user;
    n := rc.deck_count * 52;
    INSERT INTO public.arcade_bj_shoes(user_id, deck_count, total_cards, card_order, cut_index,
      server_seed, server_seed_hash, client_seed, nonce, rule_version)
    VALUES (p_user, rc.deck_count, n,
      (SELECT array_agg(x % 52 ORDER BY ord)
         FROM unnest(public.arcade_bj_shuffle(v_seed, p_client_seed, v_nonce, n)) WITH ORDINALITY AS t(x, ord)),
      floor(n * rc.penetration)::int, v_seed, encode(extensions.digest(v_seed,'sha256'),'hex'),
      p_client_seed, v_nonce, rc.version)
    RETURNING * INTO s;
  END IF;

  INSERT INTO public.arcade_bj_hands(user_id, shoe_id, status, rule_config_id, rule_version,
    score_config_id, score_version, server_seed_hash, client_seed, nonce, idempotency_key,
    expires_at, total_stake)
  VALUES (p_user, s.id, 'DEALING', rc.id, rc.version, sc.id, sc.version,
    s.server_seed_hash, s.client_seed, s.nonce, p_idempotency_key,
    now() + make_interval(secs => rc.action_timeout_seconds), p_stake)
  RETURNING * INTO h;

  -- Phase 6: reserve the full worst-case exposure for the life of the hand
  -- (all split hands, doubles and a natural blackjack are already inside v_worst).
  PERFORM public.accounting_reserve_liability('blackjack','blackjack','arcade_bj_hand', h.id,
    p_user, v_worst, p_stake, rc.version::text,
    jsonb_build_object('max_split_hands', rc.max_split_hands,
                       'double_after_split', rc.double_after_split));

  UPDATE public.wallets SET balance = w.balance - p_stake WHERE user_id = p_user;
  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, note, transaction_category, metadata)
  VALUES (p_user, 'debit', p_stake, w.balance, w.balance - p_stake, 'bet_placement', h.id,
    'Blackjack stake', 'arcade_blackjack', jsonb_build_object('rule_version', rc.version));

  INSERT INTO public.arcade_bj_player_hands(hand_id, hand_index, stake)
    VALUES (h.id, 0, p_stake) RETURNING * INTO ph;

  PERFORM public.arcade_bj_draw(h.id, ph.id, 'PLAYER', true);
  PERFORM public.arcade_bj_draw(h.id, NULL, 'DEALER', true);
  PERFORM public.arcade_bj_draw(h.id, ph.id, 'PLAYER', true);
  PERFORM public.arcade_bj_draw(h.id, NULL, 'DEALER', false);

  SELECT array_agg(rank ORDER BY deal_sequence) INTO pranks FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
  pv := public.arcade_bj_value(pranks);
  SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks FROM public.arcade_bj_cards WHERE hand_id=h.id AND owner_type='DEALER';
  dv := public.arcade_bj_value(dranks);
  up := dranks[1];

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, total_after, source, stake_delta)
  VALUES (h.id, ph.id, p_user, 'DEAL', 1, 1, 2, pv[1], 'system', p_stake);
  UPDATE public.arcade_bj_hands SET action_sequence=1, state_version=2, status='PLAYER_TURN' WHERE id=h.id;

  IF pv[1] = 21 THEN
    UPDATE public.arcade_bj_player_hands SET is_blackjack=true, status='BLACKJACK', final_total=21 WHERE id=ph.id;
  END IF;

  IF rc.dealer_peek AND (up = 1 OR up >= 10) AND dv[1] = 21 THEN
    UPDATE public.arcade_bj_hands SET dealer_blackjack=true WHERE id=h.id;
    PERFORM public.arcade_bj_settle(h.id);
  ELSIF pv[1] = 21 THEN
    PERFORM public.arcade_bj_settle(h.id);
  END IF;

  RETURN h.id;
END;
$fn$;