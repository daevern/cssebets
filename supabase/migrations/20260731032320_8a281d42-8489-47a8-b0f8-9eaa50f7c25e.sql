-- =========================================================
-- Arcade — core schema
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE public.arcade_risk_mode AS ENUM ('low','medium','high'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.arcade_outcome AS ENUM ('WIN','LOSS','VOID','REVERSED','PENDING','ERROR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.arcade_score_band AS ENUM ('ZERO','LOW','STANDARD','HIGH','RARE','JACKPOT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.arcade_drop_txn_type AS ENUM ('daily_grant','bonus_grant','consume','refund','expiry','admin_grant','admin_revoke'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.arcade_profile_status AS ENUM ('draft','active','retired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- score profiles ----------
CREATE TABLE public.arcade_score_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rows INT NOT NULL CHECK (rows IN (8,10,12,14,16)),
  risk_mode public.arcade_risk_mode NOT NULL,
  version INT NOT NULL,
  status public.arcade_profile_status NOT NULL DEFAULT 'draft',
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rows, risk_mode, version)
);
CREATE UNIQUE INDEX arcade_score_profiles_active_uniq
  ON public.arcade_score_profiles (rows, risk_mode) WHERE status = 'active';
GRANT SELECT ON public.arcade_score_profiles TO authenticated;
GRANT ALL ON public.arcade_score_profiles TO service_role;
ALTER TABLE public.arcade_score_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read active/retired profiles" ON public.arcade_score_profiles
  FOR SELECT TO authenticated USING (status IN ('active','retired') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage profiles" ON public.arcade_score_profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_arcade_score_profiles_updated
  BEFORE UPDATE ON public.arcade_score_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.arcade_score_profile_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.arcade_score_profiles(id) ON DELETE CASCADE,
  slot_index INT NOT NULL CHECK (slot_index >= 0),
  score INT NOT NULL CHECK (score >= 0),
  multiplier numeric(10,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, slot_index)
);
CREATE INDEX arcade_score_slots_profile_idx ON public.arcade_score_profile_slots(profile_id);
GRANT SELECT ON public.arcade_score_profile_slots TO authenticated;
GRANT ALL ON public.arcade_score_profile_slots TO service_role;
ALTER TABLE public.arcade_score_profile_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read slots" ON public.arcade_score_profile_slots
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.arcade_score_profiles p WHERE p.id = profile_id AND (p.status IN ('active','retired') OR public.has_role(auth.uid(),'admin')))
  );
CREATE POLICY "admins manage slots" ON public.arcade_score_profile_slots
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ---------- randomness seeds ----------
CREATE TABLE public.arcade_randomness_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_seed TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revealed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revealed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX arcade_seeds_one_active_per_user
  ON public.arcade_randomness_seeds(user_id) WHERE status = 'active';
GRANT SELECT ON public.arcade_randomness_seeds TO authenticated;
GRANT ALL ON public.arcade_randomness_seeds TO service_role;
ALTER TABLE public.arcade_randomness_seeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own revealed seeds" ON public.arcade_randomness_seeds
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND status = 'revealed');
CREATE POLICY "admins read seeds" ON public.arcade_randomness_seeds
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
REVOKE SELECT (server_seed) ON public.arcade_randomness_seeds FROM authenticated;

