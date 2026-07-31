-- Harden helper functions from the previous migration
CREATE OR REPLACE FUNCTION public.arcade_score_band_for(p_score INT)
RETURNS public.arcade_score_band LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_score = 0 THEN 'ZERO'
    WHEN p_score < 50 THEN 'LOW'
    WHEN p_score < 250 THEN 'STANDARD'
    WHEN p_score < 600 THEN 'HIGH'
    WHEN p_score < 1500 THEN 'RARE'
    ELSE 'JACKPOT'
  END::public.arcade_score_band;
$$;

CREATE OR REPLACE FUNCTION public.arcade_generate_path(
  p_server_seed TEXT, p_client_seed TEXT, p_nonce INT, p_rows INT
) RETURNS SMALLINT[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  h BYTEA;
  path SMALLINT[] := ARRAY[]::SMALLINT[];
  i INT; byte INT; round INT := 0;
BEGIN
  WHILE array_length(path,1) IS NULL OR array_length(path,1) < p_rows LOOP
    h := extensions.hmac(p_client_seed || ':' || p_nonce::text || ':' || round::text, p_server_seed, 'sha256');
    FOR i IN 0..31 LOOP
      IF array_length(path,1) IS NOT NULL AND array_length(path,1) >= p_rows THEN EXIT; END IF;
      byte := get_byte(h, i);
      path := path || (byte % 2)::SMALLINT;
    END LOOP;
    round := round + 1;
  END LOOP;
  RETURN path;
END $$;

-- =========================================================
-- Mini roulette
-- =========================================================
CREATE TYPE public.arcade_roulette_status AS ENUM ('WIN','LOSS','PUSH','PENDING','VOID','REVERSED','ERROR');

CREATE TABLE public.arcade_roulette_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  wheel_order smallint[] NOT NULL,
  red_pockets smallint[] NOT NULL,
  black_pockets smallint[] NOT NULL,
  chip_values integer[] NOT NULL DEFAULT ARRAY[1,5,10,25,50,100],
  min_total_stake integer NOT NULL DEFAULT 1,
  max_total_stake integer NOT NULL DEFAULT 1000,
  max_stake_per_position integer NOT NULL DEFAULT 250,
  max_positions integer NOT NULL DEFAULT 20,
  daily_spin_limit integer NOT NULL DEFAULT 500,
  cooldown_seconds integer NOT NULL DEFAULT 0,
  maintenance_mode boolean NOT NULL DEFAULT false,
  announcement text,
  change_reason text,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_roulette_configurations TO authenticated;
GRANT ALL ON public.arcade_roulette_configurations TO service_role;
ALTER TABLE public.arcade_roulette_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone authed reads active config" ON public.arcade_roulette_configurations
  FOR SELECT TO authenticated USING (status = 'active' OR public.has_role(auth.uid(),'admin'));
CREATE UNIQUE INDEX arcade_roulette_one_active_config
  ON public.arcade_roulette_configurations ((status)) WHERE status = 'active';

CREATE TABLE public.arcade_roulette_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES public.arcade_roulette_configurations(id),
  config_version integer NOT NULL,
  seed_id uuid NOT NULL REFERENCES public.arcade_randomness_seeds(id),
  nonce integer NOT NULL,
  client_seed text NOT NULL,
  server_seed_hash text NOT NULL,
  random_hex text NOT NULL,
  winning_pocket smallint NOT NULL CHECK (winning_pocket BETWEEN 0 AND 12),
  winning_colour text NOT NULL,
  total_stake numeric(14,2) NOT NULL,
  total_return numeric(14,2) NOT NULL DEFAULT 0,
  user_net numeric(14,2) NOT NULL DEFAULT 0,
  house_net numeric(14,2) NOT NULL DEFAULT 0,
  winning_positions integer NOT NULL DEFAULT 0,
  losing_positions integer NOT NULL DEFAULT 0,
  position_count integer NOT NULL DEFAULT 0,
  status public.arcade_roulette_status NOT NULL DEFAULT 'PENDING',
  idempotency_key text NOT NULL,
  verification_id text NOT NULL,
  processing_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX arcade_roulette_spins_user_created_idx ON public.arcade_roulette_spins (user_id, created_at DESC);
CREATE INDEX arcade_roulette_spins_created_idx ON public.arcade_roulette_spins (created_at DESC);
CREATE INDEX arcade_roulette_spins_status_idx ON public.arcade_roulette_spins (status);
GRANT SELECT ON public.arcade_roulette_spins TO authenticated;
GRANT ALL ON public.arcade_roulette_spins TO service_role;
ALTER TABLE public.arcade_roulette_spins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own spins" ON public.arcade_roulette_spins
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all spins" ON public.arcade_roulette_spins
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arcade_roulette_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spin_id uuid NOT NULL REFERENCES public.arcade_roulette_spins(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bet_type text NOT NULL,
  bet_label text NOT NULL,
  covered_pockets smallint[] NOT NULL,
  covered_count integer NOT NULL,
  stake numeric(14,2) NOT NULL CHECK (stake > 0),
  return_multiplier numeric(10,4) NOT NULL,
  winning_pocket smallint NOT NULL,
  is_win boolean NOT NULL,
  gross_return numeric(14,2) NOT NULL DEFAULT 0,
  net_result numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arcade_roulette_bets_spin_idx ON public.arcade_roulette_bets (spin_id);
CREATE INDEX arcade_roulette_bets_user_idx ON public.arcade_roulette_bets (user_id, created_at DESC);
GRANT SELECT ON public.arcade_roulette_bets TO authenticated;
GRANT ALL ON public.arcade_roulette_bets TO service_role;
ALTER TABLE public.arcade_roulette_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roulette bets" ON public.arcade_roulette_bets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all roulette bets" ON public.arcade_roulette_bets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER arcade_roulette_config_updated_at BEFORE UPDATE ON public.arcade_roulette_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.arcade_roulette_configurations
  (version, status, wheel_order, red_pockets, black_pockets, published_at, change_reason)
VALUES
  (1, 'active',
   ARRAY[0,1,2,3,4,5,6,8,7,10,9,12,11]::smallint[],
   ARRAY[1,3,5,8,10,12]::smallint[],
   ARRAY[2,4,6,7,9,11]::smallint[],
   now(), 'Initial mini roulette configuration');

CREATE OR REPLACE FUNCTION public.arcade_roulette_draw(
  p_server_seed text, p_client_seed text, p_nonce integer,
  OUT pocket smallint, OUT random_hex text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_round int := 0;
  v_hex text;
  v_chunk text;
  v_u bigint;
  v_limit bigint := 4294967287;
  i int;
BEGIN
  LOOP
    v_hex := encode(extensions.hmac(p_client_seed || ':' || p_nonce::text || ':' || v_round::text,
                                    p_server_seed, 'sha256'), 'hex');
    FOR i IN 0..7 LOOP
      v_chunk := substr(v_hex, i * 8 + 1, 8);
      v_u := ('x' || v_chunk)::bit(32)::bigint;
      IF v_u < v_limit THEN
        pocket := (v_u % 13)::smallint;
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
$$;

CREATE OR REPLACE FUNCTION public.arcade_place_roulette_spin(
  p_user uuid,
  p_idempotency_key text,
  p_client_seed text,
  p_bets jsonb
)
RETURNS public.arcade_roulette_spins
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  SELECT count(*) INTO v_today_count FROM public.arcade_roulette_spins
    WHERE user_id = p_user AND created_at >= date_trunc('day', now());
  IF v_today_count >= v_cfg.daily_spin_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

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

  RETURN v_spin;
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_place_roulette_spin(uuid, text, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_place_roulette_spin(uuid, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.arcade_roulette_draw(text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_roulette_draw(text, text, integer) TO service_role;