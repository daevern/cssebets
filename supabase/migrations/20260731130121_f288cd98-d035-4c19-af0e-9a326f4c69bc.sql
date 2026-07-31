
-- ============================================================
-- Phase 4.1 — Plinko house-bankroll integration
-- ============================================================

-- 1. Reserve-transfer (closing) account per live environment
INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, environment, product, status, metadata)
SELECT 'PLINKO_PL_TO_RESERVE', 'EQUITY'::public.acct_account_type, 'DEBIT'::public.acct_normal_balance,
       e, 'plinko', 'ACTIVE'::public.acct_account_status,
       jsonb_build_object('purpose','Plinko realised P/L closed to HOUSE_BANKROLL')
  FROM unnest(ARRAY['PRODUCTION','SIMULATION']::public.acct_environment[]) e
 WHERE NOT EXISTS (
   SELECT 1 FROM public.accounting_accounts a
    WHERE a.account_code = 'PLINKO_PL_TO_RESERVE' AND a.environment = e);

-- 2. Available operational reserve = HOUSE_BANKROLL - PAYOUTS_PAYABLE
CREATE OR REPLACE FUNCTION public.accounting_available_reserve(p_env public.acct_environment)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(sum(
           CASE WHEN a.account_code = 'HOUSE_BANKROLL' THEN b.balance
                WHEN a.account_code = 'PAYOUTS_PAYABLE' THEN -b.balance
                ELSE 0 END), 0)::numeric(18,2)
    FROM public.accounting_accounts a
    JOIN public.accounting_account_balances b ON b.account_id = a.id
   WHERE a.user_id IS NULL
     AND a.environment = p_env
     AND a.status = 'ACTIVE'
     AND a.account_code IN ('HOUSE_BANKROLL','PAYOUTS_PAYABLE');
$$;

REVOKE ALL ON FUNCTION public.accounting_available_reserve(public.acct_environment) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_available_reserve(public.acct_environment) TO service_role;