-- ---------- games ----------
CREATE TABLE public.arcade_plinko_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rows INT NOT NULL,
  risk_mode public.arcade_risk_mode NOT NULL,
  profile_id UUID NOT NULL REFERENCES public.arcade_score_profiles(id),
  seed_id UUID NOT NULL REFERENCES public.arcade_randomness_seeds(id),
  nonce INT NOT NULL,
  path SMALLINT[] NOT NULL,
  landing_slot INT NOT NULL,
  score INT NOT NULL,
  outcome public.arcade_outcome NOT NULL,
  score_band public.arcade_score_band NOT NULL,
  drop_type TEXT NOT NULL DEFAULT 'daily',
  idempotency_key TEXT NOT NULL,
  verification_id TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  stake_per_ball numeric(10,2) NOT NULL DEFAULT 0,
  multiplier numeric(10,4) NOT NULL DEFAULT 0,
  payout numeric(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX arcade_games_user_created_idx ON public.arcade_plinko_games(user_id, created_at DESC);
CREATE INDEX arcade_games_created_idx ON public.arcade_plinko_games(created_at DESC);
CREATE INDEX arcade_games_created_score_idx ON public.arcade_plinko_games (created_at, score DESC);
CREATE INDEX arcade_games_outcome_idx ON public.arcade_plinko_games(outcome);
GRANT SELECT ON public.arcade_plinko_games TO authenticated;
GRANT ALL ON public.arcade_plinko_games TO service_role;
ALTER TABLE public.arcade_plinko_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own games" ON public.arcade_plinko_games
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all games" ON public.arcade_plinko_games
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ---------- drop balances + ledgers ----------
CREATE TABLE public.arcade_drop_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_available INT NOT NULL DEFAULT 0,
  daily_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bonus_available INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_drop_balances TO authenticated;
GRANT ALL ON public.arcade_drop_balances TO service_role;
ALTER TABLE public.arcade_drop_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own balance" ON public.arcade_drop_balances
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all balances" ON public.arcade_drop_balances
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_arcade_drop_balances_updated
  BEFORE UPDATE ON public.arcade_drop_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.arcade_drop_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.arcade_drop_txn_type NOT NULL,
  quantity INT NOT NULL,
  daily_before INT NOT NULL,
  daily_after INT NOT NULL,
  bonus_before INT NOT NULL,
  bonus_after INT NOT NULL,
  source TEXT,
  related_game_id UUID REFERENCES public.arcade_plinko_games(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES auth.users(id),
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX arcade_drop_txn_user_idx ON public.arcade_drop_transactions(user_id, created_at DESC);
GRANT SELECT ON public.arcade_drop_transactions TO authenticated;
GRANT ALL ON public.arcade_drop_transactions TO service_role;
ALTER TABLE public.arcade_drop_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own drop txns" ON public.arcade_drop_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all drop txns" ON public.arcade_drop_transactions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.arcade_score_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id UUID REFERENCES public.arcade_plinko_games(id) ON DELETE SET NULL,
  delta INT NOT NULL,
  balance_after BIGINT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX arcade_score_txn_user_idx ON public.arcade_score_transactions(user_id, created_at DESC);
GRANT SELECT ON public.arcade_score_transactions TO authenticated;
GRANT ALL ON public.arcade_score_transactions TO service_role;
ALTER TABLE public.arcade_score_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own score txns" ON public.arcade_score_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all score txns" ON public.arcade_score_transactions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ---------- seed score profiles ----------
DO $seed$
DECLARE
  r_rows INT; r_risk public.arcade_risk_mode; v_pid UUID;
  k INT; d NUMERIC; max_d NUMERIC; sc INT;
BEGIN
  FOREACH r_rows IN ARRAY ARRAY[8,10,12,14,16] LOOP
    FOR r_risk IN SELECT unnest(ARRAY['low','medium','high']::public.arcade_risk_mode[]) LOOP
      INSERT INTO public.arcade_score_profiles(rows, risk_mode, version, status, effective_from, change_reason)
      VALUES (r_rows, r_risk, 1, 'active', now(), 'initial seed')
      RETURNING id INTO v_pid;
      max_d := r_rows::NUMERIC / 2.0;
      FOR k IN 0..r_rows LOOP
        d := abs(k - max_d);
        IF r_risk = 'low' THEN sc := round(100 + 100 * (d / max_d));
        ELSIF r_risk = 'medium' THEN sc := round(30 + 470 * power(d / max_d, 2));
        ELSE sc := round(1000 * power(d / max_d, 4));
        END IF;
        INSERT INTO public.arcade_score_profile_slots(profile_id, slot_index, score)
        VALUES (v_pid, k, sc);
      END LOOP;
    END LOOP;
  END LOOP;
END $seed$;

WITH mults(rows_n, risk_n, arr) AS (
  VALUES
    (8,'low',    ARRAY[5.6,2.1,1.1,1.0,0.5,1.0,1.1,2.1,5.6]::numeric[]),
    (8,'medium', ARRAY[13,3,1.3,0.7,0.4,0.7,1.3,3,13]::numeric[]),
    (8,'high',   ARRAY[29,4,1.5,0.3,0.2,0.3,1.5,4,29]::numeric[]),
    (10,'low',    ARRAY[8.9,3,1.4,1.1,1.0,0.5,1.0,1.1,1.4,3,8.9]::numeric[]),
    (10,'medium', ARRAY[22,5,2,1.4,0.6,0.4,0.6,1.4,2,5,22]::numeric[]),
    (10,'high',   ARRAY[76,10,3,0.9,0.3,0.2,0.3,0.9,3,10,76]::numeric[]),
    (12,'low',    ARRAY[10,3,1.6,1.4,1.1,1.0,0.5,1.0,1.1,1.4,1.6,3,10]::numeric[]),
    (12,'medium', ARRAY[33,11,4,2,1.1,0.6,0.3,0.6,1.1,2,4,11,33]::numeric[]),
    (12,'high',   ARRAY[170,24,8.1,2,0.7,0.2,0.2,0.2,0.7,2,8.1,24,170]::numeric[]),
    (14,'low',    ARRAY[7.1,4,1.9,1.4,1.3,1.1,1.0,0.5,1.0,1.1,1.3,1.4,1.9,4,7.1]::numeric[]),
    (14,'medium', ARRAY[58,15,7,4,1.9,1,0.5,0.2,0.5,1,1.9,4,7,15,58]::numeric[]),
    (14,'high',   ARRAY[420,56,18,5,1.9,0.3,0.2,0.2,0.2,0.3,1.9,5,18,56,420]::numeric[]),
    (16,'low',    ARRAY[16,9,2,1.4,1.4,1.2,1.1,1.0,0.5,1.0,1.1,1.2,1.4,1.4,2,9,16]::numeric[]),
    (16,'medium', ARRAY[110,41,10,5,3,1.5,1,0.5,0.3,0.5,1,1.5,3,5,10,41,110]::numeric[]),
    (16,'high',   ARRAY[1000,130,26,9,4,2,0.2,0.2,0.2,0.2,0.2,2,4,9,26,130,1000]::numeric[])
)
UPDATE public.arcade_score_profile_slots s
SET multiplier = m.arr[s.slot_index + 1]
FROM public.arcade_score_profiles p, mults m
WHERE s.profile_id = p.id
  AND p.rows = m.rows_n
  AND p.risk_mode::text = m.risk_n
  AND s.slot_index + 1 <= array_length(m.arr, 1);

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.arcade_score_band_for(p_score INT)
RETURNS public.arcade_score_band LANGUAGE sql IMMUTABLE AS $$
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
) RETURNS SMALLINT[] LANGUAGE plpgsql IMMUTABLE AS $$
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
-- Challenges / achievements
-- =========================================================
CREATE TABLE public.arcade_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('daily','weekly','all')),
  metric TEXT NOT NULL CHECK (metric IN ('drops_count','total_score','high_band_hits','jackpot_hits')),
  target_value INTEGER NOT NULL CHECK (target_value > 0),
  reward_bonus_drops INTEGER NOT NULL DEFAULT 0 CHECK (reward_bonus_drops >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_challenges TO authenticated;
GRANT ALL ON public.arcade_challenges TO service_role;
ALTER TABLE public.arcade_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade_challenges_read_active" ON public.arcade_challenges FOR SELECT TO authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "arcade_challenges_admin_all" ON public.arcade_challenges FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.arcade_challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.arcade_challenges(id) ON DELETE CASCADE,
  period_bucket TEXT NOT NULL,
  progress BIGINT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  reward_granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id, period_bucket)
);
GRANT SELECT ON public.arcade_challenge_progress TO authenticated;
GRANT ALL ON public.arcade_challenge_progress TO service_role;
ALTER TABLE public.arcade_challenge_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade_ch_progress_self" ON public.arcade_challenge_progress FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX arcade_ch_progress_user_idx ON public.arcade_challenge_progress (user_id, challenge_id);

