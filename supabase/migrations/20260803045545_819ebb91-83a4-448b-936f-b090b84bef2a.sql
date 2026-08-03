
-- ============================================================
-- Rock–Paper–Scissors arcade game
-- ============================================================

CREATE TABLE public.arcade_rps_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  min_stake numeric(14,2) NOT NULL DEFAULT 5,
  max_stake numeric(14,2) NOT NULL DEFAULT 500,
  chip_values numeric(14,2)[] NOT NULL DEFAULT ARRAY[5,10,25,50,100]::numeric(14,2)[],
  win_multiplier numeric(10,4) NOT NULL DEFAULT 1.9000,
  draw_multiplier numeric(10,4) NOT NULL DEFAULT 1.0000,
  round_ttl_seconds int NOT NULL DEFAULT 120,
  daily_round_limit int NOT NULL DEFAULT 500,
  cooldown_seconds int NOT NULL DEFAULT 0,
  maintenance_mode boolean NOT NULL DEFAULT false,
  announcement text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_rps_cfg_status_chk CHECK (status IN ('draft','active','retired')),
  CONSTRAINT arcade_rps_cfg_stake_chk CHECK (min_stake > 0 AND max_stake >= min_stake)
);
CREATE UNIQUE INDEX arcade_rps_cfg_one_active ON public.arcade_rps_configurations (status) WHERE status = 'active';

GRANT SELECT ON public.arcade_rps_configurations TO authenticated;
GRANT ALL ON public.arcade_rps_configurations TO service_role;
ALTER TABLE public.arcade_rps_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rps config readable by signed-in users"
  ON public.arcade_rps_configurations FOR SELECT TO authenticated USING (true);

CREATE TRIGGER arcade_rps_cfg_touch BEFORE UPDATE ON public.arcade_rps_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.arcade_rps_configurations (status, maintenance_mode, announcement)
VALUES ('active', true, 'Rock–Paper–Scissors is warming up.');

-- ------------------------------------------------------------

CREATE TABLE public.arcade_rps_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  config_id uuid NOT NULL REFERENCES public.arcade_rps_configurations(id),
  config_version int NOT NULL,
  status text NOT NULL DEFAULT 'PREPARED',

  -- commitment (written at prepare, strictly before any player choice)
  seed_id uuid REFERENCES public.arcade_randomness_seeds(id),
  server_seed text NOT NULL,
  server_seed_hash text NOT NULL,
  nonce int NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  server_seed_revealed_at timestamptz,

  -- settlement
  player_choice text,
  server_choice text,
  client_seed text,
  hmac_input text,
  random_hex text,
  outcome text,
  stake numeric(14,2),
  multiplier numeric(10,4),
  gross_return numeric(14,2),
  user_net numeric(14,2),
  house_net numeric(14,2),
  idempotency_key text,
  verification_id text NOT NULL DEFAULT encode(extensions.gen_random_bytes(8),'hex'),
  settled_at timestamptz,
  processing_ms int,
  client_reveal_ms int,
  result_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT arcade_rps_status_chk CHECK (status IN ('PREPARED','SETTLED','EXPIRED','VOID','REVERSED')),
  CONSTRAINT arcade_rps_player_choice_chk CHECK (player_choice IS NULL OR player_choice IN ('ROCK','PAPER','SCISSORS')),
  CONSTRAINT arcade_rps_server_choice_chk CHECK (server_choice IS NULL OR server_choice IN ('ROCK','PAPER','SCISSORS')),
  CONSTRAINT arcade_rps_outcome_chk CHECK (outcome IS NULL OR outcome IN ('WIN','LOSS','DRAW'))
);

