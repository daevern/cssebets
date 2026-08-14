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
  IF p_product NOT IN ('treasure','roulette','blackjack','rps','hilo','dice','wheel') THEN
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

INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, product, environment, currency_or_unit, status)
SELECT code, atype::public.acct_account_type, nbal::public.acct_normal_balance, prod, env, 'POINTS', 'ACTIVE'
FROM (
  VALUES
    ('HILO_STAKE_REVENUE','REVENUE','CREDIT','hilo'),
    ('HILO_PAYOUT_EXPENSE','EXPENSE','DEBIT','hilo'),
    ('HILO_PL_TO_RESERVE','EQUITY','DEBIT','hilo'),
    ('DICE_STAKE_REVENUE','REVENUE','CREDIT','dice'),
    ('DICE_PAYOUT_EXPENSE','EXPENSE','DEBIT','dice'),
    ('DICE_PL_TO_RESERVE','EQUITY','DEBIT','dice'),
    ('WHEEL_STAKE_REVENUE','REVENUE','CREDIT','wheel'),
    ('WHEEL_PAYOUT_EXPENSE','EXPENSE','DEBIT','wheel'),
    ('WHEEL_PL_TO_RESERVE','EQUITY','DEBIT','wheel')
) AS v(code, atype, nbal, prod)
CROSS JOIN (VALUES ('PRODUCTION'::public.acct_environment), ('SIMULATION'::public.acct_environment)) AS e(env)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_accounts a
   WHERE a.account_code = v.code AND a.environment = e.env AND a.user_id IS NULL
);

INSERT INTO public.accounting_migration_flags (product, journal_enabled, dual_write, liability_enforced, capacity_enforced, notes)
VALUES
  ('hilo', true, true, true, true, 'CSSE Originals Hi-Lo'),
  ('dice', true, true, true, true, 'CSSE Originals Dice'),
  ('wheel', true, true, true, true, 'CSSE Originals Fortune Wheel')
ON CONFLICT (product) DO UPDATE
  SET journal_enabled = true, dual_write = true,
      liability_enforced = true, capacity_enforced = true, updated_at = now();

ALTER TABLE public.arcade_config_versions DROP CONSTRAINT IF EXISTS arcade_config_versions_product_check;
ALTER TABLE public.arcade_config_versions ADD CONSTRAINT arcade_config_versions_product_check
  CHECK (product = ANY (ARRAY['plinko','rps','blackjack','roulette','treasure','hilo','dice','wheel']));

CREATE TABLE IF NOT EXISTS public.arcade_mini_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL CHECK (product IN ('hilo','dice','wheel')),
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
  min_stake numeric(14,2) NOT NULL DEFAULT 1,
  max_stake numeric(14,2) NOT NULL DEFAULT 100,
  chip_values numeric[] NOT NULL DEFAULT ARRAY[1,5,10,25,50]::numeric[],
  target_rtp numeric(6,4) NOT NULL DEFAULT 0.9600,
  max_multiplier numeric(12,4) NOT NULL DEFAULT 48,
  round_ttl_seconds int NOT NULL DEFAULT 900,
  daily_round_limit int NOT NULL DEFAULT 1000,
  cooldown_seconds int NOT NULL DEFAULT 0,
  maintenance_mode boolean NOT NULL DEFAULT false,
  announcement text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS arcade_mini_configs_one_active
  ON public.arcade_mini_configs (product) WHERE status = 'active';