CREATE TABLE public.arcade_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','platinum')),
  metric TEXT NOT NULL CHECK (metric IN ('drops_count','total_score','high_band_hits','jackpot_hits')),
  target_value BIGINT NOT NULL CHECK (target_value > 0),
  reward_bonus_drops INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_achievements TO authenticated;
GRANT ALL ON public.arcade_achievements TO service_role;
ALTER TABLE public.arcade_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade_ach_read" ON public.arcade_achievements FOR SELECT TO authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "arcade_ach_admin" ON public.arcade_achievements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.arcade_achievement_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.arcade_achievements(id) ON DELETE CASCADE,
  progress BIGINT NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ,
  reward_granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
GRANT SELECT ON public.arcade_achievement_unlocks TO authenticated;
GRANT ALL ON public.arcade_achievement_unlocks TO service_role;
ALTER TABLE public.arcade_achievement_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade_ach_unlock_self" ON public.arcade_achievement_unlocks FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.arcade_period_bucket(p_period TEXT, p_ts TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_period
    WHEN 'daily' THEN to_char(p_ts, 'YYYY-MM-DD')
    WHEN 'weekly' THEN to_char(p_ts, 'IYYY-"W"IW')
    ELSE 'all'
  END
$$;

-- =========================================================
-- Cosmetics + events
-- =========================================================
CREATE TYPE public.arcade_cosmetic_type AS ENUM ('ball','board');
CREATE TYPE public.arcade_cosmetic_rarity AS ENUM ('common','rare','epic','legendary');
CREATE TYPE public.arcade_cosmetic_unlock AS ENUM ('free','achievement','admin');