CREATE UNIQUE INDEX arcade_rps_idem_uniq ON public.arcade_rps_rounds (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX arcade_rps_seed_nonce_uniq ON public.arcade_rps_rounds (seed_id, nonce)
  WHERE seed_id IS NOT NULL;
CREATE UNIQUE INDEX arcade_rps_one_prepared ON public.arcade_rps_rounds (user_id) WHERE status = 'PREPARED';
CREATE INDEX arcade_rps_user_created_idx ON public.arcade_rps_rounds (user_id, created_at DESC);

GRANT SELECT ON public.arcade_rps_rounds TO authenticated;
GRANT ALL ON public.arcade_rps_rounds TO service_role;
ALTER TABLE public.arcade_rps_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rps rounds readable by owner"
  ON public.arcade_rps_rounds FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER arcade_rps_rounds_touch BEFORE UPDATE ON public.arcade_rps_rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Accounting registration
-- ============================================================

INSERT INTO public.accounting_migration_flags (product, journal_enabled, dual_write, liability_enforced, notes)
VALUES ('rps', true, true, true, 'Rock-Paper-Scissors: journal-native from launch');

INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, product, environment)
SELECT c.code, c.atype::public.acct_account_type, c.nbal::public.acct_normal_balance, 'rps', e.env::public.acct_environment
  FROM (VALUES
    ('RPS_STAKE_REVENUE','REVENUE','CREDIT'),
    ('RPS_PAYOUT_EXPENSE','EXPENSE','DEBIT'),
    ('RPS_PL_TO_RESERVE','EQUITY','DEBIT')
  ) AS c(code, atype, nbal)
  CROSS JOIN (VALUES ('PRODUCTION'),('SIMULATION')) AS e(env);

