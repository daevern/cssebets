-- 1. Wallet staking replaces free entries
DROP FUNCTION IF EXISTS public.arcade_bj_ensure_entries(uuid);
DROP TABLE IF EXISTS public.arcade_bj_entry_ledger;
DROP TABLE IF EXISTS public.arcade_bj_entry_balances;

ALTER TABLE public.arcade_bj_rule_configs
  DROP COLUMN IF EXISTS daily_entry_allocation,
  ADD COLUMN IF NOT EXISTS min_stake numeric(14,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_stake numeric(14,2) NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS blackjack_payout numeric(6,3) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS max_payout numeric(14,2) NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS chip_values integer[] NOT NULL DEFAULT '{5,10,25,50,100}',
  ADD COLUMN IF NOT EXISTS daily_hand_limit integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS announcement text;

ALTER TABLE public.arcade_bj_hands
  ADD COLUMN IF NOT EXISTS total_stake numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_payout numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_net numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_reason text;

ALTER TABLE public.arcade_bj_player_hands
  ADD COLUMN IF NOT EXISTS stake numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.arcade_bj_actions
  ADD COLUMN IF NOT EXISTS stake_delta numeric(14,2) NOT NULL DEFAULT 0;

-- 2. Settlement: payouts + score
CREATE OR REPLACE FUNCTION public.arcade_bj_settle(p_hand uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  h public.arcade_bj_hands; sc public.arcade_bj_score_configs; rc public.arcade_bj_rule_configs;
  dranks int[]; v int[]; ph record; pranks int[]; pv int[]; pcards int;
  pts int; total_pts int := 0; res public.bj_result; overall public.bj_result;
  results text[] := '{}'; bal bigint; any_live boolean;
  pay numeric(14,2); total_pay numeric(14,2) := 0; w public.wallets;
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

  UPDATE public.arcade_bj_hands
    SET status='COMPLETED', result=overall, total_score_awarded=total_pts,
        total_payout=total_pay, user_net = total_pay - total_stake,
        settled_at=now(), last_action_at=now(), state_version = state_version + 1,
        result_reason = 'Dealer ' || v[1]::text
    WHERE id = p_hand;
END $$;

-- 3. Start hand: wallet stake
DROP FUNCTION IF EXISTS public.arcade_bj_start_hand(uuid, text, text);
CREATE OR REPLACE FUNCTION public.arcade_bj_start_hand(
  p_user uuid, p_stake numeric, p_client_seed text, p_idempotency_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  rc public.arcade_bj_rule_configs; sc public.arcade_bj_score_configs;
  s public.arcade_bj_shoes; h public.arcade_bj_hands; ph public.arcade_bj_player_hands;
  w public.wallets; v_existing uuid; v_seed text; v_nonce int; n int; v_today int;
  pranks int[]; pv int[]; dranks int[]; dv int[]; up int;
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
  IF round(p_stake * (1 + rc.blackjack_payout), 2) > rc.max_payout THEN RAISE EXCEPTION 'EXPOSURE_LIMIT'; END IF;

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
END $$;

-- 4. Double
CREATE OR REPLACE FUNCTION public.arcade_bj_double(
  p_user uuid, p_hand uuid, p_player_hand uuid, p_state_version int, p_idempotency_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; ph public.arcade_bj_player_hands; rc public.arcade_bj_rule_configs;
  w public.wallets; ranks int[]; pv int[]; before_total int; c public.arcade_bj_cards; ncards int;
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND OR h.user_id <> p_user THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.arcade_bj_actions WHERE hand_id=p_hand AND idempotency_key=p_idempotency_key) THEN RETURN; END IF;
  IF h.status <> 'PLAYER_TURN' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF p_state_version IS NOT NULL AND p_state_version <> h.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;

  SELECT * INTO ph FROM public.arcade_bj_player_hands WHERE id=p_player_hand AND hand_id=p_hand FOR UPDATE;
  IF NOT FOUND OR ph.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id=h.rule_config_id;
  IF NOT rc.double_allowed THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF ph.is_split AND NOT rc.double_after_split THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT count(*) INTO ncards FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
  IF ncards <> 2 THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT * INTO w FROM public.wallets WHERE user_id=p_user FOR UPDATE;
  IF w.balance < ph.stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  UPDATE public.wallets SET balance = w.balance - ph.stake WHERE user_id=p_user;
  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, note, transaction_category, metadata)
  VALUES (p_user, 'debit', ph.stake, w.balance, w.balance - ph.stake, 'bet_placement', p_hand,
    'Blackjack double', 'arcade_blackjack', jsonb_build_object('player_hand', ph.id));

  UPDATE public.arcade_bj_player_hands SET stake = stake * 2, is_doubled = true WHERE id = ph.id;
  UPDATE public.arcade_bj_hands SET total_stake = total_stake + ph.stake WHERE id = p_hand;

  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  before_total := (public.arcade_bj_value(ranks))[1];
  c := public.arcade_bj_draw(p_hand, ph.id, 'PLAYER', true);
  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  pv := public.arcade_bj_value(ranks);

  UPDATE public.arcade_bj_player_hands
    SET status = CASE WHEN pv[3]=1 THEN 'BUST'::public.bj_ph_status ELSE 'DOUBLED'::public.bj_ph_status END,
        is_bust = (pv[3]=1), final_total = pv[1], is_soft = (pv[2]=1)
    WHERE id = ph.id;

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, card_id, total_before, total_after, idempotency_key, stake_delta)
  VALUES (p_hand, ph.id, p_user, 'DOUBLE', h.action_sequence+1, h.state_version, h.state_version+1,
    c.id, before_total, pv[1], p_idempotency_key, ph.stake);
  UPDATE public.arcade_bj_hands SET action_sequence=action_sequence+1, state_version=state_version+1,
    last_action_at=now() WHERE id=p_hand;

  IF NOT EXISTS (SELECT 1 FROM public.arcade_bj_player_hands WHERE hand_id=p_hand AND status='ACTIVE') THEN
    PERFORM public.arcade_bj_settle(p_hand);
  END IF;
END $$;

-- 5. Split
CREATE OR REPLACE FUNCTION public.arcade_bj_split(
  p_user uuid, p_hand uuid, p_player_hand uuid, p_state_version int, p_idempotency_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; ph public.arcade_bj_player_hands; rc public.arcade_bj_rule_configs;
  w public.wallets; cards public.arcade_bj_cards[]; c1 public.arcade_bj_cards; c2 public.arcade_bj_cards;
  new_ph public.arcade_bj_player_hands; nhands int; nextidx int; is_ace boolean;
  r1 int[]; r2 int[]; v1 int[]; v2 int[];
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND OR h.user_id <> p_user THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.arcade_bj_actions WHERE hand_id=p_hand AND idempotency_key=p_idempotency_key) THEN RETURN; END IF;
  IF h.status <> 'PLAYER_TURN' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF p_state_version IS NOT NULL AND p_state_version <> h.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;

  SELECT * INTO ph FROM public.arcade_bj_player_hands WHERE id=p_player_hand AND hand_id=p_hand FOR UPDATE;
  IF NOT FOUND OR ph.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id=h.rule_config_id;

  SELECT count(*) INTO nhands FROM public.arcade_bj_player_hands WHERE hand_id=p_hand;
  IF nhands >= rc.max_split_hands THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF ph.is_split AND NOT rc.resplit_allowed THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT array_agg(c ORDER BY c.deal_sequence) INTO cards
    FROM public.arcade_bj_cards c WHERE c.player_hand_id = ph.id;
  IF array_length(cards,1) <> 2 THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  c1 := cards[1]; c2 := cards[2];
  IF least(c1.rank,10) <> least(c2.rank,10) THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  is_ace := (c1.rank = 1);
  IF is_ace AND ph.is_split AND NOT rc.resplit_aces THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT * INTO w FROM public.wallets WHERE user_id=p_user FOR UPDATE;
  IF w.balance < ph.stake THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  UPDATE public.wallets SET balance = w.balance - ph.stake WHERE user_id=p_user;
  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, note, transaction_category, metadata)
  VALUES (p_user, 'debit', ph.stake, w.balance, w.balance - ph.stake, 'bet_placement', p_hand,
    'Blackjack split', 'arcade_blackjack', jsonb_build_object('player_hand', ph.id));
  UPDATE public.arcade_bj_hands SET total_stake = total_stake + ph.stake WHERE id=p_hand;

  SELECT coalesce(max(hand_index),0) + 1 INTO nextidx FROM public.arcade_bj_player_hands WHERE hand_id=p_hand;
  INSERT INTO public.arcade_bj_player_hands(hand_id, parent_player_hand_id, hand_index, stake, is_split, is_split_ace)
    VALUES (p_hand, ph.id, nextidx, ph.stake, true, is_ace) RETURNING * INTO new_ph;
  UPDATE public.arcade_bj_player_hands SET is_split = true, is_split_ace = is_ace, is_blackjack = false WHERE id = ph.id;

  UPDATE public.arcade_bj_cards SET player_hand_id = new_ph.id WHERE id = c2.id;

  PERFORM public.arcade_bj_draw(p_hand, ph.id, 'PLAYER', true);
  PERFORM public.arcade_bj_draw(p_hand, new_ph.id, 'PLAYER', true);

  SELECT array_agg(rank ORDER BY deal_sequence) INTO r1 FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  SELECT array_agg(rank ORDER BY deal_sequence) INTO r2 FROM public.arcade_bj_cards WHERE player_hand_id=new_ph.id;
  v1 := public.arcade_bj_value(r1); v2 := public.arcade_bj_value(r2);
  UPDATE public.arcade_bj_player_hands SET final_total=v1[1], is_soft=(v1[2]=1) WHERE id=ph.id;
  UPDATE public.arcade_bj_player_hands SET final_total=v2[1], is_soft=(v2[2]=1) WHERE id=new_ph.id;

  IF is_ace AND NOT rc.hit_split_aces THEN
    UPDATE public.arcade_bj_player_hands SET status='STOOD' WHERE id IN (ph.id, new_ph.id);
  ELSE
    IF v1[1] = 21 AND rc.auto_stand_on_21 THEN UPDATE public.arcade_bj_player_hands SET status='STOOD' WHERE id=ph.id; END IF;
    IF v2[1] = 21 AND rc.auto_stand_on_21 THEN UPDATE public.arcade_bj_player_hands SET status='STOOD' WHERE id=new_ph.id; END IF;
  END IF;

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, total_before, total_after, idempotency_key, stake_delta)
  VALUES (p_hand, ph.id, p_user, 'SPLIT', h.action_sequence+1, h.state_version, h.state_version+1,
    v1[1], v1[1], p_idempotency_key, ph.stake);
  UPDATE public.arcade_bj_hands SET action_sequence=action_sequence+1, state_version=state_version+1,
    last_action_at=now() WHERE id=p_hand;

  IF NOT EXISTS (SELECT 1 FROM public.arcade_bj_player_hands WHERE hand_id=p_hand AND status='ACTIVE') THEN
    PERFORM public.arcade_bj_settle(p_hand);
  END IF;
