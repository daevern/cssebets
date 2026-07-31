-- ============================================================
-- Phase 5 final production controls
-- ============================================================

-- 1. Blackjack worst-case exposure ---------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_bj_worst_case_gross(
  p_rule_config uuid, p_stake numeric
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rc public.arcade_bj_rule_configs;
  v_hands int; v_double_factor numeric; v_max_total_stake numeric; v_gross numeric;
BEGIN
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id = p_rule_config;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;

  -- maximum number of simultaneously live player hands
  v_hands := greatest(1, coalesce(rc.max_split_hands, 1));

  -- can every one of those hands carry a doubled stake?
  IF rc.double_allowed AND (v_hands = 1 OR rc.double_after_split) THEN
    v_double_factor := 2;
  ELSIF rc.double_allowed THEN
    -- splits allowed but no double-after-split: only the unsplit hand may double
    v_double_factor := 1;
    v_hands := greatest(v_hands, 1);
  ELSE
    v_double_factor := 1;
  END IF;

  -- total money that can legally be at risk on the hand
  v_max_total_stake := p_stake * v_hands * v_double_factor;
  IF rc.double_allowed AND v_double_factor = 1 THEN
    v_max_total_stake := greatest(v_max_total_stake, p_stake * 2);
  END IF;

  -- worst-case gross return: every live hand wins even money (2x its stake),
  -- or a single natural blackjack on the unsplit hand.
  v_gross := greatest(
    v_max_total_stake * 2,
    round(p_stake * (1 + rc.blackjack_payout), 2)
  );

  RETURN round(v_gross, 2);
END;
$$;

-- capacity assertion now takes the true worst case, no stake*4 heuristic
CREATE OR REPLACE FUNCTION public.arcade_bj_assert_capacity(
  p_user uuid, p_stake numeric, p_max_payout numeric
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.accounting_arcade_assert_capacity('blackjack', p_user, round(coalesce(p_max_payout,0),2));
$$;

-- 2. start_hand: reject unsupportable exposure before any wallet movement
CREATE OR REPLACE FUNCTION public.arcade_bj_start_hand(
  p_user uuid, p_stake numeric, p_client_seed text, p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
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

-- 3. settle: never truncate a legitimately calculated payout
CREATE OR REPLACE FUNCTION public.arcade_bj_settle(p_hand uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  h public.arcade_bj_hands; sc public.arcade_bj_score_configs; rc public.arcade_bj_rule_configs;
  dranks int[]; v int[]; ph record; pranks int[]; pv int[]; pcards int;
  pts int; total_pts int := 0; res public.bj_result; overall public.bj_result;
  results text[] := '{}'; bal bigint; any_live boolean;
  pay numeric(14,2); total_pay numeric(14,2) := 0; w public.wallets;
  v_final_stake numeric(14,2); v_sum_pay numeric(14,2);
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

  -- Payouts are NEVER truncated here. max_payout is enforced as a genuine
  -- pre-deal ceiling in arcade_bj_start_hand via arcade_bj_worst_case_gross();
  -- if it is ever exceeded at settlement the configuration is wrong and we fail
  -- loudly rather than silently short-paying the player.
  SELECT coalesce(sum(payout),0) INTO v_sum_pay
    FROM public.arcade_bj_player_hands WHERE hand_id = p_hand;
  IF v_sum_pay <> total_pay THEN
    RAISE EXCEPTION 'PAYOUT_MISMATCH: hand % player-hand sum % <> total %', p_hand, v_sum_pay, total_pay;
  END IF;
  IF total_pay > rc.max_payout THEN
    RAISE EXCEPTION 'PAYOUT_CEILING_BREACH: hand % payout % exceeds max_payout % (capacity check is unsound)',
      p_hand, total_pay, rc.max_payout;
  END IF;

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

  PERFORM public.accounting_arcade_hook('blackjack','arcade_bj_hand', p_hand, h.user_id,
    v_final_stake, total_pay, now(),
    jsonb_build_object('source','arcade_blackjack','result', overall,
                       'dealer_total', v[1], 'rule_version', h.rule_version),
    'arcade_blackjack', h.idempotency_key);
END;
$fn$;

-- 4. Treasure Grid expiry follows published policy ------------------------
CREATE OR REPLACE FUNCTION public.arcade_treasure_expire_rounds(p_limit integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  r public.arcade_treasure_rounds;
  v_new_balance numeric(14,2);
  v_count integer := 0;
  v_mult numeric; v_unrounded numeric; v_gross numeric(14,2);
  v_reason text; v_note text; v_txn_ref text;
BEGIN
  FOR r IN
    SELECT * FROM public.arcade_treasure_rounds
     WHERE status IN ('CREATED','ACTIVE','COLLECTING')
       AND expires_at < now()
     ORDER BY expires_at
     LIMIT greatest(1, least(p_limit, 1000))
     FOR UPDATE SKIP LOCKED
  LOOP
    v_mult := NULL; v_unrounded := NULL;

    IF r.safe_reveals >= 1 THEN
      -- published rule: progress is auto-collected at the current return
      SELECT actual_multiplier INTO v_mult FROM public.arcade_treasure_multiplier_tables
        WHERE config_id = r.config_id AND safe_reveals = r.safe_reveals;
      IF v_mult IS NULL THEN
        RAISE EXCEPTION 'MULTIPLIER_NOT_FOUND for round % safe_reveals %', r.id, r.safe_reveals;
      END IF;
      v_unrounded := r.stake * v_mult;
      v_gross := floor(v_unrounded)::numeric;
      v_reason := 'ROUND_TIMEOUT_AUTOCOLLECT';
      v_note := 'Treasure Grid round expired — auto-collected';
      v_txn_ref := 'bet_settlement';
    ELSE
      -- no progress made: stake refunded
      v_gross := r.stake;
      v_reason := 'ROUND_TIMEOUT';
      v_note := 'Treasure Grid round expired';
      v_txn_ref := 'admin_adjustment';
    END IF;

    PERFORM 1 FROM public.wallets WHERE user_id = r.user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.wallets(user_id, balance) VALUES (r.user_id, 0);
    END IF;

    IF v_gross > 0 THEN
      UPDATE public.wallets SET balance = balance + v_gross, updated_at = now()
        WHERE user_id = r.user_id RETURNING balance INTO v_new_balance;

      INSERT INTO public.wallet_transactions(
        user_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, note, transaction_category, metadata
      ) VALUES (
        r.user_id,
        CASE WHEN v_reason = 'ROUND_TIMEOUT' THEN 'refund'::public.wallet_txn_type
             ELSE 'credit'::public.wallet_txn_type END,
        v_gross, v_new_balance - v_gross, v_new_balance,
        v_txn_ref::public.wallet_ref_type, r.id, v_note, 'arcade_treasure',
        jsonb_build_object('round_id', r.id, 'reason', v_reason,
                           'safe_reveals', r.safe_reveals, 'multiplier', round(coalesce(v_mult,1),4))
      );
    END IF;

    UPDATE public.arcade_treasure_rounds
       SET status = 'EXPIRED', result_reason = v_reason,
           gross_return = v_gross,
           unrounded_return = coalesce(v_unrounded, r.stake),
           final_multiplier = round(coalesce(v_mult, 1), 4),
           current_multiplier = round(coalesce(v_mult, r.current_multiplier), 4),
           user_net = v_gross - r.stake, platform_net = r.stake - v_gross,
           settled_at = now(), state_version = state_version + 1, updated_at = now()
     WHERE id = r.id;

    PERFORM public.accounting_arcade_hook('treasure','arcade_treasure_round', r.id, r.user_id,
      r.stake, v_gross, now(),
      jsonb_build_object('source','arcade_treasure','event','expired','reason', v_reason,
                         'safe_reveals', r.safe_reveals),
      'arcade_treasure', r.idempotency_key);

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$fn$;
