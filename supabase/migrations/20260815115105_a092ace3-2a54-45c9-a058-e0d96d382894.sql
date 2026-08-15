-- 1. widen the mini engine to towers + poker ------------------------------
ALTER TABLE public.arcade_mini_configs DROP CONSTRAINT IF EXISTS arcade_mini_configs_product_check;
ALTER TABLE public.arcade_mini_configs ADD CONSTRAINT arcade_mini_configs_product_check
  CHECK (product = ANY (ARRAY['hilo','dice','wheel','keno','crash','towers','poker']));
ALTER TABLE public.arcade_mini_rounds DROP CONSTRAINT IF EXISTS arcade_mini_rounds_product_check;
ALTER TABLE public.arcade_mini_rounds ADD CONSTRAINT arcade_mini_rounds_product_check
  CHECK (product = ANY (ARRAY['hilo','dice','wheel','keno','crash','towers','poker']));

-- 2. published configs ----------------------------------------------------
INSERT INTO public.arcade_mini_configs(product, version, status, min_stake, max_stake, chip_values,
  target_rtp, max_multiplier, round_ttl_seconds, daily_round_limit, payload)
SELECT 'towers', 1, 'active', 1, 50, ARRAY[1,5,10,25,50]::numeric[], 0.96, 500, 900, 1000,
  jsonb_build_object(
    'rows', 8,
    'difficulties', jsonb_build_object(
      'easy',      jsonb_build_object('tiles', 4, 'dragons', 1, 'enabled', true),
      'medium',    jsonb_build_object('tiles', 3, 'dragons', 1, 'enabled', true),
      'hard',      jsonb_build_object('tiles', 2, 'dragons', 1, 'enabled', true),
      'nightmare', jsonb_build_object('tiles', 4, 'dragons', 3, 'enabled', true)))
WHERE NOT EXISTS (SELECT 1 FROM public.arcade_mini_configs WHERE product = 'towers');

INSERT INTO public.arcade_mini_configs(product, version, status, min_stake, max_stake, chip_values,
  target_rtp, max_multiplier, round_ttl_seconds, daily_round_limit, payload)
SELECT 'poker', 1, 'active', 1, 20, ARRAY[1,5,10,25,50]::numeric[], 0.96, 250, 900, 1000,
  jsonb_build_object('variant', 'jacks_or_better', 'paytable', jsonb_build_object(
    'royal_flush', 250, 'straight_flush', 50, 'four', 25, 'full_house', 7,
    'flush', 5, 'straight', 4, 'three', 3, 'two_pair', 2, 'jacks_or_better', 1, 'nothing', 0))
WHERE NOT EXISTS (SELECT 1 FROM public.arcade_mini_configs WHERE product = 'poker');

-- 3. accounting accounts + flags -----------------------------------------
INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, product, environment, currency_or_unit, status)
SELECT code, atype::public.acct_account_type, nbal::public.acct_normal_balance, prod, env, 'POINTS', 'ACTIVE'
FROM (
  VALUES
    ('TOWERS_STAKE_REVENUE','REVENUE','CREDIT','towers'),
    ('TOWERS_PAYOUT_EXPENSE','EXPENSE','DEBIT','towers'),
    ('TOWERS_PL_TO_RESERVE','EQUITY','DEBIT','towers'),
    ('POKER_STAKE_REVENUE','REVENUE','CREDIT','poker'),
    ('POKER_PAYOUT_EXPENSE','EXPENSE','DEBIT','poker'),
    ('POKER_PL_TO_RESERVE','EQUITY','DEBIT','poker')
) AS v(code, atype, nbal, prod)
CROSS JOIN (VALUES ('PRODUCTION'::public.acct_environment), ('SIMULATION'::public.acct_environment)) AS e(env)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_accounts a
   WHERE a.account_code = v.code AND a.environment = e.env AND a.user_id IS NULL
);

INSERT INTO public.accounting_migration_flags (product, journal_enabled, dual_write, liability_enforced, capacity_enforced, notes)
VALUES
  ('towers', true, true, true, true, 'CSSE Originals Dragon Towers'),
  ('poker', true, true, true, true, 'CSSE Originals Video Poker')
ON CONFLICT (product) DO UPDATE
  SET journal_enabled = true, dual_write = true,
      liability_enforced = true, capacity_enforced = true, updated_at = now();