CREATE TABLE public.arcade_cosmetics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  cosmetic_type public.arcade_cosmetic_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rarity public.arcade_cosmetic_rarity NOT NULL DEFAULT 'common',
  unlock_type public.arcade_cosmetic_unlock NOT NULL DEFAULT 'free',
  achievement_code TEXT,
  preview_color TEXT,
  preview_accent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_cosmetics TO authenticated;
GRANT ALL ON public.arcade_cosmetics TO service_role;
ALTER TABLE public.arcade_cosmetics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade_cosmetics_read_all" ON public.arcade_cosmetics
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "arcade_cosmetics_admin_all" ON public.arcade_cosmetics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.arcade_user_cosmetics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES public.arcade_cosmetics(id) ON DELETE CASCADE,
  cosmetic_type public.arcade_cosmetic_type NOT NULL,
  equipped BOOLEAN NOT NULL DEFAULT false,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, cosmetic_id)
);
CREATE UNIQUE INDEX arcade_user_cosmetics_one_equipped
  ON public.arcade_user_cosmetics(user_id, cosmetic_type) WHERE equipped = true;
CREATE INDEX arcade_user_cosmetics_user_idx ON public.arcade_user_cosmetics(user_id);
GRANT SELECT, INSERT, UPDATE ON public.arcade_user_cosmetics TO authenticated;
GRANT ALL ON public.arcade_user_cosmetics TO service_role;
ALTER TABLE public.arcade_user_cosmetics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade_user_cosmetics_owner_read" ON public.arcade_user_cosmetics
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "arcade_user_cosmetics_owner_update" ON public.arcade_user_cosmetics
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "arcade_user_cosmetics_admin_all" ON public.arcade_user_cosmetics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.arcade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  bonus_drops_per_day INT NOT NULL DEFAULT 0 CHECK (bonus_drops_per_day >= 0 AND bonus_drops_per_day <= 100),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
GRANT SELECT ON public.arcade_events TO authenticated;
GRANT ALL ON public.arcade_events TO service_role;
ALTER TABLE public.arcade_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arcade_events_read_all" ON public.arcade_events
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "arcade_events_admin_all" ON public.arcade_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER arcade_cosmetics_touch BEFORE UPDATE ON public.arcade_cosmetics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER arcade_events_touch BEFORE UPDATE ON public.arcade_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Daily allocation (event-aware)
-- =========================================================
CREATE OR REPLACE FUNCTION public.arcade_ensure_daily(p_user UUID, p_daily_alloc INT)
RETURNS public.arcade_drop_balances
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.arcade_drop_balances;
  event_bonus INT := 0;
  effective_alloc INT;