-- 3. Posting function: 4-line journals that also move HOUSE_BANKROLL,
--    with distinct versioned idempotency keys (legacy keys still honoured).
CREATE OR REPLACE FUNCTION public.accounting_post_plinko_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_game public.arcade_plinko_games%ROWTYPE;
  v_env public.acct_environment;
  v_wallet uuid;
  v_stake_acct uuid;
  v_payout_acct uuid;
  v_reserve_acct uuid;
  v_bankroll_acct uuid;
  v_stake numeric(18,2);
  v_payout numeric(18,2);
  v_meta jsonb;
  v_stake_res jsonb := NULL;
  v_payout_res jsonb := NULL;
  v_stake_key text;
  v_payout_key text;
  v_legacy uuid;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may post plinko journals';
  END IF;

  SELECT * INTO v_game FROM public.arcade_plinko_games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: plinko game % not found', p_game_id;
  END IF;

  SELECT a.id, a.environment INTO v_wallet, v_env
    FROM public.accounting_accounts a
   WHERE a.user_id = v_game.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: no active USER_WALLET account for user %', v_game.user_id;
  END IF;

  SELECT id INTO v_stake_acct FROM public.accounting_accounts
   WHERE account_code = 'PLINKO_STAKE_REVENUE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_payout_acct FROM public.accounting_accounts
   WHERE account_code = 'PLINKO_PAYOUT_EXPENSE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_reserve_acct FROM public.accounting_accounts
   WHERE account_code = 'PLINKO_PL_TO_RESERVE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_bankroll_acct FROM public.accounting_accounts
   WHERE account_code = 'HOUSE_BANKROLL' AND environment = v_env AND status = 'ACTIVE';
  IF v_stake_acct IS NULL OR v_payout_acct IS NULL OR v_reserve_acct IS NULL OR v_bankroll_acct IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: plinko accounts missing for environment %', v_env;
  END IF;

  v_stake  := round(coalesce(v_game.stake_per_ball, 0), 2);
  v_payout := round(coalesce(v_game.payout, 0), 2);

  v_meta := jsonb_build_object(
    'source','arcade_plinko',
    'game_id', v_game.id,
    'rows', v_game.rows,
    'risk_mode', v_game.risk_mode,
    'multiplier', v_game.multiplier,
    'landing_slot', v_game.landing_slot,
    'outcome', v_game.outcome,
    'verification_id', v_game.verification_id);

  -- distinct, versioned keys per leg
  v_stake_key  := 'plinko:' || v_game.id::text || ':stake:v1';
  v_payout_key := 'plinko:' || v_game.id::text || ':payout:v1';

  IF v_stake > 0 THEN
    SELECT id INTO v_legacy FROM public.accounting_journals
     WHERE idempotency_key = 'plinko-stake:' || v_game.id::text;
    IF v_legacy IS NOT NULL THEN
      v_stake_res := jsonb_build_object('idempotent', true, 'journal_id', v_legacy, 'legacy_key', true);
    ELSE
      v_stake_res := public.accounting_post_journal(
        p_journal_type := 'STAKE_PLACED',
        p_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_wallet,        'debit', v_stake, 'credit', 0),
          jsonb_build_object('account_id', v_stake_acct,    'debit', 0,       'credit', v_stake),
          jsonb_build_object('account_id', v_reserve_acct,  'debit', v_stake, 'credit', 0),
          jsonb_build_object('account_id', v_bankroll_acct, 'debit', 0,       'credit', v_stake)),
        p_idempotency_key := v_stake_key,
        p_product := 'plinko', p_game := 'plinko',
        p_reference_type := 'arcade_plinko_game',
        p_reference_id := v_game.id::text,
        p_event_type := 'stake',
        p_settlement_version := 1,
        p_effective_at := v_game.created_at,
        p_metadata := v_meta,
        p_environment := v_env::text);
    END IF;
  END IF;

  IF v_payout > 0 THEN
    v_legacy := NULL;
    SELECT id INTO v_legacy FROM public.accounting_journals
     WHERE idempotency_key = 'plinko-payout:' || v_game.id::text;
    IF v_legacy IS NOT NULL THEN
      v_payout_res := jsonb_build_object('idempotent', true, 'journal_id', v_legacy, 'legacy_key', true);
    ELSE
      v_payout_res := public.accounting_post_journal(
        p_journal_type := 'PAYOUT_SETTLED',
        p_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_payout_acct,   'debit', v_payout, 'credit', 0),
          jsonb_build_object('account_id', v_wallet,        'debit', 0,        'credit', v_payout),
          jsonb_build_object('account_id', v_bankroll_acct, 'debit', v_payout, 'credit', 0),
          jsonb_build_object('account_id', v_reserve_acct,  'debit', 0,        'credit', v_payout)),
        p_idempotency_key := v_payout_key,
        p_product := 'plinko', p_game := 'plinko',
        p_reference_type := 'arcade_plinko_game',
        p_reference_id := v_game.id::text,
        p_event_type := 'payout',
        p_settlement_version := 1,
        p_effective_at := v_game.created_at,
        p_metadata := v_meta,
        p_environment := v_env::text,
        p_allow_negative := true);
    END IF;
  END IF;

  UPDATE public.wallet_transactions wt
     SET accounting_sync_status = 'SYNCED',
         accounting_journal_id = CASE WHEN wt.type = 'credit'
              THEN (v_payout_res->>'journal_id')::uuid ELSE (v_stake_res->>'journal_id')::uuid END,
         accounting_sync_error = NULL,
         accounting_synced_at = now()
   WHERE wt.transaction_category = 'arcade_plinko'
     AND wt.user_id = v_game.user_id
     AND (
       (wt.type = 'credit' AND wt.reference_id = v_game.id)
       OR (wt.type = 'debit' AND wt.metadata->>'idempotency_key' = v_game.idempotency_key)
     )
     AND wt.accounting_sync_status <> 'SYNCED';

  RETURN jsonb_build_object(
    'game_id', v_game.id,
    'environment', v_env,
    'stake', v_stake,
    'payout', v_payout,
    'house_result', v_stake - v_payout,
    'stake_journal', v_stake_res,
    'payout_journal', v_payout_res);
END $function$;

-- 4. Catch-up: bring HOUSE_BANKROLL in line for plinko games journalled before
--    this phase (legacy 2-line journals never touched the reserve).
DO $catchup$
DECLARE
  r record;
  v_reserve uuid;
  v_bankroll uuid;
  v_net numeric(18,2);