-- 4. settlement allowlist -------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_post_arcade_settlement(p_product text, p_ref_type text, p_ref_id uuid, p_user uuid, p_stake numeric, p_payout numeric, p_effective timestamp with time zone, p_meta jsonb DEFAULT '{}'::jsonb, p_wallet_category text DEFAULT NULL::text, p_wallet_idem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_env public.acct_environment;
  v_wallet uuid;
  v_stake_acct uuid;
  v_payout_acct uuid;
  v_reserve_acct uuid;
  v_bankroll_acct uuid;
  v_stake numeric(18,2);
  v_payout numeric(18,2);
  v_stake_res jsonb := NULL;
  v_payout_res jsonb := NULL;
  v_prefix text := upper(p_product);
  v_base_idem text := coalesce(nullif(trim(p_wallet_idem), ''), p_ref_id::text);
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may post arcade journals';
  END IF;
  IF p_product NOT IN ('treasure','roulette','blackjack','rps','hilo','dice','wheel','keno','crash','towers','poker') THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: unsupported product %', p_product;
  END IF;

  SELECT a.id, a.environment
    INTO v_wallet, v_env
    FROM public.accounting_accounts a
   WHERE a.user_id = p_user
     AND a.account_code = 'USER_WALLET'
     AND a.status = 'ACTIVE';
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: no active USER_WALLET account for user %', p_user;
  END IF;

  SELECT id INTO v_stake_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix || '_STAKE_REVENUE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_payout_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix || '_PAYOUT_EXPENSE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_reserve_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix || '_PL_TO_RESERVE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_bankroll_acct FROM public.accounting_accounts
   WHERE account_code = 'HOUSE_BANKROLL' AND environment = v_env AND status = 'ACTIVE';

  IF v_stake_acct IS NULL OR v_payout_acct IS NULL OR v_reserve_acct IS NULL OR v_bankroll_acct IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: missing % accounts for environment %', v_prefix, v_env;
  END IF;

  v_stake := public.acct_round_stake(coalesce(p_stake, 0));
  v_payout := public.acct_round_payout(coalesce(p_payout, 0));

  IF v_stake > 0 THEN
    v_stake_res := public.accounting_post_journal(
      p_journal_type => 'STAKE_PLACED',
      p_lines => jsonb_build_array(
        jsonb_build_object('account_id', v_wallet, 'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_stake_acct, 'debit', 0, 'credit', v_stake),
        jsonb_build_object('account_id', v_stake_acct, 'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', 0, 'credit', v_stake)
      ),
      p_idempotency_key => p_product || ':' || v_base_idem || ':stake',
      p_product => p_product,
      p_game => p_product,
      p_reference_type => p_ref_type,
      p_reference_id => p_ref_id::text,
      p_event_type => 'STAKE_PLACED',
      p_effective_at => p_effective,
      p_created_by => p_user,
      p_metadata => coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
        'wallet_category', p_wallet_category, 'wallet_idem', p_wallet_idem),
      p_environment => v_env::text
    );
  END IF;

  IF v_payout > 0 THEN
    v_payout_res := public.accounting_post_journal(
      p_journal_type => 'PAYOUT_SETTLED',
      p_lines => jsonb_build_array(
        jsonb_build_object('account_id', v_payout_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_wallet, 'debit', 0, 'credit', v_payout),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_payout_acct, 'debit', 0, 'credit', v_payout)
      ),
      p_idempotency_key => p_product || ':' || v_base_idem || ':payout',
      p_product => p_product,
      p_game => p_product,
      p_reference_type => p_ref_type,
      p_reference_id => p_ref_id::text,
      p_event_type => 'PAYOUT_SETTLED',
      p_effective_at => p_effective,
      p_created_by => p_user,
      p_metadata => coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
        'wallet_category', p_wallet_category, 'wallet_idem', p_wallet_idem),
      p_environment => v_env::text
    );
  END IF;

  RETURN jsonb_build_object('stake', v_stake_res, 'payout', v_payout_res);
END $function$;

-- 5. DRAGON TOWERS ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_towers_dragons(
  p_round public.arcade_mini_rounds, p_row int, p_tiles int, p_dragons int)