BEGIN
  SELECT COALESCE(SUM(bonus_drops_per_day),0) INTO event_bonus
    FROM public.arcade_events
    WHERE is_active = true AND now() BETWEEN starts_at AND ends_at;
  effective_alloc := p_daily_alloc + event_bonus;

  INSERT INTO public.arcade_drop_balances(user_id, daily_available, daily_reset_date)
    VALUES (p_user, effective_alloc, CURRENT_DATE)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO b FROM public.arcade_drop_balances WHERE user_id = p_user FOR UPDATE;
  IF b.daily_reset_date < CURRENT_DATE THEN
    UPDATE public.arcade_drop_balances
      SET daily_available = effective_alloc, daily_reset_date = CURRENT_DATE
      WHERE user_id = p_user
      RETURNING * INTO b;
    INSERT INTO public.arcade_drop_transactions(
      user_id, type, quantity, daily_before, daily_after, bonus_before, bonus_after, source, reason
    ) VALUES (
      p_user, 'daily_grant', effective_alloc, 0, effective_alloc, b.bonus_available, b.bonus_available,
      'daily_reset',
      CASE WHEN event_bonus > 0 THEN 'Daily drops reset (+' || event_bonus || ' event bonus)'
           ELSE 'Daily drops reset' END
    );
  END IF;
  RETURN b;
END $$;

-- =========================================================
-- Stake-based Plinko drop
-- =========================================================
CREATE OR REPLACE FUNCTION public.arcade_place_plinko_drop(
  p_user uuid,
  p_rows integer,
  p_risk public.arcade_risk_mode,
  p_idempotency_key text,
  p_client_seed text,
  p_stake numeric
) RETURNS public.arcade_plinko_games
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  RETURN v_game;
END $function$;