END $$;

-- 6. Admin: void / reverse
CREATE OR REPLACE FUNCTION public.arcade_bj_admin_resolve_hand(
  p_admin uuid, p_hand uuid, p_action text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; w public.wallets; delta numeric(14,2); bal bigint;
BEGIN
  IF NOT (public.has_role(p_admin,'admin') OR public.has_role(p_admin,'super_admin')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_action NOT IN ('VOID','REVERSE') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 4 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF h.status IN ('VOID','REVERSED') THEN RAISE EXCEPTION 'ALREADY_RESOLVED'; END IF;

  delta := h.total_stake - h.total_payout;
  SELECT * INTO w FROM public.wallets WHERE user_id=h.user_id FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.wallets(user_id, balance) VALUES (h.user_id,0) RETURNING * INTO w; END IF;
  IF delta <> 0 THEN
    UPDATE public.wallets SET balance = w.balance + delta WHERE user_id = h.user_id;
    INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata)
    VALUES (h.user_id, CASE WHEN delta > 0 THEN 'credit' ELSE 'debit' END, abs(delta),
      w.balance, w.balance + delta, 'admin_adjustment', p_hand,
      'Blackjack ' || lower(p_action), 'arcade_blackjack',
      jsonb_build_object('reason', p_reason, 'admin_id', p_admin));
  END IF;

  IF h.total_score_awarded > 0 THEN
    SELECT total_score INTO bal FROM public.arcade_bj_score_balances WHERE user_id=h.user_id FOR UPDATE;
    INSERT INTO public.arcade_bj_score_ledger(user_id, hand_id, score_type, score_amount,
      total_before, total_after, score_config_version, reason, admin_id, idempotency_key)
    VALUES (h.user_id, p_hand, 'void_reversal', -h.total_score_awarded, bal,
      greatest(bal - h.total_score_awarded, 0), h.score_version, p_reason, p_admin,
      'resolve:'||p_hand::text)
    ON CONFLICT DO NOTHING;
    UPDATE public.arcade_bj_score_balances SET total_score = greatest(bal - h.total_score_awarded, 0)
      WHERE user_id = h.user_id;
  END IF;

  UPDATE public.arcade_bj_player_hands
    SET status = CASE WHEN p_action='VOID' THEN 'VOID'::public.bj_ph_status ELSE 'REVERSED'::public.bj_ph_status END
    WHERE hand_id = p_hand;
  UPDATE public.arcade_bj_hands
    SET status = CASE WHEN p_action='VOID' THEN 'VOID'::public.bj_hand_status ELSE 'REVERSED'::public.bj_hand_status END,
        result = CASE WHEN p_action='VOID' THEN 'VOID'::public.bj_result ELSE 'REVERSED'::public.bj_result END,
        total_score_awarded = 0, total_payout = 0, user_net = 0,
        resolved_by = p_admin, resolution_reason = p_reason,
        state_version = state_version + 1, settled_at = coalesce(settled_at, now())
    WHERE id = p_hand;

  PERFORM public.create_audit_log('arcade_bj_hands', p_hand::text, 'resolve',
    jsonb_build_object('action', p_action, 'reason', p_reason), p_admin);
END $$;

-- 7. Admin: publish rule config (now carries stake settings)
CREATE OR REPLACE FUNCTION public.arcade_bj_publish_rule_config(p_admin uuid, p_patch jsonb, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cur public.arcade_bj_rule_configs; nid uuid;
BEGIN
  IF NOT (public.has_role(p_admin,'admin') OR public.has_role(p_admin,'super_admin')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 4 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO cur FROM public.arcade_bj_rule_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;

  INSERT INTO public.arcade_bj_rule_configs(
    name, version, status, deck_count, dealer_hits_soft_17, dealer_peek, max_split_hands,
    resplit_allowed, resplit_aces, hit_split_aces, double_allowed, double_after_split,
    auto_stand_on_21, penetration, action_timeout_seconds, strategy_table_version,
    maintenance_mode, min_stake, max_stake, blackjack_payout, max_payout, chip_values,
    daily_hand_limit, announcement, effective_from, created_by, approved_by, change_reason)
  VALUES (
    cur.name, cur.version + 1, 'active', cur.deck_count,
    coalesce((p_patch->>'dealer_hits_soft_17')::boolean, cur.dealer_hits_soft_17),
    coalesce((p_patch->>'dealer_peek')::boolean, cur.dealer_peek),
    coalesce((p_patch->>'max_split_hands')::int, cur.max_split_hands),
    coalesce((p_patch->>'resplit_allowed')::boolean, cur.resplit_allowed),
    coalesce((p_patch->>'resplit_aces')::boolean, cur.resplit_aces),
    coalesce((p_patch->>'hit_split_aces')::boolean, cur.hit_split_aces),
    coalesce((p_patch->>'double_allowed')::boolean, cur.double_allowed),
    coalesce((p_patch->>'double_after_split')::boolean, cur.double_after_split),
    coalesce((p_patch->>'auto_stand_on_21')::boolean, cur.auto_stand_on_21),
    cur.penetration,
    coalesce((p_patch->>'action_timeout_seconds')::int, cur.action_timeout_seconds),
    cur.strategy_table_version,
    coalesce((p_patch->>'maintenance_mode')::boolean, cur.maintenance_mode),
    coalesce((p_patch->>'min_stake')::numeric, cur.min_stake),
    coalesce((p_patch->>'max_stake')::numeric, cur.max_stake),
    coalesce((p_patch->>'blackjack_payout')::numeric, cur.blackjack_payout),
    coalesce((p_patch->>'max_payout')::numeric, cur.max_payout),
    cur.chip_values,
    coalesce((p_patch->>'daily_hand_limit')::int, cur.daily_hand_limit),
    coalesce(p_patch->>'announcement', cur.announcement),
    now(), p_admin, p_admin, p_reason)
  RETURNING id INTO nid;

  UPDATE public.arcade_bj_rule_configs SET status='retired', effective_to=now() WHERE id = cur.id;
  PERFORM public.create_audit_log('arcade_bj_rule_configs', nid::text, 'publish', p_patch, p_admin);
  RETURN nid;
END $$;

REVOKE EXECUTE ON FUNCTION public.arcade_bj_start_hand(uuid,numeric,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_double(uuid,uuid,uuid,int,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_split(uuid,uuid,uuid,int,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_admin_resolve_hand(uuid,uuid,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_publish_rule_config(uuid,jsonb,text) FROM anon, authenticated;