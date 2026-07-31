-- ============================================================
-- PHASE 4: PLINKO PRODUCT MIGRATION INTO THE UNIFIED JOURNAL
-- ============================================================

-- 1. Product accounts (PRODUCTION + SIMULATION)
INSERT INTO public.accounting_accounts (account_code, account_type, normal_balance, product, environment, metadata)
SELECT v.code, v.atype::public.acct_account_type, v.nb::public.acct_normal_balance, 'plinko', e::public.acct_environment,
       jsonb_build_object('phase', 4, 'purpose', v.purpose)
FROM (VALUES
  ('PLINKO_STAKE_REVENUE','REVENUE','CREDIT','house income from plinko stakes'),
  ('PLINKO_PAYOUT_EXPENSE','EXPENSE','DEBIT','house cost of plinko payouts')
) AS v(code, atype, nb, purpose)
CROSS JOIN (VALUES ('PRODUCTION'),('SIMULATION')) AS envs(e)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_accounts a
   WHERE a.account_code = v.code AND a.environment = e::public.acct_environment AND a.status = 'ACTIVE'
);

-- 2. Canonical Plinko posting function
CREATE OR REPLACE FUNCTION public.accounting_post_plinko_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game public.arcade_plinko_games%ROWTYPE;
  v_env public.acct_environment;
  v_wallet uuid;
  v_stake_acct uuid;
  v_payout_acct uuid;
  v_stake numeric(18,2);
  v_payout numeric(18,2);
  v_meta jsonb;
  v_stake_res jsonb;
  v_payout_res jsonb := NULL;
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
  IF v_stake_acct IS NULL OR v_payout_acct IS NULL THEN
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

  IF v_stake > 0 THEN
    v_stake_res := public.accounting_post_journal(
      p_journal_type := 'STAKE_PLACED',
      p_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_wallet,     'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_stake_acct, 'debit', 0,       'credit', v_stake)),
      p_idempotency_key := 'plinko-stake:' || v_game.id::text,
      p_product := 'plinko',
      p_game := 'plinko',
      p_reference_type := 'arcade_plinko_game',
      p_reference_id := v_game.id::text,
      p_event_type := 'stake',
      p_settlement_version := 1,
      p_effective_at := v_game.created_at,
      p_metadata := v_meta,
      p_environment := v_env::text);
  END IF;

  IF v_payout > 0 THEN
    v_payout_res := public.accounting_post_journal(
      p_journal_type := 'PAYOUT_SETTLED',
      p_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_payout_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_wallet,      'debit', 0,        'credit', v_payout)),
      p_idempotency_key := 'plinko-payout:' || v_game.id::text,
      p_product := 'plinko',
      p_game := 'plinko',
      p_reference_type := 'arcade_plinko_game',
      p_reference_id := v_game.id::text,
      p_event_type := 'payout',
      p_settlement_version := 1,
      p_effective_at := v_game.created_at,
      p_metadata := v_meta,
      p_environment := v_env::text);
  END IF;

  -- claim the legacy wallet rows for this game so the shadow bridge cannot double-post them
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
    'stake_journal', v_stake_res,
    'payout_journal', v_payout_res);
END $$;

REVOKE ALL ON FUNCTION public.accounting_post_plinko_game(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_post_plinko_game(uuid) TO service_role;

-- 3. Audited reversal of a single plinko round's journals
CREATE OR REPLACE FUNCTION public.accounting_reverse_plinko_game(p_game_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may reverse plinko journals';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: a reversal reason is required';
  END IF;

  FOR r IN
    SELECT id FROM public.accounting_journals
     WHERE product = 'plinko' AND reference_id = p_game_id::text AND status = 'POSTED'
     ORDER BY ledger_seq DESC
  LOOP
    v_out := v_out || public.accounting_reverse_journal(r.id, p_reason);
  END LOOP;

  RETURN jsonb_build_object('game_id', p_game_id, 'reversals', v_out);
END $$;

REVOKE ALL ON FUNCTION public.accounting_reverse_plinko_game(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_reverse_plinko_game(uuid, text) TO service_role;

-- 4. Wire the product: post inside the same transaction as the drop
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

  -- Phase 4: unified double-entry posting, same transaction as the wallet movement
  SELECT * INTO v_flags FROM public.accounting_migration_flags WHERE product = 'plinko';
  IF FOUND AND (v_flags.journal_enabled OR v_flags.dual_write) THEN
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

-- 5. Reconciliation report: legacy plinko rows vs journal
CREATE OR REPLACE VIEW public.v_accounting_plinko_reconciliation
WITH (security_invoker = on) AS
WITH legacy AS (
  SELECT count(*)::bigint AS games,
         coalesce(sum(g.stake_per_ball), 0)::numeric(18,2) AS stakes,
         coalesce(sum(g.payout), 0)::numeric(18,2) AS payouts
    FROM public.arcade_plinko_games g
   WHERE EXISTS (SELECT 1 FROM public.accounting_journals j
                  WHERE j.product = 'plinko' AND j.reference_id = g.id::text)
), ledger AS (
  SELECT
    coalesce(sum(l.credit) FILTER (WHERE a.account_code = 'PLINKO_STAKE_REVENUE'), 0)::numeric(18,2)  AS stakes,
    coalesce(sum(l.debit)  FILTER (WHERE a.account_code = 'PLINKO_PAYOUT_EXPENSE'), 0)::numeric(18,2) AS payouts
    FROM public.accounting_journal_lines l
    JOIN public.accounting_journals j ON j.id = l.journal_id AND j.status = 'POSTED'
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.product = 'plinko'
), unposted AS (
  SELECT count(*)::bigint AS games
    FROM public.arcade_plinko_games g
   WHERE g.drop_type = 'paid'
     AND NOT EXISTS (SELECT 1 FROM public.accounting_journals j
                      WHERE j.product = 'plinko' AND j.reference_id = g.id::text)
     AND g.created_at > (SELECT min(created_at) FROM public.accounting_journals WHERE product = 'plinko')
)
SELECT legacy.games AS journalled_games,
       legacy.stakes AS legacy_stakes,
       ledger.stakes AS ledger_stakes,
       (legacy.stakes - ledger.stakes)::numeric(18,2) AS stake_variance,
       legacy.payouts AS legacy_payouts,
       ledger.payouts AS ledger_payouts,
       (legacy.payouts - ledger.payouts)::numeric(18,2) AS payout_variance,
       (ledger.stakes - ledger.payouts)::numeric(18,2) AS ledger_house_margin,
       unposted.games AS unposted_games_since_cutover,
       ((legacy.stakes - ledger.stakes) = 0
        AND (legacy.payouts - ledger.payouts) = 0
        AND unposted.games = 0) AS reconciled,
       now() AS checked_at
FROM legacy, ledger, unposted;

REVOKE ALL ON public.v_accounting_plinko_reconciliation FROM public, anon, authenticated;
GRANT SELECT ON public.v_accounting_plinko_reconciliation TO service_role;

-- 6. Enable the product flags for plinko only
UPDATE public.accounting_migration_flags
   SET journal_enabled = true,
       dual_write = true,
       notes = 'Phase 4: live on the unified journal (stake + payout double-entry, same txn)',
       updated_at = now()
 WHERE product = 'plinko';