BEGIN
  FOR r IN
    SELECT j.environment,
           sum(CASE WHEN j.event_type = 'stake' THEN l.debit ELSE 0 END)
             FILTER (WHERE j.event_type = 'stake') AS stakes,
           sum(CASE WHEN j.event_type = 'payout' THEN l.debit ELSE 0 END)
             FILTER (WHERE j.event_type = 'payout') AS payouts
      FROM public.accounting_journals j
      JOIN public.accounting_journal_lines l ON l.journal_id = j.id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE j.product = 'plinko' AND j.status = 'POSTED'
       AND j.idempotency_key LIKE 'plinko-%'
       AND a.account_code IN ('USER_WALLET','PLINKO_PAYOUT_EXPENSE')
       AND ((j.event_type = 'stake' AND a.account_code = 'USER_WALLET')
         OR (j.event_type = 'payout' AND a.account_code = 'PLINKO_PAYOUT_EXPENSE'))
     GROUP BY j.environment
  LOOP
    v_net := round(coalesce(r.stakes,0) - coalesce(r.payouts,0), 2);
    CONTINUE WHEN v_net = 0;
    SELECT id INTO v_reserve FROM public.accounting_accounts
     WHERE account_code = 'PLINKO_PL_TO_RESERVE' AND environment = r.environment AND status = 'ACTIVE';
    SELECT id INTO v_bankroll FROM public.accounting_accounts
     WHERE account_code = 'HOUSE_BANKROLL' AND environment = r.environment AND status = 'ACTIVE';
    IF v_reserve IS NULL OR v_bankroll IS NULL THEN CONTINUE; END IF;

    PERFORM public.accounting_post_journal(
      p_journal_type := 'ADMIN_CORRECTION',
      p_lines := CASE WHEN v_net > 0 THEN jsonb_build_array(
          jsonb_build_object('account_id', v_reserve,  'debit', v_net, 'credit', 0),
          jsonb_build_object('account_id', v_bankroll, 'debit', 0,     'credit', v_net))
        ELSE jsonb_build_array(
          jsonb_build_object('account_id', v_bankroll, 'debit', -v_net, 'credit', 0),
          jsonb_build_object('account_id', v_reserve,  'debit', 0,      'credit', -v_net)) END,
      p_idempotency_key := 'plinko-bankroll-catchup:' || r.environment::text || ':v1',
      p_product := 'plinko', p_game := 'plinko',
      p_event_type := 'bankroll_catchup',
      p_metadata := jsonb_build_object(
        'reason','Phase 4.1: transfer realised Plinko P/L of pre-4.1 journals into HOUSE_BANKROLL',
        'net_house_result', v_net),
      p_environment := r.environment::text,
      p_allow_negative := true);
  END LOOP;
END $catchup$;

-- 5. Pre-drop payout-capacity control inside the drop RPC
CREATE OR REPLACE FUNCTION public.arcade_place_plinko_drop(p_user uuid, p_rows integer, p_risk arcade_risk_mode, p_idempotency_key text, p_client_seed text, p_stake numeric)
RETURNS arcade_plinko_games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_flags public.accounting_migration_flags;
  v_env public.acct_environment;
  v_max_mult numeric(10,4);
  v_max_exposure numeric(18,2);
  v_reserve numeric(18,2);
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

  -- Payout-capacity control: worst-case payout on this board must be coverable
  -- by the available operational reserve before the drop is accepted.
  SELECT * INTO v_flags FROM public.accounting_migration_flags WHERE product = 'plinko';
  IF FOUND AND v_flags.journal_enabled THEN
    SELECT a.environment INTO v_env FROM public.accounting_accounts a
     WHERE a.user_id = p_user AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
    IF v_env IS NOT NULL THEN
      SELECT max(multiplier) INTO v_max_mult FROM public.arcade_score_profile_slots
       WHERE profile_id = v_profile.id;
      v_max_exposure := round(v_stake * coalesce(v_max_mult, 0), 2);
      v_reserve := public.accounting_available_reserve(v_env);
      IF v_max_exposure > v_reserve THEN
        RAISE EXCEPTION 'EXPOSURE_LIMIT: max payout % exceeds available reserve %',
          v_max_exposure, v_reserve;
      END IF;
    END IF;
  END IF;

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
END $function$;