GRANT ALL ON public.arcade_mini_configs TO service_role;
ALTER TABLE public.arcade_mini_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mini configs service only" ON public.arcade_mini_configs;
CREATE POLICY "mini configs service only" ON public.arcade_mini_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.arcade_mini_configs (product, version, status, min_stake, max_stake, target_rtp, max_multiplier, payload)
VALUES
  ('dice', 1, 'active', 1, 100, 0.9600, 48, jsonb_build_object('min_target', 2, 'max_target', 98)),
  ('wheel', 1, 'active', 1, 100, 0.9600, 15, jsonb_build_object(
     'segments', jsonb_build_object(
       'low',    jsonb_build_array(1.2,0.2,1.2,1.5,1.2,0.2,1.2,1.5,1.2,0.2,1.2,1.5,1.2,0.2,1.2,1.5,1.2,0.2,1.2,0.2),
       'medium', jsonb_build_array(1.8,0,1.0,0,4.0,0,1.0,0,1.8,0,1.0,0,4.0,0,1.0,0,1.8,0,1.8,0),
       'high',   jsonb_build_array(15,0,0,0,0,2.1,0,0,0,0,0,0,0,0,0,2.1,0,0,0,0)
     ))),
  ('hilo', 1, 'active', 1, 50, 0.9600, 25, jsonb_build_object('deck', 'infinite'))