REVOKE ALL ON FUNCTION public.arcade_place_plinko_drop(uuid, integer, public.arcade_risk_mode, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_place_plinko_drop(uuid, integer, public.arcade_risk_mode, text, text, numeric) TO service_role;

-- =========================================================
-- Progression trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.arcade_progress_on_drop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delta BIGINT;
  v_ch RECORD;
  v_ach RECORD;
  v_bucket TEXT;
  v_row public.arcade_challenge_progress;
  v_ach_row public.arcade_achievement_unlocks;
  v_reward INT;
  v_balance public.arcade_drop_balances;
  v_daily_before INT;
  v_bonus_before INT;
  v_bonus_after INT;
BEGIN
  FOR v_ch IN SELECT * FROM public.arcade_challenges WHERE is_active = true LOOP
    v_delta := CASE v_ch.metric
      WHEN 'drops_count' THEN 1
      WHEN 'total_score' THEN NEW.score::BIGINT
      WHEN 'high_band_hits' THEN CASE WHEN NEW.score_band IN ('HIGH','RARE','JACKPOT') THEN 1 ELSE 0 END
      WHEN 'jackpot_hits' THEN CASE WHEN NEW.score_band = 'JACKPOT' THEN 1 ELSE 0 END
      ELSE 0
    END;
    IF v_delta <= 0 THEN CONTINUE; END IF;
    v_bucket := public.arcade_period_bucket(v_ch.period, NEW.created_at);

    INSERT INTO public.arcade_challenge_progress (user_id, challenge_id, period_bucket, progress)
      VALUES (NEW.user_id, v_ch.id, v_bucket, v_delta)
    ON CONFLICT (user_id, challenge_id, period_bucket)
    DO UPDATE SET progress = public.arcade_challenge_progress.progress + EXCLUDED.progress,
                  updated_at = now()
    RETURNING * INTO v_row;

    IF v_row.completed_at IS NULL AND v_row.progress >= v_ch.target_value THEN
      UPDATE public.arcade_challenge_progress
        SET completed_at = now(), reward_granted = (v_ch.reward_bonus_drops = 0)
        WHERE id = v_row.id;
      v_reward := v_ch.reward_bonus_drops;
      IF v_reward > 0 THEN
        INSERT INTO public.arcade_drop_balances (user_id, daily_available, bonus_available, daily_reset_date)
          VALUES (NEW.user_id, 0, 0, CURRENT_DATE)
        ON CONFLICT (user_id) DO NOTHING;
        SELECT * INTO v_balance FROM public.arcade_drop_balances WHERE user_id = NEW.user_id FOR UPDATE;
        v_daily_before := COALESCE(v_balance.daily_available, 0);
        v_bonus_before := COALESCE(v_balance.bonus_available, 0);
        v_bonus_after := v_bonus_before + v_reward;
        UPDATE public.arcade_drop_balances
          SET bonus_available = v_bonus_after, updated_at = now()
          WHERE user_id = NEW.user_id;
        INSERT INTO public.arcade_drop_transactions (
          user_id, type, quantity, daily_before, daily_after,
          bonus_before, bonus_after, source, related_game_id, reason
        ) VALUES (
          NEW.user_id, 'bonus_grant', v_reward, v_daily_before, v_daily_before,
          v_bonus_before, v_bonus_after, 'challenge', NEW.id, 'challenge_reward'
        );
        UPDATE public.arcade_challenge_progress SET reward_granted = true WHERE id = v_row.id;
      END IF;
    END IF;
  END LOOP;

  FOR v_ach IN SELECT * FROM public.arcade_achievements WHERE is_active = true LOOP
    v_delta := CASE v_ach.metric
      WHEN 'drops_count' THEN 1
      WHEN 'total_score' THEN NEW.score::BIGINT
      WHEN 'high_band_hits' THEN CASE WHEN NEW.score_band IN ('HIGH','RARE','JACKPOT') THEN 1 ELSE 0 END
      WHEN 'jackpot_hits' THEN CASE WHEN NEW.score_band = 'JACKPOT' THEN 1 ELSE 0 END
      ELSE 0
    END;
    IF v_delta <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.arcade_achievement_unlocks (user_id, achievement_id, progress)
      VALUES (NEW.user_id, v_ach.id, v_delta)
    ON CONFLICT (user_id, achievement_id)
    DO UPDATE SET progress = public.arcade_achievement_unlocks.progress + EXCLUDED.progress,
                  updated_at = now()
    RETURNING * INTO v_ach_row;

    IF v_ach_row.unlocked_at IS NULL AND v_ach_row.progress >= v_ach.target_value THEN
      UPDATE public.arcade_achievement_unlocks
        SET unlocked_at = now(), reward_granted = (v_ach.reward_bonus_drops = 0)
        WHERE id = v_ach_row.id;
      v_reward := v_ach.reward_bonus_drops;
      IF v_reward > 0 THEN
        INSERT INTO public.arcade_drop_balances (user_id, daily_available, bonus_available, daily_reset_date)
          VALUES (NEW.user_id, 0, 0, CURRENT_DATE)
        ON CONFLICT (user_id) DO NOTHING;
        SELECT * INTO v_balance FROM public.arcade_drop_balances WHERE user_id = NEW.user_id FOR UPDATE;
        v_daily_before := COALESCE(v_balance.daily_available, 0);
        v_bonus_before := COALESCE(v_balance.bonus_available, 0);
        v_bonus_after := v_bonus_before + v_reward;
        UPDATE public.arcade_drop_balances
          SET bonus_available = v_bonus_after, updated_at = now()
          WHERE user_id = NEW.user_id;
        INSERT INTO public.arcade_drop_transactions (
          user_id, type, quantity, daily_before, daily_after,
          bonus_before, bonus_after, source, related_game_id, reason
        ) VALUES (
          NEW.user_id, 'bonus_grant', v_reward, v_daily_before, v_daily_before,
          v_bonus_before, v_bonus_after, 'achievement', NEW.id, 'achievement_reward'
        );
        UPDATE public.arcade_achievement_unlocks SET reward_granted = true WHERE id = v_ach_row.id;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_progress_on_drop() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arcade_progress_on_drop() TO authenticated, service_role;

CREATE TRIGGER arcade_progress_on_drop_trg
AFTER INSERT ON public.arcade_plinko_games
FOR EACH ROW EXECUTE FUNCTION public.arcade_progress_on_drop();

-- =========================================================
-- Seeds
-- =========================================================
INSERT INTO public.arcade_challenges (code, name, description, period, metric, target_value, reward_bonus_drops, sort_order) VALUES
  ('daily_five_drops', 'Warm-up', 'Drop the ball 5 times today.', 'daily', 'drops_count', 5, 1, 10),
  ('daily_score_500', 'Score Chaser', 'Rack up 500 total score today.', 'daily', 'total_score', 500, 2, 20),
  ('daily_high_band', 'Sharpshooter', 'Land 2 high-tier results today.', 'daily', 'high_band_hits', 2, 3, 30),
  ('weekly_50_drops', 'Regular', 'Drop the ball 50 times this week.', 'weekly', 'drops_count', 50, 5, 40)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.arcade_achievements (code, name, description, tier, metric, target_value, reward_bonus_drops, sort_order) VALUES
  ('first_drop', 'First Drop', 'Complete your very first drop.', 'bronze', 'drops_count', 1, 0, 10),
  ('century', 'Century Club', 'Reach 100 lifetime drops.', 'silver', 'drops_count', 100, 5, 20),
  ('marathon', 'Marathon', 'Reach 1,000 lifetime drops.', 'gold', 'drops_count', 1000, 20, 30),
  ('score_10k', 'Score 10K', 'Accumulate 10,000 lifetime score.', 'silver', 'total_score', 10000, 5, 40),
  ('jackpot_hunter', 'Jackpot Hunter', 'Land your first jackpot slot.', 'platinum', 'jackpot_hits', 1, 10, 50)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.arcade_cosmetics (code, cosmetic_type, name, description, rarity, unlock_type, preview_color, preview_accent) VALUES
  ('ball_default','ball','Classic Ball','The original steel drop','common','free','#e5e7eb','#94a3b8'),
  ('ball_neon','ball','Neon Pulse','Glowing arcade orb','rare','free','#22d3ee','#a855f7'),
  ('ball_gold','ball','Gold Fortune','Reserved for centurions','epic','achievement','#facc15','#f97316'),
  ('board_default','board','Midnight Grid','The default arcade board','common','free','#0f172a','#334155'),
  ('board_synthwave','board','Synthwave','Retro sunset pegs','rare','free','#0b0b2a','#ff2bd6'),
  ('board_aurora','board','Aurora','Deep space with green shimmer','epic','free','#020617','#10b981')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.arcade_cosmetics (code, cosmetic_type, name, description, rarity, unlock_type, achievement_code, preview_color, preview_accent) VALUES
  ('ball_jackpot','ball','Jackpot Halo','Awarded for landing a jackpot','legendary','achievement','JACKPOT','#fde047','#dc2626')
ON CONFLICT (code) DO NOTHING;