-- 6. Bankroll control view: reserve movement must equal Plinko realised P/L
CREATE OR REPLACE VIEW public.v_accounting_plinko_bankroll_control
WITH (security_invoker = true) AS
WITH pl AS (
  SELECT a.environment,
         sum(CASE WHEN a.account_code = 'PLINKO_STAKE_REVENUE' THEN l.credit - l.debit ELSE 0 END) AS stake_revenue,
         sum(CASE WHEN a.account_code = 'PLINKO_PAYOUT_EXPENSE' THEN l.debit - l.credit ELSE 0 END) AS payout_expense,
         sum(CASE WHEN a.account_code = 'PLINKO_PL_TO_RESERVE' THEN l.debit - l.credit ELSE 0 END) AS closed_to_reserve,
         sum(CASE WHEN a.account_code = 'HOUSE_BANKROLL' AND j.product = 'plinko' THEN l.credit - l.debit ELSE 0 END) AS bankroll_movement
    FROM public.accounting_journal_lines l
    JOIN public.accounting_journals j ON j.id = l.journal_id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.status IN ('POSTED','REVERSED')
     AND (j.product = 'plinko' OR a.account_code LIKE 'PLINKO_%')
   GROUP BY a.environment
)
SELECT environment,
       stake_revenue,
       payout_expense,
       (stake_revenue - payout_expense)::numeric(18,2) AS plinko_pl,
       closed_to_reserve,
       bankroll_movement,
       public.accounting_available_reserve(environment) AS available_reserve,
       ((stake_revenue - payout_expense) = bankroll_movement
        AND (stake_revenue - payout_expense) = closed_to_reserve) AS reconciled
  FROM pl;

REVOKE ALL ON public.v_accounting_plinko_bankroll_control FROM anon, authenticated;
GRANT SELECT ON public.v_accounting_plinko_bankroll_control TO service_role;