ON CONFLICT (product, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.arcade_mini_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product text NOT NULL CHECK (product IN ('hilo','dice','wheel')),
  config_id uuid NOT NULL REFERENCES public.arcade_mini_configs(id),
  config_version int NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SETTLED','VOID','EXPIRED')),
  outcome text CHECK (outcome IN ('WIN','LOSS','PUSH','VOID')),
  stake numeric(14,2) NOT NULL DEFAULT 0,
  multiplier numeric(12,4) NOT NULL DEFAULT 0,
  gross_return numeric(14,2) NOT NULL DEFAULT 0,
  user_net numeric(14,2) NOT NULL DEFAULT 0,
  house_net numeric(14,2) NOT NULL DEFAULT 0,
  step_count int NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed_id uuid,
  server_seed text NOT NULL,
  server_seed_hash text NOT NULL,
  client_seed text NOT NULL DEFAULT '',
  nonce int NOT NULL DEFAULT 0,
  random_hex text,
  verification_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text,
  result_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  settled_at timestamptz,
  server_seed_revealed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS arcade_mini_rounds_idem
  ON public.arcade_mini_rounds (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS arcade_mini_rounds_user_product
  ON public.arcade_mini_rounds (user_id, product, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS arcade_mini_rounds_one_active_hilo
  ON public.arcade_mini_rounds (user_id) WHERE product = 'hilo' AND status = 'ACTIVE';

GRANT ALL ON public.arcade_mini_rounds TO service_role;
ALTER TABLE public.arcade_mini_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mini rounds service only" ON public.arcade_mini_rounds;
CREATE POLICY "mini rounds service only" ON public.arcade_mini_rounds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.arcade_mini_hex(p_server_seed text, p_input text, p_cursor int)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT encode(extensions.digest(p_server_seed || ':' || p_input || ':' || p_cursor::text, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.arcade_mini_rand(p_server_seed text, p_input text, p_cursor int)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT (('x' || substr(public.arcade_mini_hex(p_server_seed, p_input, p_cursor), 1, 8))::bit(32)::bigint)::numeric
         / 4294967296::numeric;
$$;

CREATE OR REPLACE FUNCTION public.arcade_mini_open(
  p_user uuid, p_product text, p_stake numeric, p_client_seed text,
  p_idempotency_key text, p_max_gross numeric, p_state jsonb)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cfg public.arcade_mini_configs;
  v_round public.arcade_mini_rounds;
  v_seed public.arcade_randomness_seeds;
  v_new_seed text;
  v_round_seed text;
  v_stake numeric(14,2);
  v_wallet public.wallets;
  v_new_balance numeric(14,2);
  v_today int;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN
    RAISE EXCEPTION 'INVALID_CLIENT_SEED';
  END IF;

  SELECT * INTO v_round FROM public.arcade_mini_rounds
   WHERE user_id = p_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_round; END IF;

  SELECT * INTO v_cfg FROM public.arcade_mini_configs
   WHERE product = p_product AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;
  IF v_cfg.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;

  v_stake := round(coalesce(p_stake, 0), 2);
  IF v_stake < v_cfg.min_stake THEN RAISE EXCEPTION 'BELOW_MIN_STAKE'; END IF;
  IF v_stake > v_cfg.max_stake THEN RAISE EXCEPTION 'ABOVE_MAX_STAKE'; END IF;

  UPDATE public.arcade_mini_rounds SET status = 'EXPIRED', result_reason = 'ttl'
   WHERE user_id = p_user AND product = p_product AND status = 'ACTIVE' AND expires_at < now();

  SELECT count(*) INTO v_today FROM public.arcade_mini_rounds
   WHERE user_id = p_user AND product = p_product AND status = 'SETTLED'
     AND created_at >= date_trunc('day', now());
  IF v_today >= v_cfg.daily_round_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  PERFORM public.accounting_arcade_assert_capacity(p_product, p_user, round(p_max_gross, 2), v_stake);

  SELECT * INTO v_seed FROM public.arcade_randomness_seeds
   WHERE user_id = p_user AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    v_new_seed := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.arcade_randomness_seeds(user_id, server_seed, server_seed_hash, client_seed, nonce, status)
      VALUES (p_user, v_new_seed, encode(extensions.digest(v_new_seed,'sha256'),'hex'), '', 0, 'active')
      RETURNING * INTO v_seed;
  END IF;
  UPDATE public.arcade_randomness_seeds SET nonce = nonce + 1 WHERE id = v_seed.id RETURNING * INTO v_seed;

  v_round_seed := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.arcade_mini_rounds(
    user_id, product, config_id, config_version, status, stake, state,
    seed_id, server_seed, server_seed_hash, client_seed, nonce, idempotency_key, expires_at
  ) VALUES (
    p_user, p_product, v_cfg.id, v_cfg.version, 'ACTIVE', v_stake, coalesce(p_state, '{}'::jsonb),
    v_seed.id, v_round_seed, encode(extensions.digest(v_round_seed,'sha256'),'hex'),
    p_client_seed, v_seed.nonce, p_idempotency_key,
    now() + make_interval(secs => v_cfg.round_ttl_seconds)
  ) RETURNING * INTO v_round;

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
    'bet_placement', v_round.id, 'CSSE Originals ' || p_product || ' stake', 'arcade_' || p_product,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'round_id', v_round.id)
  );

  PERFORM public.accounting_reserve_liability(
    p_product, p_product, 'arcade_' || p_product || '_round', v_round.id,
    p_user, round(p_max_gross, 2), v_stake, v_cfg.version::text, coalesce(p_state,'{}'::jsonb), true);

  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_mini_close(
  p_round_id uuid, p_outcome text, p_multiplier numeric, p_state jsonb, p_random_hex text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_round public.arcade_mini_rounds;
  v_gross numeric(14,2);
  v_new_balance numeric(14,2);
BEGIN
  SELECT * INTO v_round FROM public.arcade_mini_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_ALREADY_SETTLED'; END IF;

  v_gross := round(v_round.stake * greatest(coalesce(p_multiplier, 0), 0), 2);

  IF v_gross > 0 THEN
    UPDATE public.wallets SET balance = balance + v_gross, updated_at = now()
     WHERE user_id = v_round.user_id RETURNING balance INTO v_new_balance;
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata
    ) VALUES (
      v_round.user_id, 'credit', v_gross, v_new_balance - v_gross, v_new_balance,
      'bet_settlement', v_round.id, 'CSSE Originals ' || v_round.product || ' return',
      'arcade_' || v_round.product,
      jsonb_build_object('outcome', p_outcome, 'multiplier', p_multiplier, 'stake', v_round.stake)
    );
  END IF;

  UPDATE public.arcade_mini_rounds SET
    status = 'SETTLED',
    outcome = p_outcome,
    multiplier = round(coalesce(p_multiplier, 0), 4),
    gross_return = v_gross,
    user_net = v_gross - stake,
    house_net = stake - v_gross,
    state = coalesce(p_state, state),
    random_hex = coalesce(p_random_hex, random_hex),
    settled_at = now(),
    server_seed_revealed_at = now()
  WHERE id = v_round.id RETURNING * INTO v_round;

  PERFORM public.accounting_release_liability(
    'arcade_' || v_round.product || '_round', v_round.id, 'settled');

  PERFORM public.accounting_arcade_hook(
    v_round.product, 'arcade_' || v_round.product || '_round', v_round.id, v_round.user_id,
    v_round.stake, v_gross, v_round.created_at,
    jsonb_build_object('source', 'arcade_' || v_round.product, 'outcome', p_outcome,
                       'multiplier', v_round.multiplier,
                       'config_version', v_round.config_version::text,
                       'verification_id', v_round.verification_id),
    'arcade_' || v_round.product, v_round.idempotency_key);

  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_dice_multiplier(p_target numeric, p_direction text, p_rtp numeric, p_cap numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT least(p_cap, round(p_rtp * 100 /
    CASE WHEN p_direction = 'under' THEN p_target ELSE 100 - p_target END, 4));
$$;

CREATE OR REPLACE FUNCTION public.arcade_dice_play(
  p_user uuid, p_stake numeric, p_target numeric, p_direction text,
  p_client_seed text, p_idempotency_key text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cfg public.arcade_mini_configs;
  v_round public.arcade_mini_rounds;
  v_target numeric(6,2);
  v_mult numeric(12,4);
  v_roll numeric(6,2);
  v_hex text;
  v_input text;
  v_win boolean;
BEGIN
  IF p_direction NOT IN ('under','over') THEN RAISE EXCEPTION 'INVALID_DIRECTION'; END IF;
  SELECT * INTO v_cfg FROM public.arcade_mini_configs WHERE product = 'dice' AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  v_target := round(coalesce(p_target, 50), 2);
  IF v_target < (v_cfg.payload->>'min_target')::numeric OR v_target > (v_cfg.payload->>'max_target')::numeric THEN
    RAISE EXCEPTION 'INVALID_TARGET';
  END IF;

  v_mult := public.arcade_dice_multiplier(v_target, p_direction, v_cfg.target_rtp, v_cfg.max_multiplier);

  v_round := public.arcade_mini_open(
    p_user, 'dice', p_stake, p_client_seed, p_idempotency_key,
    round(coalesce(p_stake,0) * v_mult, 2),
    jsonb_build_object('target', v_target, 'direction', p_direction, 'multiplier', v_mult));
  IF v_round.status = 'SETTLED' THEN RETURN v_round; END IF;

  v_input := v_round.client_seed || ':' || v_round.nonce::text || ':' || v_round.id::text;
  v_hex := public.arcade_mini_hex(v_round.server_seed, v_input, 0);
  v_roll := floor(public.arcade_mini_rand(v_round.server_seed, v_input, 0) * 10000) / 100;

  v_win := CASE WHEN p_direction = 'under' THEN v_roll < v_target ELSE v_roll >= v_target END;

  RETURN public.arcade_mini_close(
    v_round.id,
    CASE WHEN v_win THEN 'WIN' ELSE 'LOSS' END,
    CASE WHEN v_win THEN v_mult ELSE 0 END,
    v_round.state || jsonb_build_object('roll', v_roll),
    v_hex);
END $$;

CREATE OR REPLACE FUNCTION public.arcade_wheel_play(
  p_user uuid, p_stake numeric, p_risk text, p_client_seed text, p_idempotency_key text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cfg public.arcade_mini_configs;
  v_round public.arcade_mini_rounds;
  v_segments jsonb;
  v_count int;
  v_index int;
  v_mult numeric(12,4);
  v_max numeric(12,4);
  v_hex text;
  v_input text;
BEGIN
  IF p_risk NOT IN ('low','medium','high') THEN RAISE EXCEPTION 'INVALID_RISK'; END IF;
  SELECT * INTO v_cfg FROM public.arcade_mini_configs WHERE product = 'wheel' AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  v_segments := v_cfg.payload->'segments'->p_risk;
  v_count := jsonb_array_length(v_segments);
  IF v_count IS NULL OR v_count = 0 THEN RAISE EXCEPTION 'INVALID_RISK'; END IF;

  SELECT max(elem::text::numeric) INTO v_max FROM jsonb_array_elements(v_segments) AS elem;

  v_round := public.arcade_mini_open(
    p_user, 'wheel', p_stake, p_client_seed, p_idempotency_key,
    round(coalesce(p_stake,0) * v_max, 2),
    jsonb_build_object('risk', p_risk, 'segments', v_segments));
  IF v_round.status = 'SETTLED' THEN RETURN v_round; END IF;

  v_input := v_round.client_seed || ':' || v_round.nonce::text || ':' || v_round.id::text;
  v_hex := public.arcade_mini_hex(v_round.server_seed, v_input, 0);
  v_index := floor(public.arcade_mini_rand(v_round.server_seed, v_input, 0) * v_count)::int;
  v_mult := (v_segments->v_index)::text::numeric;

  RETURN public.arcade_mini_close(
    v_round.id,
    CASE WHEN v_mult >= 1 THEN 'WIN' ELSE 'LOSS' END,
    v_mult,
    v_round.state || jsonb_build_object('segment', v_index, 'multiplier', v_mult),
    v_hex);
END $$;

CREATE OR REPLACE FUNCTION public.arcade_hilo_prob(p_rank int, p_guess text)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN p_guess = 'higher' THEN (13 - p_rank)::numeric / 13
              ELSE p_rank::numeric / 13 END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_hilo_draw(p_round public.arcade_mini_rounds, p_cursor int)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'rank', floor(public.arcade_mini_rand(p_round.server_seed,
              p_round.client_seed || ':' || p_round.nonce::text || ':' || p_round.id::text, p_cursor) * 13)::int,
    'suit', floor(public.arcade_mini_rand(p_round.server_seed,
              p_round.client_seed || ':' || p_round.nonce::text || ':' || p_round.id::text, p_cursor + 1000) * 4)::int);
$$;

CREATE OR REPLACE FUNCTION public.arcade_hilo_start(
  p_user uuid, p_stake numeric, p_client_seed text, p_idempotency_key text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cfg public.arcade_mini_configs;
  v_round public.arcade_mini_rounds;
  v_card jsonb;
BEGIN
  SELECT * INTO v_cfg FROM public.arcade_mini_configs WHERE product = 'hilo' AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  v_round := public.arcade_mini_open(
    p_user, 'hilo', p_stake, p_client_seed, p_idempotency_key,
    round(coalesce(p_stake,0) * v_cfg.max_multiplier, 2),
    jsonb_build_object('cards', '[]'::jsonb, 'multiplier', 1));
  IF v_round.status <> 'ACTIVE' OR v_round.step_count > 0
     OR jsonb_array_length(coalesce(v_round.state->'cards','[]'::jsonb)) > 0 THEN
    RETURN v_round;
  END IF;

  v_card := public.arcade_hilo_draw(v_round, 0);

  UPDATE public.arcade_mini_rounds SET
    state = jsonb_build_object('cards', jsonb_build_array(v_card), 'multiplier', 1,
                               'max_multiplier', v_cfg.max_multiplier),
    multiplier = 1
  WHERE id = v_round.id RETURNING * INTO v_round;

  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_hilo_guess(
  p_user uuid, p_round_id uuid, p_guess text)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_round public.arcade_mini_rounds;
  v_cfg public.arcade_mini_configs;
  v_cards jsonb;
  v_current int;
  v_card jsonb;
  v_next int;
  v_prob numeric;
  v_step numeric(12,4);
  v_mult numeric(12,4);
  v_win boolean;
BEGIN
  IF p_guess NOT IN ('higher','lower') THEN RAISE EXCEPTION 'INVALID_GUESS'; END IF;

  SELECT * INTO v_round FROM public.arcade_mini_rounds
   WHERE id = p_round_id AND user_id = p_user AND product = 'hilo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_ALREADY_SETTLED'; END IF;
  IF v_round.expires_at < now() THEN
    PERFORM public.arcade_mini_close(v_round.id, 'VOID', 1, v_round.state, NULL);
    RAISE EXCEPTION 'ROUND_EXPIRED';
  END IF;

  SELECT * INTO v_cfg FROM public.arcade_mini_configs WHERE id = v_round.config_id;

  v_cards := v_round.state->'cards';
  v_current := ((v_cards->(jsonb_array_length(v_cards) - 1))->>'rank')::int;

  v_prob := public.arcade_hilo_prob(v_current, p_guess);
  IF v_prob <= 0 THEN RAISE EXCEPTION 'IMPOSSIBLE_GUESS'; END IF;

  v_step := round(v_cfg.target_rtp / v_prob, 4);
  v_mult := round(coalesce((v_round.state->>'multiplier')::numeric, 1) * v_step, 4);
  IF v_mult > v_cfg.max_multiplier THEN v_mult := v_cfg.max_multiplier; END IF;

  v_card := public.arcade_hilo_draw(v_round, v_round.step_count + 1);
  v_next := (v_card->>'rank')::int;
  v_cards := v_cards || jsonb_build_array(v_card);

  v_win := CASE WHEN p_guess = 'higher' THEN v_next >= v_current ELSE v_next < v_current END;

  IF NOT v_win THEN
    RETURN public.arcade_mini_close(v_round.id, 'LOSS', 0,
      v_round.state || jsonb_build_object('cards', v_cards, 'guess', p_guess, 'multiplier', 0), NULL);
  END IF;

  UPDATE public.arcade_mini_rounds SET
    step_count = step_count + 1,
    multiplier = v_mult,
    state = v_round.state || jsonb_build_object('cards', v_cards, 'multiplier', v_mult,
                                                'last_guess', p_guess, 'last_step', v_step)
  WHERE id = v_round.id RETURNING * INTO v_round;

  IF v_mult >= v_cfg.max_multiplier THEN
    RETURN public.arcade_mini_close(v_round.id, 'WIN', v_mult,
      v_round.state || jsonb_build_object('capped', true), NULL);
  END IF;

  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_hilo_cashout(p_user uuid, p_round_id uuid)
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_round public.arcade_mini_rounds;
BEGIN
  SELECT * INTO v_round FROM public.arcade_mini_rounds
   WHERE id = p_round_id AND user_id = p_user AND product = 'hilo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_ALREADY_SETTLED'; END IF;
  IF v_round.step_count = 0 THEN RAISE EXCEPTION 'NOTHING_TO_COLLECT'; END IF;

  RETURN public.arcade_mini_close(v_round.id, 'WIN',
    coalesce((v_round.state->>'multiplier')::numeric, 1),
    v_round.state || jsonb_build_object('collected', true), NULL);
END $$;

REVOKE ALL ON FUNCTION public.arcade_mini_open(uuid,text,numeric,text,text,numeric,jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_mini_close(uuid,text,numeric,jsonb,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_dice_play(uuid,numeric,numeric,text,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_wheel_play(uuid,numeric,text,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_hilo_start(uuid,numeric,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_hilo_guess(uuid,uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_hilo_cashout(uuid,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_mini_open(uuid,text,numeric,text,text,numeric,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_mini_close(uuid,text,numeric,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_dice_play(uuid,numeric,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_wheel_play(uuid,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_hilo_start(uuid,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_hilo_guess(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_hilo_cashout(uuid,uuid) TO service_role;