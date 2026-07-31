DO $$ BEGIN
  CREATE TYPE public.arcade_treasure_status AS ENUM
    ('CREATED','ACTIVE','COLLECTING','WON','LOST','PUSH','VOID','REVERSED','EXPIRED','ERROR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.arcade_treasure_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  difficulty text NOT NULL CHECK (difficulty ~ '^[a-z_]{3,24}$'),
  label text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','scheduled','active','archived','retired')),
  grid_rows smallint NOT NULL CHECK (grid_rows BETWEEN 2 AND 8),
  grid_cols smallint NOT NULL CHECK (grid_cols BETWEEN 2 AND 8),
  trap_count smallint NOT NULL CHECK (trap_count >= 1),
  target_rtp numeric(6,4) NOT NULL CHECK (target_rtp BETWEEN 0.9200 AND 0.9900),
  rtp_version integer NOT NULL DEFAULT 1,
  min_stake integer NOT NULL DEFAULT 1 CHECK (min_stake >= 1),
  max_stake integer NOT NULL DEFAULT 1000,
  max_return integer NOT NULL DEFAULT 100000,
  max_multiplier numeric(12,4) NOT NULL DEFAULT 5000,
  chip_values integer[] NOT NULL DEFAULT ARRAY[1,5,10,25,50,100],
  round_timeout_seconds integer NOT NULL DEFAULT 120 CHECK (round_timeout_seconds BETWEEN 30 AND 3600),
  daily_round_limit integer NOT NULL DEFAULT 500,
  cooldown_seconds integer NOT NULL DEFAULT 0,
  maintenance_mode boolean NOT NULL DEFAULT false,
  announcement text,
  effective_from timestamptz,
  effective_to timestamptz,
  change_reason text,
  created_by uuid,
  approved_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (difficulty, version)
);
CREATE UNIQUE INDEX arcade_treasure_one_active_per_difficulty
  ON public.arcade_treasure_configurations (difficulty) WHERE status = 'active';
GRANT SELECT ON public.arcade_treasure_configurations TO authenticated;
GRANT ALL ON public.arcade_treasure_configurations TO service_role;
ALTER TABLE public.arcade_treasure_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read active treasure configs" ON public.arcade_treasure_configurations
  FOR SELECT TO authenticated USING (status = 'active' OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arcade_treasure_multiplier_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.arcade_treasure_configurations(id) ON DELETE CASCADE,
  config_version integer NOT NULL,
  rtp_version integer NOT NULL,
  grid_size smallint NOT NULL,
  trap_count smallint NOT NULL,
  safe_reveals smallint NOT NULL CHECK (safe_reveals >= 1),
  survival_probability numeric(20,16) NOT NULL,
  fair_multiplier numeric(20,8) NOT NULL,
  target_rtp numeric(6,4) NOT NULL,
  actual_multiplier numeric(16,8) NOT NULL,
  display_multiplier numeric(12,2) NOT NULL,
  payout_rule text NOT NULL DEFAULT 'floor(stake * actual_multiplier)',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_id, safe_reveals)
);
GRANT SELECT ON public.arcade_treasure_multiplier_tables TO authenticated;
GRANT ALL ON public.arcade_treasure_multiplier_tables TO service_role;
ALTER TABLE public.arcade_treasure_multiplier_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read treasure multipliers" ON public.arcade_treasure_multiplier_tables
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.arcade_treasure_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.arcade_treasure_status NOT NULL DEFAULT 'ACTIVE',
  difficulty text NOT NULL,
  grid_rows smallint NOT NULL,
  grid_cols smallint NOT NULL,
  trap_count smallint NOT NULL,
  stake integer NOT NULL CHECK (stake > 0),
  gross_return integer NOT NULL DEFAULT 0,
  unrounded_return numeric(20,8) NOT NULL DEFAULT 0,
  user_net integer NOT NULL DEFAULT 0,
  platform_net integer NOT NULL DEFAULT 0,
  current_multiplier numeric(12,4) NOT NULL DEFAULT 1,
  final_multiplier numeric(12,4),
  safe_reveals smallint NOT NULL DEFAULT 0,
  selected_trap_index smallint,
  config_id uuid NOT NULL REFERENCES public.arcade_treasure_configurations(id),
  config_version integer NOT NULL,
  rtp_version integer NOT NULL,
  seed_id uuid NOT NULL REFERENCES public.arcade_randomness_seeds(id),
  client_seed text NOT NULL,
  server_seed_hash text NOT NULL,
  nonce integer NOT NULL,
  verification_id text NOT NULL,
  state_version integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  result_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_action_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE UNIQUE INDEX arcade_treasure_one_active_round
  ON public.arcade_treasure_rounds (user_id)
  WHERE status IN ('CREATED','ACTIVE','COLLECTING');