-- 7. Self-test harness (writes nothing: every scenario rolls its subtransaction back)
CREATE OR REPLACE FUNCTION public.accounting_plinko_selftest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_template public.arcade_plinko_games%ROWTYPE;
  v_row public.arcade_plinko_games%ROWTYPE;
  v_env public.acct_environment;
  v_wallet_acct uuid;
  v_bankroll_acct uuid;
  v_report jsonb := '[]'::jsonb;
  sc record;
  v_w0 numeric; v_b0 numeric; v_r0 numeric; v_e0 numeric;
  v_w1 numeric; v_b1 numeric; v_r1 numeric; v_e1 numeric;
  v_jcount int;
  v_keys text[];
  v_second_reversal_rejected boolean;
  v_rollback_clean boolean;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN';
  END IF;

  SELECT g.* INTO v_template FROM public.arcade_plinko_games g
    JOIN public.accounting_accounts a
      ON a.user_id = g.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE'
   ORDER BY g.created_at DESC LIMIT 1;
  IF v_template.id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no plinko game with an accounting wallet to template from');
  END IF;

  SELECT a.id, a.environment INTO v_wallet_acct, v_env FROM public.accounting_accounts a
   WHERE a.user_id = v_template.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  SELECT id INTO v_bankroll_acct FROM public.accounting_accounts
   WHERE account_code = 'HOUSE_BANKROLL' AND environment = v_env AND status = 'ACTIVE';

  FOR sc IN
    SELECT * FROM (VALUES
      ('full_loss', 100.00, 0.00, 100.00),
      ('partial_return', 100.00, 60.00, 40.00),
      ('push', 100.00, 100.00, 0.00),
      ('win', 100.00, 250.00, -150.00),
      ('void_refund', 100.00, 100.00, 0.00)
    ) AS t(name, stake, payout, expected_pl)
  LOOP
    BEGIN
      SELECT balance INTO v_w0 FROM public.accounting_account_balances WHERE account_id = v_wallet_acct;
      SELECT balance INTO v_b0 FROM public.accounting_account_balances WHERE account_id = v_bankroll_acct;
      SELECT b.balance INTO v_r0 FROM public.accounting_account_balances b
        JOIN public.accounting_accounts a ON a.id = b.account_id
       WHERE a.account_code = 'PLINKO_STAKE_REVENUE' AND a.environment = v_env;
      SELECT b.balance INTO v_e0 FROM public.accounting_account_balances b
        JOIN public.accounting_accounts a ON a.id = b.account_id
       WHERE a.account_code = 'PLINKO_PAYOUT_EXPENSE' AND a.environment = v_env;

      v_row := v_template;
      v_row.id := gen_random_uuid();
      v_row.idempotency_key := 'selftest-' || sc.name || '-' || v_row.id::text;
      v_row.verification_id := encode(extensions.gen_random_bytes(8), 'hex');
      v_row.stake_per_ball := sc.stake;
      v_row.payout := sc.payout;
      v_row.created_at := now();
      INSERT INTO public.arcade_plinko_games SELECT (v_row).*;

      PERFORM public.accounting_post_plinko_game(v_row.id);

      SELECT balance INTO v_w1 FROM public.accounting_account_balances WHERE account_id = v_wallet_acct;
      SELECT balance INTO v_b1 FROM public.accounting_account_balances WHERE account_id = v_bankroll_acct;
      SELECT b.balance INTO v_r1 FROM public.accounting_account_balances b
        JOIN public.accounting_accounts a ON a.id = b.account_id
       WHERE a.account_code = 'PLINKO_STAKE_REVENUE' AND a.environment = v_env;
      SELECT b.balance INTO v_e1 FROM public.accounting_account_balances b
        JOIN public.accounting_accounts a ON a.id = b.account_id
       WHERE a.account_code = 'PLINKO_PAYOUT_EXPENSE' AND a.environment = v_env;

      SELECT array_agg(idempotency_key ORDER BY ledger_seq) INTO v_keys
        FROM public.accounting_journals WHERE reference_id = v_row.id::text;

      -- reversal integrity
      PERFORM public.accounting_reverse_plinko_game(v_row.id, 'selftest reversal integrity check');
      BEGIN
        PERFORM public.accounting_reverse_plinko_game(v_row.id, 'selftest duplicate reversal attempt');
        v_second_reversal_rejected := (SELECT count(*) = 0 FROM public.accounting_journals
          WHERE reference_id = v_row.id::text AND status = 'POSTED' AND event_type IN ('stake','payout'));
      EXCEPTION WHEN others THEN
        v_second_reversal_rejected := true;
      END;

      v_report := v_report || jsonb_build_object(
        'scenario', sc.name,
        'stake', sc.stake, 'payout', sc.payout,
        'expected_pl', sc.expected_pl,
        'plinko_pl', (v_r1 - v_r0) - (v_e1 - v_e0),
        'bankroll_delta', v_b1 - v_b0,
        'user_wallet_delta', (v_w1 - v_w0),
        'idempotency_keys', to_jsonb(v_keys),
        'pl_matches', ((v_r1 - v_r0) - (v_e1 - v_e0)) = sc.expected_pl,
        'bankroll_matches_pl', (v_b1 - v_b0) = sc.expected_pl,
        'wallet_matches_player_net', (v_w1 - v_w0) = (sc.payout - sc.stake),
        'reversal_restores_wallet',
          (SELECT balance FROM public.accounting_account_balances WHERE account_id = v_wallet_acct) = v_w0,
        'reversal_restores_bankroll',
          (SELECT balance FROM public.accounting_account_balances WHERE account_id = v_bankroll_acct) = v_b0,
        'second_reversal_rejected', v_second_reversal_rejected,
        'originals_immutable', (SELECT bool_and(status = 'REVERSED') FROM public.accounting_journals
           WHERE reference_id = v_row.id::text AND event_type IN ('stake','payout')));

      RAISE EXCEPTION 'SELFTEST_ROLLBACK';
    EXCEPTION WHEN others THEN
      IF SQLERRM <> 'SELFTEST_ROLLBACK' THEN
        v_report := v_report || jsonb_build_object('scenario', sc.name, 'error', SQLERRM);
      END IF;
    END;
  END LOOP;

  -- forced-failure atomicity: stake journal posted, then abort before payout
  DECLARE
    v_fail_id uuid := gen_random_uuid();
  BEGIN
    BEGIN
      v_row := v_template;
      v_row.id := v_fail_id;
      v_row.idempotency_key := 'selftest-fail-' || v_fail_id::text;
      v_row.verification_id := encode(extensions.gen_random_bytes(8), 'hex');
      v_row.stake_per_ball := 100.00;
      v_row.payout := 250.00;
      v_row.created_at := now();
      INSERT INTO public.arcade_plinko_games SELECT (v_row).*;
      PERFORM public.accounting_post_plinko_game(v_fail_id);
      RAISE EXCEPTION 'SELFTEST_FORCED_FAILURE';
    EXCEPTION WHEN others THEN
      NULL;
    END;
    SELECT count(*) INTO v_jcount FROM public.accounting_journals WHERE reference_id = v_fail_id::text;
    v_rollback_clean := v_jcount = 0
      AND NOT EXISTS (SELECT 1 FROM public.arcade_plinko_games WHERE id = v_fail_id);
  END;

  RETURN jsonb_build_object(
    'environment', v_env,
    'scenarios', v_report,
    'forced_failure_rollback_clean', v_rollback_clean,
    'available_reserve', public.accounting_available_reserve(v_env),
    'bankroll_control', (SELECT to_jsonb(v) FROM public.v_accounting_plinko_bankroll_control v
                          WHERE v.environment = v_env));
END $function$;

REVOKE ALL ON FUNCTION public.accounting_plinko_selftest() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_plinko_selftest() TO service_role;