-- allow the shared arcade journal poster to accept 'rps'
CREATE OR REPLACE FUNCTION public.accounting_post_arcade_settlement(p_product text, p_ref_type text, p_ref_id uuid, p_user uuid, p_stake numeric, p_payout numeric, p_effective timestamp with time zone, p_meta jsonb DEFAULT '{}'::jsonb, p_wallet_category text DEFAULT NULL::text, p_wallet_idem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_env public.acct_environment;
  v_wallet uuid; v_stake_acct uuid; v_payout_acct uuid; v_reserve_acct uuid; v_bankroll_acct uuid;
  v_stake numeric(18,2); v_payout numeric(18,2);
  v_stake_res jsonb := NULL; v_payout_res jsonb := NULL;
  v_prefix text := upper(p_product);
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may post arcade journals';
  END IF;
  IF p_product NOT IN ('treasure','roulette','blackjack','rps') THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: unsupported product %', p_product;
  END IF;

  SELECT a.id, a.environment INTO v_wallet, v_env
    FROM public.accounting_accounts a
   WHERE a.user_id = p_user AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: no active USER_WALLET account for user %', p_user;
  END IF;

  SELECT id INTO v_stake_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix||'_STAKE_REVENUE' AND environment = v_env AND status='ACTIVE';
  SELECT id INTO v_payout_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix||'_PAYOUT_EXPENSE' AND environment = v_env AND status='ACTIVE';
  SELECT id INTO v_reserve_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix||'_PL_TO_RESERVE' AND environment = v_env AND status='ACTIVE';
  SELECT id INTO v_bankroll_acct FROM public.accounting_accounts
   WHERE account_code = 'HOUSE_BANKROLL' AND environment = v_env AND status='ACTIVE';
  IF v_stake_acct IS NULL OR v_payout_acct IS NULL OR v_reserve_acct IS NULL OR v_bankroll_acct IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: missing % accounts for environment %', v_prefix, v_env;
  END IF;

  v_stake := public.acct_round_stake(coalesce(p_stake,0));
  v_payout := public.acct_round_payout(coalesce(p_payout,0));

  IF v_stake > 0 THEN
    v_stake_res := public.accounting_post_journal(
      'STAKE_PLACED', p_product, p_ref_type, p_ref_id, p_effective, v_env,
      jsonb_build_array(
        jsonb_build_object('account_id', v_wallet, 'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_stake_acct, 'debit', 0, 'credit', v_stake),
        jsonb_build_object('account_id', v_stake_acct, 'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', 0, 'credit', v_stake)
      ),
      p_meta || jsonb_build_object('wallet_category', p_wallet_category, 'wallet_idem', p_wallet_idem),
      p_wallet_category, p_wallet_idem);
  END IF;

  IF v_payout > 0 THEN
    v_payout_res := public.accounting_post_journal(
      'PAYOUT_SETTLED', p_product, p_ref_type, p_ref_id, p_effective, v_env,
      jsonb_build_array(
        jsonb_build_object('account_id', v_payout_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_wallet, 'debit', 0, 'credit', v_payout),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_payout_acct, 'debit', 0, 'credit', v_payout)
      ),
      p_meta || jsonb_build_object('wallet_category', p_wallet_category, 'wallet_idem', p_wallet_idem),
      p_wallet_category, p_wallet_idem);
  END IF;

  PERFORM public.accounting_release_liability(p_ref_type, p_ref_id, 'settled');

  RETURN jsonb_build_object('stake_journal', v_stake_res, 'payout_journal', v_payout_res);
END $function$;

-- include rps in the bankroll reconciliation product scope
CREATE OR REPLACE FUNCTION public.accounting_bankroll_reconciliation(p_environment acct_environment DEFAULT 'PRODUCTION'::acct_environment)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_journal numeric := 0;
  v_payable numeric := 0;
  v_reserved numeric := 0;
  v_legacy numeric := 0;
  v_legacy_at timestamptz;
  v_arcade_pl numeric := 0;
  v_delta numeric := 0;
  v_unexplained numeric := 0;
  v_status text;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT round(coalesce(b.balance,0),2) INTO v_journal
    FROM public.accounting_account_balances b
    JOIN public.accounting_accounts a ON a.id = b.account_id
   WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment;

  SELECT round(coalesce(b.balance,0),2) INTO v_payable
    FROM public.accounting_account_balances b
    JOIN public.accounting_accounts a ON a.id = b.account_id
   WHERE a.account_code = 'PAYOUTS_PAYABLE' AND a.environment = p_environment;

  SELECT round(coalesce(sum(r.reserved_amount),0),2) INTO v_reserved
    FROM public.accounting_liability_reservations r
   WHERE r.environment = p_environment AND r.status = 'ACTIVE' AND r.counts_toward_available;

  SELECT round(coalesce(balance,0),2), updated_at INTO v_legacy, v_legacy_at
    FROM public.platform_bankroll WHERE id = 1;

  SELECT round(coalesce(sum(l.credit - l.debit),0),2) INTO v_arcade_pl
    FROM public.accounting_journals j
    JOIN public.accounting_journal_lines l ON l.journal_id = j.id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.status = 'POSTED' AND j.environment = p_environment
     AND a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
     AND j.product IN ('plinko','roulette','treasure','blackjack','rps');

  v_delta := round(coalesce(v_journal,0) - coalesce(v_legacy,0), 2);
  v_unexplained := round(v_delta - coalesce(v_arcade_pl,0), 2);
  v_status := CASE
                WHEN p_environment <> 'PRODUCTION' THEN 'NOT_APPLICABLE'
                WHEN v_unexplained = 0 THEN 'RECONCILED'
                ELSE 'UNEXPLAINED_DRIFT' END;

  RETURN jsonb_build_object(
    'environment', p_environment,
    'generated_at', now(),
    'authoritative', jsonb_build_object(
      'source', 'accounting_account_balances.HOUSE_BANKROLL',
      'house_bankroll', coalesce(v_journal,0),
      'payouts_payable', coalesce(v_payable,0),
      'active_reserved_liability', coalesce(v_reserved,0),
      'available_reserve', public.accounting_available_reserve(p_environment)),
    'legacy', jsonb_build_object(
      'source', 'platform_bankroll (id=1, sports-only writer)',
      'balance', coalesce(v_legacy,0),
      'updated_at', v_legacy_at),
    'delta_journal_minus_legacy', CASE WHEN p_environment = 'PRODUCTION' THEN v_delta END,
    'journal_backed_arcade_pl', coalesce(v_arcade_pl,0),
    'unexplained_difference', CASE WHEN p_environment = 'PRODUCTION' THEN v_unexplained END,
    'reconciliation_status', v_status,
    'note', 'platform_bankroll is only written by legacy sports settlement; arcade activity '
            'is journal-only. delta_journal_minus_legacy should equal journal_backed_arcade_pl '
            'until sports products are journal-migrated.');
END $function$;

-- terminal-state awareness for reservation integrity checks
CREATE OR REPLACE FUNCTION public.accounting_position_state(p_reference_type text, p_reference_id uuid)
 RETURNS TABLE(product text, status text, outcome text, is_terminal boolean, settled_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'plinko', g.outcome::text,
         CASE g.outcome::text WHEN 'WIN' THEN 'WIN' WHEN 'LOSS' THEN 'LOSS'
                              WHEN 'VOID' THEN 'VOID' WHEN 'REVERSED' THEN 'REVERSED' END,
         g.outcome::text IN ('WIN','LOSS','VOID','REVERSED'),
         g.completed_at
    FROM public.arcade_plinko_games g
   WHERE p_reference_type = 'arcade_plinko_game' AND g.id = p_reference_id
  UNION ALL
  SELECT 'roulette', s.status::text,
         CASE s.status::text WHEN 'WIN' THEN 'WIN' WHEN 'LOSS' THEN 'LOSS' WHEN 'PUSH' THEN 'PUSH'
                             WHEN 'VOID' THEN 'VOID' WHEN 'REVERSED' THEN 'REVERSED' END,
         s.status::text IN ('WIN','LOSS','PUSH','VOID','REVERSED'),
         s.completed_at
    FROM public.arcade_roulette_spins s
   WHERE p_reference_type = 'arcade_roulette_spin' AND s.id = p_reference_id
  UNION ALL
  SELECT 'treasure', t.status::text,
         CASE t.status::text WHEN 'WON' THEN 'WIN' WHEN 'LOST' THEN 'LOSS' WHEN 'PUSH' THEN 'PUSH'
                             WHEN 'VOID' THEN 'VOID' WHEN 'REVERSED' THEN 'REVERSED'
                             WHEN 'EXPIRED' THEN 'CANCELLED' END,
         t.status::text IN ('WON','LOST','PUSH','VOID','REVERSED','EXPIRED'),
         t.settled_at
    FROM public.arcade_treasure_rounds t
   WHERE p_reference_type = 'arcade_treasure_round' AND t.id = p_reference_id
  UNION ALL
  SELECT 'blackjack', h.status::text,
         CASE
           WHEN h.status::text = 'VOID'     THEN 'VOID'
           WHEN h.status::text = 'REVERSED' THEN 'REVERSED'
           WHEN h.status::text = 'EXPIRED'  THEN 'CANCELLED'
           WHEN h.status::text = 'COMPLETED' THEN
             CASE h.result::text
               WHEN 'BLACKJACK' THEN 'WIN' WHEN 'WIN' THEN 'WIN'
               WHEN 'LOSS' THEN 'LOSS' WHEN 'BUST' THEN 'LOSS'
               WHEN 'PUSH' THEN 'PUSH' WHEN 'VOID' THEN 'VOID' WHEN 'REVERSED' THEN 'REVERSED'
               WHEN 'MIXED' THEN CASE WHEN coalesce(h.total_payout,0) > coalesce(h.total_stake,0) THEN 'WIN'
                                      WHEN coalesce(h.total_payout,0) = coalesce(h.total_stake,0) THEN 'PUSH'
                                      ELSE 'LOSS' END
             END
         END,
         h.status::text IN ('COMPLETED','VOID','REVERSED','EXPIRED'),
         h.settled_at
    FROM public.arcade_bj_hands h
   WHERE p_reference_type = 'arcade_bj_hand' AND h.id = p_reference_id
  UNION ALL
  SELECT 'rps', r.status,
         CASE
           WHEN r.status = 'VOID' THEN 'VOID'
           WHEN r.status = 'REVERSED' THEN 'REVERSED'
           WHEN r.status = 'EXPIRED' THEN 'CANCELLED'
           WHEN r.status = 'SETTLED' THEN CASE r.outcome WHEN 'WIN' THEN 'WIN' WHEN 'LOSS' THEN 'LOSS' ELSE 'PUSH' END
         END,
         r.status IN ('SETTLED','VOID','REVERSED','EXPIRED'),
         r.settled_at
    FROM public.arcade_rps_rounds r
   WHERE p_reference_type = 'arcade_rps_round' AND r.id = p_reference_id;
$function$;

-- ============================================================
-- Game routines
-- ============================================================

-- unbiased HMAC -> move mapping
CREATE OR REPLACE FUNCTION public.arcade_rps_draw(p_server_seed text, p_hmac_input text)
 RETURNS TABLE(choice text, random_hex text)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_digest bytea;
  v_hex text;
  v_i int;
  v_b int;
  v_idx int := 0;
BEGIN
  v_digest := extensions.hmac(p_hmac_input, p_server_seed, 'sha256');
  v_hex := encode(v_digest, 'hex');
  -- rejection sampling: 255 is discarded so the remaining 0..254 map evenly onto 3 moves
  FOR v_i IN 0..31 LOOP
    v_b := get_byte(v_digest, v_i);
    IF v_b < 255 THEN
      v_idx := v_b % 3;
      EXIT;
    END IF;
  END LOOP;
  RETURN QUERY SELECT (ARRAY['ROCK','PAPER','SCISSORS'])[v_idx + 1], v_hex;
END $function$;

GRANT EXECUTE ON FUNCTION public.arcade_rps_draw(text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.arcade_rps_draw(text, text) FROM PUBLIC, anon, authenticated;

-- prepare: commit hidden randomness BEFORE the player can choose
CREATE OR REPLACE FUNCTION public.arcade_rps_prepare_round(p_user uuid)
 RETURNS TABLE(round_id uuid, server_seed_hash text, nonce int, expires_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.arcade_rps_configurations;
  v_seed public.arcade_randomness_seeds;
  v_new_seed text;
  v_round_seed text;
  v_today int;
  v_round public.arcade_rps_rounds;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_cfg FROM public.arcade_rps_configurations WHERE status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_CONFIG'; END IF;
  IF v_cfg.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;

  -- retire stale commitments for this user
  UPDATE public.arcade_rps_rounds
     SET status = 'EXPIRED', result_reason = 'ttl'
   WHERE user_id = p_user AND status = 'PREPARED' AND expires_at < now();

  SELECT count(*) INTO v_today FROM public.arcade_rps_rounds
   WHERE user_id = p_user AND status = 'SETTLED' AND created_at >= date_trunc('day', now());
  IF v_today >= v_cfg.daily_round_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  -- reuse an unexpired commitment rather than issuing a second one
  SELECT * INTO v_round FROM public.arcade_rps_rounds
   WHERE user_id = p_user AND status = 'PREPARED' AND expires_at > now()
   ORDER BY prepared_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_round.id, v_round.server_seed_hash, v_round.nonce, v_round.expires_at;
    RETURN;
  END IF;

  SELECT * INTO v_seed FROM public.arcade_randomness_seeds
   WHERE user_id = p_user AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    v_new_seed := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.arcade_randomness_seeds(user_id, server_seed, server_seed_hash, client_seed, nonce, status)
      VALUES (p_user, v_new_seed, encode(extensions.digest(v_new_seed,'sha256'),'hex'), '', 0, 'active')
      RETURNING * INTO v_seed;
  END IF;
  UPDATE public.arcade_randomness_seeds SET nonce = nonce + 1
   WHERE id = v_seed.id RETURNING * INTO v_seed;

  -- per-round secret, generated and hashed before any player input exists
  v_round_seed := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.arcade_rps_rounds(
    user_id, config_id, config_version, status, seed_id, server_seed, server_seed_hash, nonce, expires_at
  ) VALUES (
    p_user, v_cfg.id, v_cfg.version, 'PREPARED', v_seed.id, v_round_seed,
    encode(extensions.digest(v_round_seed,'sha256'),'hex'), v_seed.nonce,
    now() + make_interval(secs => v_cfg.round_ttl_seconds)
  ) RETURNING * INTO v_round;

  RETURN QUERY SELECT v_round.id, v_round.server_seed_hash, v_round.nonce, v_round.expires_at;
END $function$;

-- settle: atomic charge, derive, pay, journal
CREATE OR REPLACE FUNCTION public.arcade_rps_settle(
  p_user uuid,
  p_round_id uuid,
  p_player_choice text,
  p_client_seed text,
  p_stake numeric,
  p_idempotency_key text,
  p_client_reveal_ms int DEFAULT NULL
)
 RETURNS public.arcade_rps_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_round public.arcade_rps_rounds;
  v_cfg public.arcade_rps_configurations;
  v_wallet public.wallets;
  v_new_balance numeric(14,2);
  v_stake numeric(14,2);
  v_choice text;
  v_hex text;
  v_input text;
  v_outcome text;
  v_mult numeric(10,4);
  v_gross numeric(14,2);
  v_max_gross numeric(14,2);
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN
    RAISE EXCEPTION 'INVALID_CLIENT_SEED';
  END IF;
  IF p_player_choice NOT IN ('ROCK','PAPER','SCISSORS') THEN
    RAISE EXCEPTION 'INVALID_CHOICE';
  END IF;

  -- retry short-circuit: identical key returns the already-settled round untouched
  SELECT * INTO v_round FROM public.arcade_rps_rounds
   WHERE user_id = p_user AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_round.id <> p_round_id OR v_round.player_choice <> p_player_choice THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_round;
  END IF;

  SELECT * INTO v_round FROM public.arcade_rps_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.user_id <> p_user THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'PREPARED' THEN RAISE EXCEPTION 'ROUND_ALREADY_USED'; END IF;
  IF v_round.expires_at < now() THEN
    UPDATE public.arcade_rps_rounds SET status = 'EXPIRED', result_reason = 'ttl' WHERE id = v_round.id;
    RAISE EXCEPTION 'ROUND_EXPIRED';
  END IF;

  SELECT * INTO v_cfg FROM public.arcade_rps_configurations WHERE id = v_round.config_id;
  IF v_cfg.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;

  v_stake := round(coalesce(p_stake,0), 2);
  IF v_stake < v_cfg.min_stake THEN RAISE EXCEPTION 'BELOW_MIN_STAKE'; END IF;
  IF v_stake > v_cfg.max_stake THEN RAISE EXCEPTION 'ABOVE_MAX_STAKE'; END IF;

  v_max_gross := round(v_stake * v_cfg.win_multiplier, 2);
  PERFORM public.accounting_arcade_assert_capacity('rps', p_user, v_max_gross, v_stake);

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
    'bet_placement', v_round.id, 'Rock-Paper-Scissors stake', 'arcade_rps',
    jsonb_build_object('idempotency_key', p_idempotency_key, 'round_id', v_round.id)
  );

  PERFORM public.accounting_reserve_liability('rps','rps','arcade_rps_round', v_round.id,
    p_user, v_max_gross, v_stake, v_cfg.version::text,
    jsonb_build_object('player_choice', p_player_choice), true);

  -- derive the server move from the seed committed at prepare time
  v_input := p_client_seed || ':' || v_round.nonce::text || ':' || v_round.id::text;
  SELECT d.choice, d.random_hex INTO v_choice, v_hex
    FROM public.arcade_rps_draw(v_round.server_seed, v_input) d;

  v_outcome := CASE
    WHEN v_choice = p_player_choice THEN 'DRAW'
    WHEN (p_player_choice = 'ROCK' AND v_choice = 'SCISSORS')
      OR (p_player_choice = 'PAPER' AND v_choice = 'ROCK')
      OR (p_player_choice = 'SCISSORS' AND v_choice = 'PAPER') THEN 'WIN'
    ELSE 'LOSS' END;

  v_mult := CASE v_outcome WHEN 'WIN' THEN v_cfg.win_multiplier
                           WHEN 'DRAW' THEN v_cfg.draw_multiplier
                           ELSE 0 END;
  v_gross := round(v_stake * v_mult, 2);

  IF v_gross > 0 THEN
    UPDATE public.wallets SET balance = balance + v_gross, updated_at = now()
     WHERE user_id = p_user RETURNING balance INTO v_new_balance;
    INSERT INTO public.wallet_transactions(
      user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, note, transaction_category, metadata
    ) VALUES (
      p_user, 'credit', v_gross, v_new_balance - v_gross, v_new_balance,
      'bet_settlement', v_round.id, 'Rock-Paper-Scissors return', 'arcade_rps',
      jsonb_build_object('outcome', v_outcome, 'multiplier', v_mult, 'stake', v_stake)
    );
  END IF;

  UPDATE public.arcade_rps_rounds SET
    status = 'SETTLED',
    player_choice = p_player_choice,
    server_choice = v_choice,
    client_seed = p_client_seed,
    hmac_input = v_input,
    random_hex = v_hex,
    outcome = v_outcome,
    stake = v_stake,
    multiplier = v_mult,
    gross_return = v_gross,
    user_net = v_gross - v_stake,
    house_net = v_stake - v_gross,
    idempotency_key = p_idempotency_key,
    settled_at = now(),
    server_seed_revealed_at = now(),
    client_reveal_ms = p_client_reveal_ms,
    processing_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::int)
  WHERE id = v_round.id RETURNING * INTO v_round;

  PERFORM public.accounting_arcade_hook('rps','arcade_rps_round', v_round.id, p_user,
    v_stake, v_gross, v_round.created_at,
    jsonb_build_object('source','arcade_rps','outcome', v_outcome,
                       'player_choice', p_player_choice, 'server_choice', v_choice,
                       'config_version', v_cfg.version::text,
                       'verification_id', v_round.verification_id),
    'arcade_rps', p_idempotency_key);

  RETURN v_round;
END $function$;

CREATE OR REPLACE FUNCTION public.arcade_rps_expire_rounds()
 RETURNS int
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_n int;
BEGIN
  UPDATE public.arcade_rps_rounds
     SET status = 'EXPIRED', result_reason = 'ttl'
   WHERE status = 'PREPARED' AND expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE EXECUTE ON FUNCTION public.arcade_rps_prepare_round(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_rps_settle(uuid, uuid, text, text, numeric, text, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_rps_expire_rounds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_rps_prepare_round(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_rps_settle(uuid, uuid, text, text, numeric, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_rps_expire_rounds() TO service_role;