CREATE INDEX arcade_treasure_rounds_user_created_idx ON public.arcade_treasure_rounds (user_id, created_at DESC);
CREATE INDEX arcade_treasure_rounds_created_idx ON public.arcade_treasure_rounds (created_at DESC);
CREATE INDEX arcade_treasure_rounds_status_idx ON public.arcade_treasure_rounds (status);
CREATE INDEX arcade_treasure_rounds_config_idx ON public.arcade_treasure_rounds (config_version);
CREATE INDEX arcade_treasure_rounds_verification_idx ON public.arcade_treasure_rounds (verification_id);
GRANT SELECT ON public.arcade_treasure_rounds TO authenticated;
GRANT ALL ON public.arcade_treasure_rounds TO service_role;
ALTER TABLE public.arcade_treasure_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own treasure rounds" ON public.arcade_treasure_rounds
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all treasure rounds" ON public.arcade_treasure_rounds
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arcade_treasure_round_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.arcade_treasure_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('START','REVEAL','COLLECT','TIMEOUT','VOID','REVERSE','ADMIN_RESOLVE')),
  tile_index smallint,
  action_sequence integer NOT NULL,
  state_version_before integer NOT NULL DEFAULT 0,
  state_version_after integer NOT NULL DEFAULT 0,
  multiplier_after numeric(12,4),
  potential_return_after integer,
  outcome text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL DEFAULT gen_random_uuid()::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, action_sequence),
  UNIQUE (round_id, idempotency_key)
);
CREATE INDEX arcade_treasure_actions_round_idx ON public.arcade_treasure_round_actions (round_id, action_sequence);
GRANT SELECT ON public.arcade_treasure_round_actions TO authenticated;
GRANT ALL ON public.arcade_treasure_round_actions TO service_role;
ALTER TABLE public.arcade_treasure_round_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own treasure actions" ON public.arcade_treasure_round_actions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read treasure actions" ON public.arcade_treasure_round_actions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arcade_treasure_tiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.arcade_treasure_rounds(id) ON DELETE CASCADE,
  tile_index smallint NOT NULL,
  tile_type text NOT NULL CHECK (tile_type IN ('SAFE','TRAP')),
  reveal_sequence integer,
  revealed_at timestamptz,
  selected_by_user boolean NOT NULL DEFAULT false,
  UNIQUE (round_id, tile_index)
);
CREATE INDEX arcade_treasure_tiles_round_idx ON public.arcade_treasure_tiles (round_id);
GRANT ALL ON public.arcade_treasure_tiles TO service_role;
ALTER TABLE public.arcade_treasure_tiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_treasure_config_updated BEFORE UPDATE ON public.arcade_treasure_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_treasure_rounds_updated BEFORE UPDATE ON public.arcade_treasure_rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.arcade_treasure_build_multipliers(p_config uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.arcade_treasure_configurations;
  n int; m int; s int; k int;
  p numeric := 1; fair numeric; actual numeric; rows_out int := 0;
BEGIN
  SELECT * INTO c FROM public.arcade_treasure_configurations WHERE id = p_config;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFIG_NOT_FOUND'; END IF;
  n := c.grid_rows * c.grid_cols;
  m := c.trap_count;
  s := n - m;
  IF s < 1 THEN RAISE EXCEPTION 'INVALID_TRAP_COUNT'; END IF;
  DELETE FROM public.arcade_treasure_multiplier_tables WHERE config_id = p_config;
  FOR k IN 1..s LOOP
    p := p * ((s - (k - 1))::numeric / (n - (k - 1))::numeric);
    fair := 1 / p;
    actual := trunc(fair * c.target_rtp, 8);
    IF actual > c.max_multiplier THEN actual := c.max_multiplier; END IF;
    IF actual < 1 THEN actual := 1; END IF;
    INSERT INTO public.arcade_treasure_multiplier_tables(
      config_id, config_version, rtp_version, grid_size, trap_count, safe_reveals,
      survival_probability, fair_multiplier, target_rtp, actual_multiplier, display_multiplier
    ) VALUES (
      p_config, c.version, c.rtp_version, n, m, k,
      round(p, 16), round(fair, 8), c.target_rtp, actual, trunc(actual, 2)
    );
    rows_out := rows_out + 1;
  END LOOP;
  RETURN rows_out;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_treasure_generate_traps(
  p_server_seed text, p_client_seed text, p_nonce integer, p_n integer, p_m integer
) RETURNS integer[]
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  deck int[] := ARRAY(SELECT generate_series(0, p_n - 1));
  block bytea; offset_i int := 32; counter int := 0;
  i int; j int; bound bigint; limit_v bigint; r bigint; tmp int;
BEGIN
  IF p_m >= p_n OR p_m < 1 THEN RAISE EXCEPTION 'INVALID_TRAP_COUNT'; END IF;
  i := p_n - 1;
  WHILE i > 0 LOOP
    bound := i + 1;
    limit_v := 4294967296 - (4294967296 % bound);
    LOOP
      IF offset_i > 28 THEN
        block := extensions.hmac(
          p_client_seed || ':' || p_nonce::text || ':' || counter::text,
          p_server_seed, 'sha256');
        counter := counter + 1;
        offset_i := 0;
      END IF;
      r := (get_byte(block, offset_i)::bigint << 24)
         | (get_byte(block, offset_i + 1)::bigint << 16)
         | (get_byte(block, offset_i + 2)::bigint << 8)
         | get_byte(block, offset_i + 3)::bigint;
      offset_i := offset_i + 4;
      EXIT WHEN r < limit_v;
    END LOOP;
    j := (r % bound)::int;
    tmp := deck[i + 1];
    deck[i + 1] := deck[j + 1];
    deck[j + 1] := tmp;
    i := i - 1;
  END LOOP;
  RETURN deck[1:p_m];
END $$;

CREATE OR REPLACE FUNCTION public.arcade_treasure_start_round(
  p_user uuid, p_difficulty text, p_stake integer, p_client_seed text, p_idempotency_key text
) RETURNS public.arcade_treasure_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  RETURN v_round;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_treasure_reveal_tile(
  p_user uuid, p_round uuid, p_tile integer, p_state_version integer, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.arcade_treasure_rounds;
  v_tile public.arcade_treasure_tiles;
  v_n int; v_seq int; v_mult numeric := 1; v_pot int;
  v_action public.arcade_treasure_round_actions;
BEGIN
  SELECT * INTO r FROM public.arcade_treasure_rounds
    WHERE id = p_round AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;

  SELECT * INTO v_action FROM public.arcade_treasure_round_actions
    WHERE round_id = r.id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'round', to_jsonb(r),
      'tile_index', v_action.tile_index, 'tile_type', v_action.outcome);
  END IF;

  IF r.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_NOT_ACTIVE'; END IF;
  IF p_state_version IS DISTINCT FROM r.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;

  v_n := r.grid_rows * r.grid_cols;
  IF p_tile < 0 OR p_tile >= v_n THEN RAISE EXCEPTION 'INVALID_TILE'; END IF;

  SELECT * INTO v_tile FROM public.arcade_treasure_tiles
    WHERE round_id = r.id AND tile_index = p_tile FOR UPDATE;
  IF v_tile.selected_by_user THEN RAISE EXCEPTION 'TILE_ALREADY_OPEN'; END IF;

  SELECT coalesce(max(action_sequence),0) + 1 INTO v_seq
    FROM public.arcade_treasure_round_actions WHERE round_id = r.id;

  UPDATE public.arcade_treasure_tiles
    SET selected_by_user = true, reveal_sequence = v_seq, revealed_at = now()
    WHERE id = v_tile.id;

  IF v_tile.tile_type = 'TRAP' THEN
    UPDATE public.arcade_treasure_rounds SET
      status = 'LOST', selected_trap_index = p_tile, final_multiplier = 0,
      gross_return = 0, unrounded_return = 0, user_net = -r.stake, platform_net = r.stake,
      state_version = r.state_version + 1, last_action_at = now(), settled_at = now(),
      result_reason = 'Trap revealed'
      WHERE id = r.id RETURNING * INTO r;
  ELSE
    SELECT actual_multiplier INTO v_mult FROM public.arcade_treasure_multiplier_tables
      WHERE config_id = r.config_id AND safe_reveals = r.safe_reveals + 1;
    IF v_mult IS NULL THEN RAISE EXCEPTION 'MULTIPLIER_NOT_FOUND'; END IF;
    v_pot := floor(r.stake * v_mult)::int;

    UPDATE public.arcade_treasure_rounds SET
      safe_reveals = r.safe_reveals + 1,
      current_multiplier = round(v_mult, 4),
      state_version = r.state_version + 1,
      last_action_at = now(),
      expires_at = now() + make_interval(secs =>
        (SELECT round_timeout_seconds FROM public.arcade_treasure_configurations WHERE id = r.config_id))
      WHERE id = r.id RETURNING * INTO r;
  END IF;

  INSERT INTO public.arcade_treasure_round_actions(
    round_id, user_id, action_type, tile_index, action_sequence,
    state_version_before, state_version_after, multiplier_after, potential_return_after,
    outcome, idempotency_key
  ) VALUES (
    r.id, p_user, 'REVEAL', p_tile, v_seq, r.state_version - 1, r.state_version,
    CASE WHEN v_tile.tile_type = 'TRAP' THEN 0 ELSE round(v_mult,4) END,
    CASE WHEN v_tile.tile_type = 'TRAP' THEN 0 ELSE v_pot END,
    v_tile.tile_type, p_idempotency_key
  );

  RETURN jsonb_build_object(
    'tile_index', p_tile,
    'tile_type', v_tile.tile_type,
    'round', to_jsonb(r),
    'traps', CASE WHEN r.status = 'LOST'
      THEN (SELECT jsonb_agg(tile_index ORDER BY tile_index) FROM public.arcade_treasure_tiles
              WHERE round_id = r.id AND tile_type = 'TRAP')
      ELSE NULL END
  );
END $$;

CREATE OR REPLACE FUNCTION public.arcade_treasure_collect(
  p_user uuid, p_round uuid, p_state_version integer, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  RETURN jsonb_build_object(
    'round', to_jsonb(r),
    'traps', (SELECT jsonb_agg(tile_index ORDER BY tile_index) FROM public.arcade_treasure_tiles
                WHERE round_id = r.id AND tile_type = 'TRAP')
  );
END $$;

CREATE OR REPLACE FUNCTION public.arcade_admin_resolve_treasure_round(
  p_round uuid, p_admin uuid, p_status text, p_reason text
) RETURNS public.arcade_treasure_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_round public.arcade_treasure_rounds;
  v_delta numeric(14,2);
  v_new_balance numeric(14,2);
BEGIN
  IF NOT (public.has_role(p_admin, 'admin'::public.app_role)
          OR public.has_role(p_admin, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_status NOT IN ('VOID','REVERSED') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO v_round FROM public.arcade_treasure_rounds WHERE id = p_round FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_round.status IN ('VOID','REVERSED') THEN RAISE EXCEPTION 'ALREADY_RESOLVED'; END IF;
  IF v_round.status IN ('CREATED','ACTIVE','COLLECTING') THEN RAISE EXCEPTION 'ROUND_IN_PROGRESS'; END IF;

  v_delta := coalesce(v_round.stake,0) - coalesce(v_round.gross_return,0);

  PERFORM 1 FROM public.wallets WHERE user_id = v_round.user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets(user_id, balance) VALUES (v_round.user_id, 0);
  END IF;

  IF v_delta <> 0 THEN
    UPDATE public.wallets SET balance = balance + v_delta, updated_at = now()
      WHERE user_id = v_round.user_id RETURNING balance INTO v_new_balance;
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata
    ) VALUES (
      v_round.user_id,
      CASE WHEN v_delta > 0 THEN 'refund' ELSE 'adjustment' END::public.wallet_txn_type,
      abs(v_delta), v_new_balance - v_delta, v_new_balance,
      'admin_adjustment', v_round.id,
      'Treasure Grid round ' || lower(p_status),
      'arcade_treasure',
      jsonb_build_object('round_id', v_round.id, 'admin_id', p_admin,
                         'reason', p_reason, 'status', p_status)
    );
  END IF;

  UPDATE public.arcade_treasure_rounds
     SET status = p_status::public.arcade_treasure_status,
         result_reason = p_reason, user_net = 0, platform_net = 0,
         settled_at = coalesce(settled_at, now()),
         state_version = state_version + 1, updated_at = now()
   WHERE id = p_round
   RETURNING * INTO v_round;

  INSERT INTO public.arcade_treasure_round_actions(
    round_id, user_id, action_sequence, action_type, outcome, multiplier_after,
    state_version_before, state_version_after, metadata
  ) VALUES (
    v_round.id, v_round.user_id,
    coalesce((SELECT max(action_sequence) FROM public.arcade_treasure_round_actions WHERE round_id = v_round.id), 0) + 1,
    'ADMIN_RESOLVE', p_status, v_round.current_multiplier,
    v_round.state_version - 1, v_round.state_version,
    jsonb_build_object('admin_id', p_admin, 'reason', p_reason, 'wallet_delta', v_delta)
  );

  PERFORM public.create_audit_log(
    p_admin, 'arcade_treasure_resolve', 'arcade_treasure_rounds', v_round.id::text,
    jsonb_build_object('status', p_status, 'reason', p_reason, 'wallet_delta', v_delta)
  );

  RETURN v_round;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_publish_treasure_config(
  p_admin uuid, p_difficulty text, p_patch jsonb, p_reason text
) RETURNS public.arcade_treasure_configurations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cur public.arcade_treasure_configurations;
  v_new public.arcade_treasure_configurations;
  v_rtp numeric(6,4);
  v_traps smallint;
BEGIN
  IF NOT (public.has_role(p_admin, 'admin'::public.app_role)
          OR public.has_role(p_admin, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO v_cur FROM public.arcade_treasure_configurations
   WHERE difficulty = p_difficulty AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;

  v_rtp   := coalesce((p_patch->>'target_rtp')::numeric, v_cur.target_rtp);
  v_traps := coalesce((p_patch->>'trap_count')::smallint, v_cur.trap_count);
  IF v_rtp <= 0 OR v_rtp > 1 THEN RAISE EXCEPTION 'INVALID_RTP'; END IF;
  IF v_traps < 1 OR v_traps >= (v_cur.grid_rows * v_cur.grid_cols) THEN RAISE EXCEPTION 'INVALID_TRAP_COUNT'; END IF;

  UPDATE public.arcade_treasure_configurations
     SET status = 'archived', effective_to = now(), updated_at = now()
   WHERE id = v_cur.id;

  INSERT INTO public.arcade_treasure_configurations(
    difficulty, label, version, status, grid_rows, grid_cols, trap_count,
    target_rtp, rtp_version, min_stake, max_stake, max_return, max_multiplier,
    chip_values, round_timeout_seconds, daily_round_limit, cooldown_seconds,
    maintenance_mode, announcement, effective_from, change_reason, created_by, published_at
  ) VALUES (
    v_cur.difficulty,
    coalesce(nullif(p_patch->>'label',''), v_cur.label),
    v_cur.version + 1, 'active',
    v_cur.grid_rows, v_cur.grid_cols, v_traps, v_rtp,
    CASE WHEN v_rtp <> v_cur.target_rtp OR v_traps <> v_cur.trap_count
         THEN v_cur.rtp_version + 1 ELSE v_cur.rtp_version END,
    coalesce((p_patch->>'min_stake')::int, v_cur.min_stake),
    coalesce((p_patch->>'max_stake')::int, v_cur.max_stake),
    coalesce((p_patch->>'max_return')::int, v_cur.max_return),
    coalesce((p_patch->>'max_multiplier')::numeric, v_cur.max_multiplier),
    coalesce(
      (SELECT array_agg(x::int ORDER BY ord)
         FROM jsonb_array_elements_text(p_patch->'chip_values') WITH ORDINALITY t(x, ord)),
      v_cur.chip_values
    ),
    coalesce((p_patch->>'round_timeout_seconds')::int, v_cur.round_timeout_seconds),
    coalesce((p_patch->>'daily_round_limit')::int, v_cur.daily_round_limit),
    coalesce((p_patch->>'cooldown_seconds')::int, v_cur.cooldown_seconds),
    coalesce((p_patch->>'maintenance_mode')::boolean, v_cur.maintenance_mode),
    CASE WHEN p_patch ? 'announcement' THEN nullif(p_patch->>'announcement','') ELSE v_cur.announcement END,
    now(), p_reason, p_admin, now()
  ) RETURNING * INTO v_new;

  IF v_new.min_stake > v_new.max_stake THEN RAISE EXCEPTION 'INVALID_STAKE_RANGE'; END IF;

  PERFORM public.arcade_treasure_build_multipliers(v_new.id);

  PERFORM public.create_audit_log(
    p_admin, 'arcade_treasure_publish_config', 'arcade_treasure_configurations', v_new.id::text,
    jsonb_build_object('difficulty', v_new.difficulty, 'version', v_new.version,
                       'reason', p_reason, 'patch', p_patch)
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_treasure_expire_rounds(p_limit integer DEFAULT 200)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_treasure_start_round(uuid,text,integer,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_treasure_reveal_tile(uuid,uuid,integer,integer,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_treasure_collect(uuid,uuid,integer,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_treasure_generate_traps(text,text,integer,integer,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_admin_resolve_treasure_round(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_publish_treasure_config(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_treasure_expire_rounds(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_treasure_start_round(uuid,text,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_treasure_reveal_tile(uuid,uuid,integer,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_treasure_collect(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_treasure_build_multipliers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_admin_resolve_treasure_round(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_publish_treasure_config(uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_treasure_expire_rounds(integer) TO service_role;

INSERT INTO public.arcade_treasure_configurations
  (difficulty, label, version, status, grid_rows, grid_cols, trap_count, target_rtp,
   min_stake, max_stake, max_return, max_multiplier, round_timeout_seconds, change_reason, published_at, effective_from)
VALUES
  ('easy',   'Easy',   1, 'active', 5, 5, 3, 0.9600, 1, 1000, 100000, 5000, 120, 'Initial launch profile', now(), now()),
  ('medium', 'Medium', 1, 'active', 5, 5, 5, 0.9600, 1, 1000, 100000, 5000, 120, 'Initial launch profile', now(), now()),
  ('hard',   'Hard',   1, 'active', 5, 5, 8, 0.9600, 1, 1000, 100000, 5000, 120, 'Initial launch profile', now(), now());

SELECT public.arcade_treasure_build_multipliers(id)
  FROM public.arcade_treasure_configurations WHERE version = 1;