RETURNS int[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_pool int[] := ARRAY(SELECT generate_series(0, p_tiles - 1));
  v_len int := p_tiles;
  v_out int[] := '{}';
  v_input text;
  v_i int;
  v_j int;
BEGIN
  v_input := p_round.client_seed || ':' || p_round.nonce::text || ':' || p_round.id::text;
  FOR v_i IN 1..p_dragons LOOP
    v_j := 1 + floor(public.arcade_mini_rand(p_round.server_seed, v_input, p_row * 100 + v_i) * v_len)::int;
    IF v_j > v_len THEN v_j := v_len; END IF;
    v_out := v_out || v_pool[v_j];
    v_pool[v_j] := v_pool[v_len];
    v_len := v_len - 1;
  END LOOP;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_towers_start(
  p_user uuid, p_stake numeric, p_difficulty text, p_client_seed text, p_idempotency_key text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cfg public.arcade_mini_configs;
  v_diff jsonb;
  v_tiles int; v_dragons int; v_rows int;
  v_step numeric(12,4);
  v_top numeric(12,4);
  v_round public.arcade_mini_rounds;
BEGIN
  SELECT * INTO v_cfg FROM public.arcade_mini_configs WHERE product = 'towers' AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  v_diff := v_cfg.payload->'difficulties'->p_difficulty;
  IF v_diff IS NULL OR NOT coalesce((v_diff->>'enabled')::boolean, true) THEN
    RAISE EXCEPTION 'INVALID_DIFFICULTY';
  END IF;

  v_tiles := (v_diff->>'tiles')::int;
  v_dragons := (v_diff->>'dragons')::int;
  v_rows := coalesce((v_cfg.payload->>'rows')::int, 8);
  IF v_tiles < 2 OR v_dragons < 1 OR v_dragons >= v_tiles THEN RAISE EXCEPTION 'INVALID_DIFFICULTY'; END IF;

  v_step := round(v_cfg.target_rtp * v_tiles::numeric / (v_tiles - v_dragons)::numeric, 4);
  v_top := least(v_cfg.max_multiplier, round(power(v_step, v_rows), 4));

  v_round := public.arcade_mini_open(
    p_user, 'towers', p_stake, p_client_seed, p_idempotency_key,
    round(coalesce(p_stake,0) * v_top, 2),
    jsonb_build_object('difficulty', p_difficulty, 'tiles', v_tiles, 'dragons', v_dragons,
                       'rows', v_rows, 'step', v_step, 'multiplier', 1,
                       'max_multiplier', v_top, 'picks', '[]'::jsonb, 'revealed', '[]'::jsonb));
  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_towers_reveal_all(p_round public.arcade_mini_rounds)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_rows int := coalesce((p_round.state->>'rows')::int, 8);
  v_tiles int := (p_round.state->>'tiles')::int;
  v_dragons int := (p_round.state->>'dragons')::int;
  v_out jsonb := '[]'::jsonb;
  v_r int;
BEGIN
  FOR v_r IN 0..(v_rows - 1) LOOP
    v_out := v_out || jsonb_build_array(
      to_jsonb(public.arcade_towers_dragons(p_round, v_r, v_tiles, v_dragons)));
  END LOOP;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_towers_pick(p_user uuid, p_round_id uuid, p_tile int)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_round public.arcade_mini_rounds;
  v_tiles int; v_dragons int; v_rows int;
  v_step numeric(12,4); v_top numeric(12,4); v_mult numeric(12,4);
  v_row int;
  v_bad int[];
  v_hit boolean;
  v_picks jsonb;
  v_revealed jsonb;
BEGIN
  SELECT * INTO v_round FROM public.arcade_mini_rounds
   WHERE id = p_round_id AND user_id = p_user AND product = 'towers' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_ALREADY_SETTLED'; END IF;
  IF v_round.expires_at < now() THEN
    PERFORM public.arcade_mini_close(v_round.id, 'VOID', 1, v_round.state, NULL);
    RAISE EXCEPTION 'ROUND_EXPIRED';
  END IF;

  v_tiles := (v_round.state->>'tiles')::int;
  v_dragons := (v_round.state->>'dragons')::int;
  v_rows := coalesce((v_round.state->>'rows')::int, 8);
  v_step := (v_round.state->>'step')::numeric;
  v_top := (v_round.state->>'max_multiplier')::numeric;

  IF p_tile IS NULL OR p_tile < 0 OR p_tile >= v_tiles THEN RAISE EXCEPTION 'INVALID_TILE'; END IF;

  v_row := v_round.step_count;
  IF v_row >= v_rows THEN RAISE EXCEPTION 'TOWER_COMPLETE'; END IF;

  v_bad := public.arcade_towers_dragons(v_round, v_row, v_tiles, v_dragons);
  v_hit := p_tile = ANY (v_bad);

  v_picks := coalesce(v_round.state->'picks', '[]'::jsonb) || to_jsonb(p_tile);
  v_revealed := coalesce(v_round.state->'revealed', '[]'::jsonb) || jsonb_build_array(to_jsonb(v_bad));

  IF v_hit THEN
    RETURN public.arcade_mini_close(v_round.id, 'LOSS', 0,
      v_round.state || jsonb_build_object('picks', v_picks, 'revealed', v_revealed,
                                          'multiplier', 0, 'busted_row', v_row,
                                          'tower', public.arcade_towers_reveal_all(v_round)), NULL);
  END IF;

  v_mult := least(v_top, round(coalesce((v_round.state->>'multiplier')::numeric, 1) * v_step, 4));

  UPDATE public.arcade_mini_rounds SET
    step_count = step_count + 1,
    multiplier = v_mult,
    state = v_round.state || jsonb_build_object('picks', v_picks, 'revealed', v_revealed,
                                                'multiplier', v_mult)
  WHERE id = v_round.id RETURNING * INTO v_round;

  IF v_round.step_count >= v_rows OR v_mult >= v_top THEN
    RETURN public.arcade_mini_close(v_round.id, 'WIN', v_mult,
      v_round.state || jsonb_build_object('topped_out', true,
                                          'tower', public.arcade_towers_reveal_all(v_round)), NULL);
  END IF;

  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_towers_cashout(p_user uuid, p_round_id uuid)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_round public.arcade_mini_rounds;
BEGIN
  SELECT * INTO v_round FROM public.arcade_mini_rounds
   WHERE id = p_round_id AND user_id = p_user AND product = 'towers' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_ALREADY_SETTLED'; END IF;
  IF v_round.step_count = 0 THEN RAISE EXCEPTION 'NOTHING_TO_COLLECT'; END IF;

  RETURN public.arcade_mini_close(v_round.id, 'WIN',
    coalesce((v_round.state->>'multiplier')::numeric, 1),
    v_round.state || jsonb_build_object('collected', true,
                                        'tower', public.arcade_towers_reveal_all(v_round)), NULL);
END $$;

-- 6. VIDEO POKER -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_poker_deck(p_round public.arcade_mini_rounds)
RETURNS int[]
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  v_deck int[] := ARRAY(SELECT generate_series(0, 51));
  v_input text;
  v_i int; v_j int; v_tmp int;
BEGIN
  v_input := p_round.client_seed || ':' || p_round.nonce::text || ':' || p_round.id::text;
  FOR v_i IN REVERSE 52..2 LOOP
    v_j := 1 + floor(public.arcade_mini_rand(p_round.server_seed, v_input, v_i) * v_i)::int;
    IF v_j > v_i THEN v_j := v_i; END IF;
    v_tmp := v_deck[v_i]; v_deck[v_i] := v_deck[v_j]; v_deck[v_j] := v_tmp;
  END LOOP;
  RETURN v_deck;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_poker_eval(p_cards int[])
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  v_ranks int[];
  v_suits int[];
  v_flush boolean;
  v_straight boolean;
  v_distinct int;
  v_min int; v_max int;
  v_pairs int := 0;
  v_trips boolean := false;
  v_quads boolean := false;
  v_high_pair boolean := false;
  r record;
BEGIN
  SELECT array_agg(c / 4 ORDER BY c / 4), array_agg(c % 4)
    INTO v_ranks, v_suits
    FROM unnest(p_cards) c;

  SELECT count(DISTINCT s) = 1 INTO v_flush FROM unnest(v_suits) s;
  SELECT count(DISTINCT x), min(x), max(x) INTO v_distinct, v_min, v_max FROM unnest(v_ranks) x;

  v_straight := v_distinct = 5 AND ((v_max - v_min) = 4
    OR (v_ranks @> ARRAY[0,1,2,3] AND 12 = ANY (v_ranks)));

  FOR r IN SELECT x AS rank, count(*) AS n FROM unnest(v_ranks) x GROUP BY x LOOP
    IF r.n = 4 THEN v_quads := true; END IF;
    IF r.n = 3 THEN v_trips := true; END IF;
    IF r.n = 2 THEN
      v_pairs := v_pairs + 1;
      IF r.rank >= 9 THEN v_high_pair := true; END IF;
    END IF;
  END LOOP;

  IF v_flush AND v_straight AND v_min = 8 THEN RETURN 'royal_flush'; END IF;
  IF v_flush AND v_straight THEN RETURN 'straight_flush'; END IF;
  IF v_quads THEN RETURN 'four'; END IF;
  IF v_trips AND v_pairs = 1 THEN RETURN 'full_house'; END IF;
  IF v_flush THEN RETURN 'flush'; END IF;
  IF v_straight THEN RETURN 'straight'; END IF;
  IF v_trips THEN RETURN 'three'; END IF;
  IF v_pairs = 2 THEN RETURN 'two_pair'; END IF;
  IF v_pairs = 1 AND v_high_pair THEN RETURN 'jacks_or_better'; END IF;
  RETURN 'nothing';
END $$;

CREATE OR REPLACE FUNCTION public.arcade_poker_deal(
  p_user uuid, p_stake numeric, p_client_seed text, p_idempotency_key text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cfg public.arcade_mini_configs;
  v_round public.arcade_mini_rounds;
  v_pay jsonb;
  v_max numeric(12,4);
  v_deck int[];
  v_hand int[];
BEGIN
  SELECT * INTO v_cfg FROM public.arcade_mini_configs WHERE product = 'poker' AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  v_pay := v_cfg.payload->'paytable';
  SELECT max(value::text::numeric) INTO v_max FROM jsonb_each(v_pay);
  v_max := least(coalesce(v_max, v_cfg.max_multiplier), v_cfg.max_multiplier);

  v_round := public.arcade_mini_open(
    p_user, 'poker', p_stake, p_client_seed, p_idempotency_key,
    round(coalesce(p_stake,0) * v_max, 2),
    jsonb_build_object('stage', 'deal', 'paytable', v_pay, 'max_multiplier', v_max));
  IF v_round.status <> 'ACTIVE' OR v_round.step_count > 0 OR v_round.state ? 'hand' THEN
    RETURN v_round;
  END IF;

  v_deck := public.arcade_poker_deck(v_round);
  v_hand := v_deck[1:5];

  UPDATE public.arcade_mini_rounds SET
    state = v_round.state || jsonb_build_object('hand', to_jsonb(v_hand),
              'category', public.arcade_poker_eval(v_hand))
  WHERE id = v_round.id RETURNING * INTO v_round;

  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_poker_draw(p_user uuid, p_round_id uuid, p_holds int[])
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_round public.arcade_mini_rounds;
  v_deck int[];
  v_hand int[];
  v_final int[] := '{}';
  v_holds int[];
  v_next int := 6;
  v_i int;
  v_cat text;
  v_mult numeric(12,4);
  v_top numeric(12,4);
BEGIN
  SELECT * INTO v_round FROM public.arcade_mini_rounds
   WHERE id = p_round_id AND user_id = p_user AND product = 'poker' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_ALREADY_SETTLED'; END IF;
  IF v_round.expires_at < now() THEN
    PERFORM public.arcade_mini_close(v_round.id, 'VOID', 1, v_round.state, NULL);
    RAISE EXCEPTION 'ROUND_EXPIRED';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), '{}'::int[]) INTO v_holds
    FROM unnest(coalesce(p_holds, '{}'::int[])) x WHERE x BETWEEN 0 AND 4;

  v_deck := public.arcade_poker_deck(v_round);
  SELECT array_agg(x::int ORDER BY ord) INTO v_hand
    FROM jsonb_array_elements_text(v_round.state->'hand') WITH ORDINALITY t(x, ord);

  FOR v_i IN 1..5 LOOP
    IF (v_i - 1) = ANY (v_holds) THEN
      v_final := v_final || v_hand[v_i];
    ELSE
      v_final := v_final || v_deck[v_next];
      v_next := v_next + 1;
    END IF;
  END LOOP;

  v_cat := public.arcade_poker_eval(v_final);
  v_top := coalesce((v_round.state->>'max_multiplier')::numeric, 250);
  v_mult := least(v_top, coalesce((v_round.state->'paytable'->>v_cat)::numeric, 0));

  RETURN public.arcade_mini_close(
    v_round.id,
    CASE WHEN v_mult > 0 THEN 'WIN' ELSE 'LOSS' END,
    v_mult,
    v_round.state || jsonb_build_object('stage', 'final', 'holds', to_jsonb(v_holds),
      'dealt', v_round.state->'hand', 'final_hand', to_jsonb(v_final),
      'category', v_cat, 'multiplier', v_mult),
    NULL);
END $$;

-- 7. admin config publishing ----------------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_publish_mini_config(p_admin uuid, p_product text, p_patch jsonb, p_reason text)
RETURNS public.arcade_mini_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_cur public.arcade_mini_configs; v_new public.arcade_mini_configs;
BEGIN
  IF NOT (public.has_role(p_admin,'admin'::public.app_role) OR public.has_role(p_admin,'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF p_product NOT IN ('hilo','dice','wheel','keno','crash','towers','poker') THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;

  SELECT * INTO v_cur FROM public.arcade_mini_configs
   WHERE product = p_product AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  UPDATE public.arcade_mini_configs SET status = 'retired', updated_at = now() WHERE id = v_cur.id;

  INSERT INTO public.arcade_mini_configs(product, version, status, min_stake, max_stake, chip_values,
    target_rtp, max_multiplier, round_ttl_seconds, daily_round_limit, cooldown_seconds,
    maintenance_mode, announcement, payload)
  VALUES (
    v_cur.product, v_cur.version + 1, 'active',
    coalesce((p_patch->>'min_stake')::numeric, v_cur.min_stake),
    coalesce((p_patch->>'max_stake')::numeric, v_cur.max_stake),
    coalesce((SELECT array_agg(x::numeric ORDER BY ord)
                FROM jsonb_array_elements_text(p_patch->'chip_values') WITH ORDINALITY t(x,ord)), v_cur.chip_values),
    coalesce((p_patch->>'target_rtp')::numeric, v_cur.target_rtp),
    coalesce((p_patch->>'max_multiplier')::numeric, v_cur.max_multiplier),
    coalesce((p_patch->>'round_ttl_seconds')::int, v_cur.round_ttl_seconds),
    coalesce((p_patch->>'daily_round_limit')::int, v_cur.daily_round_limit),
    coalesce((p_patch->>'cooldown_seconds')::int, v_cur.cooldown_seconds),
    coalesce((p_patch->>'maintenance_mode')::boolean, v_cur.maintenance_mode),
    CASE WHEN p_patch ? 'announcement' THEN nullif(p_patch->>'announcement','') ELSE v_cur.announcement END,
    coalesce(p_patch->'payload', v_cur.payload)
  ) RETURNING * INTO v_new;

  IF v_new.min_stake <= 0 OR v_new.min_stake > v_new.max_stake THEN RAISE EXCEPTION 'INVALID_STAKE_RANGE'; END IF;
  IF v_new.target_rtp <= 0.5 OR v_new.target_rtp > 1 THEN RAISE EXCEPTION 'INVALID_TARGET_RTP'; END IF;
  IF v_new.max_multiplier <= 0 OR v_new.max_multiplier > 10000 THEN RAISE EXCEPTION 'INVALID_MAX_MULTIPLIER'; END IF;
  IF v_new.daily_round_limit <= 0 THEN RAISE EXCEPTION 'INVALID_DAILY_LIMIT'; END IF;

  PERFORM public.create_audit_log(p_admin,'arcade_mini_publish_config','arcade_mini_configs',
    v_new.id::text, jsonb_build_object('product', v_new.product, 'version', v_new.version,
                                       'reason', p_reason, 'patch', p_patch));
  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION public.arcade_towers_dragons(public.arcade_mini_rounds, int, int, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_towers_reveal_all(public.arcade_mini_rounds) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_towers_start(uuid, numeric, text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_towers_pick(uuid, uuid, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_towers_cashout(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_poker_deck(public.arcade_mini_rounds) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_poker_eval(int[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_poker_deal(uuid, numeric, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_poker_draw(uuid, uuid, int[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_towers_start(uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_towers_pick(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_towers_cashout(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_poker_deal(uuid, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_poker_draw(uuid, uuid, int[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_publish_mini_config(uuid, text, jsonb, text) TO service_role;