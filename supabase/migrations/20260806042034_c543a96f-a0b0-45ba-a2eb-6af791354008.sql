-- ============================================================
-- STEP 1: sports journal wiring (SIMULATION only)
-- ============================================================

-- 1. Per-environment flag overrides -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_migration_flag_envs (
  product            text NOT NULL,
  environment        public.acct_environment NOT NULL,
  journal_enabled    boolean,
  dual_write         boolean,
  liability_enforced boolean,
  capacity_enforced  boolean,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product, environment)
);

GRANT SELECT ON public.accounting_migration_flag_envs TO authenticated;
GRANT ALL ON public.accounting_migration_flag_envs TO service_role;
ALTER TABLE public.accounting_migration_flag_envs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view accounting env flags" ON public.accounting_migration_flag_envs;
CREATE POLICY "Admins can view accounting env flags"
  ON public.accounting_migration_flag_envs FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS accounting_migration_flag_envs_touch ON public.accounting_migration_flag_envs;
CREATE TRIGGER accounting_migration_flag_envs_touch
  BEFORE UPDATE ON public.accounting_migration_flag_envs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Effective flag resolver: env override wins, base row is the fallback.
CREATE OR REPLACE FUNCTION public.accounting_flags_for(
  p_product text,
  p_env public.acct_environment
) RETURNS TABLE (
  journal_enabled boolean,
  dual_write boolean,
  liability_enforced boolean,
  capacity_enforced boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(e.journal_enabled,    b.journal_enabled,    false),
    coalesce(e.dual_write,         b.dual_write,         false),
    coalesce(e.liability_enforced, b.liability_enforced, false),
    coalesce(e.capacity_enforced,  b.capacity_enforced,  true)
  FROM public.accounting_migration_flags b
  LEFT JOIN public.accounting_migration_flag_envs e
         ON e.product = b.product AND e.environment = p_env
  WHERE b.product = p_product;
$$;

REVOKE ALL ON FUNCTION public.accounting_flags_for(text, public.acct_environment) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_flags_for(text, public.acct_environment) TO service_role;

-- 2. Sports ledger accounts ---------------------------------------------------------
DO $do$
DECLARE
  v_env public.acct_environment;
  v_prod text;
  v_prefix text;
BEGIN
  FOREACH v_prod IN ARRAY ARRAY['football','f1','ufc'] LOOP
    v_prefix := upper(v_prod);
    FOR v_env IN SELECT unnest(ARRAY['PRODUCTION','SIMULATION']::public.acct_environment[]) LOOP
      INSERT INTO public.accounting_accounts(account_code, account_type, normal_balance, product, environment)
      SELECT v_prefix || '_STAKE_REVENUE', 'REVENUE', 'CREDIT', v_prod, v_env
      WHERE NOT EXISTS (SELECT 1 FROM public.accounting_accounts
                         WHERE account_code = v_prefix || '_STAKE_REVENUE'
                           AND environment = v_env AND status = 'ACTIVE');
      INSERT INTO public.accounting_accounts(account_code, account_type, normal_balance, product, environment)
      SELECT v_prefix || '_PAYOUT_EXPENSE', 'EXPENSE', 'DEBIT', v_prod, v_env
      WHERE NOT EXISTS (SELECT 1 FROM public.accounting_accounts
                         WHERE account_code = v_prefix || '_PAYOUT_EXPENSE'
                           AND environment = v_env AND status = 'ACTIVE');
      INSERT INTO public.accounting_accounts(account_code, account_type, normal_balance, product, environment)
      SELECT v_prefix || '_PL_TO_RESERVE', 'EQUITY', 'DEBIT', v_prod, v_env
      WHERE NOT EXISTS (SELECT 1 FROM public.accounting_accounts
                         WHERE account_code = v_prefix || '_PL_TO_RESERVE'
                           AND environment = v_env AND status = 'ACTIVE');
    END LOOP;
  END LOOP;
END
$do$;

-- 3. Environment resolution for a sports position -----------------------------------
-- Returns the environment to post in, or NULL when the position must not be posted
-- (no wallet account, or the bet's world does not match the wallet's world).
CREATE OR REPLACE FUNCTION public.accounting_sports_env(
  p_user uuid,
  p_is_simulation boolean DEFAULT NULL
) RETURNS public.acct_environment
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_env public.acct_environment;
BEGIN
  v_env := public.accounting_user_env(p_user);
  IF v_env IS NULL THEN RETURN NULL; END IF;
  IF p_is_simulation IS NOT NULL
     AND p_is_simulation <> (v_env = 'SIMULATION') THEN
    RETURN NULL;  -- never mix simulation and live bankrolls
  END IF;
  RETURN v_env;
END;
$$;

REVOKE ALL ON FUNCTION public.accounting_sports_env(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_sports_env(uuid, boolean) TO service_role;

-- 4. Sports journal poster ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_post_sports_position(
  p_product text,
  p_ref_type text,
  p_ref_id uuid,
  p_user uuid,
  p_stake numeric,
  p_payout numeric,
  p_effective timestamptz,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_release_liability boolean DEFAULT false,
  p_env public.acct_environment DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_env public.acct_environment := p_env;
  v_wallet uuid; v_stake_acct uuid; v_payout_acct uuid; v_bankroll_acct uuid;
  v_stake numeric(18,2); v_payout numeric(18,2);
  v_stake_res jsonb; v_payout_res jsonb;
  v_prefix text := upper(p_product);
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may post sports journals';
  END IF;
  IF p_product NOT IN ('football','f1','ufc') THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: unsupported sports product %', p_product;
  END IF;

  SELECT a.id, a.environment INTO v_wallet, v_env
    FROM public.accounting_accounts a
   WHERE a.user_id = p_user AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: no active USER_WALLET account for user %', p_user;
  END IF;
  IF p_env IS NOT NULL AND p_env <> v_env THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: environment mismatch (% vs wallet %)', p_env, v_env;
  END IF;

  SELECT id INTO v_stake_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix || '_STAKE_REVENUE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_payout_acct FROM public.accounting_accounts
   WHERE account_code = v_prefix || '_PAYOUT_EXPENSE' AND environment = v_env AND status = 'ACTIVE';
  SELECT id INTO v_bankroll_acct FROM public.accounting_accounts
   WHERE account_code = 'HOUSE_BANKROLL' AND environment = v_env AND status = 'ACTIVE';
  IF v_stake_acct IS NULL OR v_payout_acct IS NULL OR v_bankroll_acct IS NULL THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: missing % accounts for environment %', v_prefix, v_env;
  END IF;

  v_stake  := public.acct_round_stake(coalesce(p_stake, 0));
  v_payout := public.acct_round_payout(coalesce(p_payout, 0));

  IF v_stake > 0 THEN
    v_stake_res := public.accounting_post_journal(
      p_journal_type => 'STAKE_PLACED',
      p_lines => jsonb_build_array(
        jsonb_build_object('account_id', v_wallet,        'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_stake_acct,    'debit', 0,       'credit', v_stake),
        jsonb_build_object('account_id', v_stake_acct,    'debit', v_stake, 'credit', 0),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', 0,       'credit', v_stake)
      ),
      p_idempotency_key => p_product || ':' || p_ref_id::text || ':stake',
      p_product => p_product,
      p_game => p_product,
      p_reference_type => p_ref_type,
      p_reference_id => p_ref_id::text,
      p_event_type => 'STAKE_PLACED',
      p_effective_at => p_effective,
      p_created_by => p_user,
      p_metadata => coalesce(p_meta, '{}'::jsonb),
      p_environment => v_env::text);
  END IF;

  IF v_payout > 0 THEN
    v_payout_res := public.accounting_post_journal(
      p_journal_type => 'PAYOUT_SETTLED',
      p_lines => jsonb_build_array(
        jsonb_build_object('account_id', v_payout_acct,   'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_wallet,        'debit', 0,        'credit', v_payout),
        jsonb_build_object('account_id', v_bankroll_acct, 'debit', v_payout, 'credit', 0),
        jsonb_build_object('account_id', v_payout_acct,   'debit', 0,        'credit', v_payout)
      ),
      p_idempotency_key => p_product || ':' || p_ref_id::text || ':payout',
      p_product => p_product,
      p_game => p_product,
      p_reference_type => p_ref_type,
      p_reference_id => p_ref_id::text,
      p_event_type => 'PAYOUT_SETTLED',
      p_effective_at => p_effective,
      p_created_by => p_user,
      p_metadata => coalesce(p_meta, '{}'::jsonb),
      p_environment => v_env::text);
  END IF;

  IF p_release_liability THEN
    PERFORM public.accounting_release_liability(p_ref_type, p_ref_id, 'settled');
  END IF;

  RETURN jsonb_build_object('environment', v_env, 'stake_journal', v_stake_res, 'payout_journal', v_payout_res);
END;
$$;

REVOKE ALL ON FUNCTION public.accounting_post_sports_position(text, text, uuid, uuid, numeric, numeric, timestamptz, jsonb, boolean, public.acct_environment) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_post_sports_position(text, text, uuid, uuid, numeric, numeric, timestamptz, jsonb, boolean, public.acct_environment) TO service_role;

-- 5. Flag-aware hook -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_sports_hook(
  p_product text,
  p_ref_type text,
  p_ref_id uuid,
  p_user uuid,
  p_stake numeric,
  p_payout numeric,
  p_effective timestamptz,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_release_liability boolean DEFAULT false,
  p_is_simulation boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_env public.acct_environment; v_journal boolean;
BEGIN
  v_env := public.accounting_sports_env(p_user, p_is_simulation);
  IF v_env IS NULL THEN RETURN; END IF;
  SELECT f.journal_enabled INTO v_journal FROM public.accounting_flags_for(p_product, v_env) f;
  IF NOT coalesce(v_journal, false) THEN RETURN; END IF;
  PERFORM public.accounting_post_sports_position(
    p_product, p_ref_type, p_ref_id, p_user, p_stake, p_payout,
    p_effective, p_meta, p_release_liability, v_env);
END;
$$;

REVOKE ALL ON FUNCTION public.accounting_sports_hook(text, text, uuid, uuid, numeric, numeric, timestamptz, jsonb, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_sports_hook(text, text, uuid, uuid, numeric, numeric, timestamptz, jsonb, boolean, boolean) TO service_role;

-- 6. Placement / settlement triggers -------------------------------------------------
-- TG_ARGV: [0]=product, [1]=reference_type
CREATE OR REPLACE FUNCTION public.accounting_sports_placement_journal_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product text := TG_ARGV[0];
  v_ref text := TG_ARGV[1];
  j jsonb := to_jsonb(NEW);
  v_stake numeric;
  v_sim boolean;
BEGIN
  IF upper(coalesce(j->>'status','')) NOT IN ('PENDING','OPEN') THEN RETURN NULL; END IF;
  v_stake := coalesce((j->>'stake')::numeric, (j->>'virtual_stake')::numeric, 0);
  IF v_stake <= 0 THEN RETURN NULL; END IF;
  v_sim := CASE WHEN j ? 'is_simulation' THEN coalesce((j->>'is_simulation')::boolean, false) ELSE NULL END;
  PERFORM public.accounting_sports_hook(
    v_product, v_ref, NEW.id, NEW.user_id, v_stake, 0, now(),
    jsonb_build_object('source','placement_trigger'), false, v_sim);
  RETURN NULL;
END;
$$;

-- TG_ARGV: [0]=product, [1]=reference_type, [2]=terminal statuses pipe-separated
CREATE OR REPLACE FUNCTION public.accounting_sports_settlement_journal_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product text := TG_ARGV[0];
  v_ref text := TG_ARGV[1];
  v_terminal text[] := string_to_array(TG_ARGV[2], '|');
  jn jsonb := to_jsonb(NEW);
  jo jsonb := to_jsonb(OLD);
  v_new text := upper(coalesce(jn->>'status',''));
  v_old text := upper(coalesce(jo->>'status',''));
  v_stake numeric;
  v_payout numeric;
  v_sim boolean;
BEGIN
  IF v_new = v_old THEN RETURN NULL; END IF;
  IF NOT (v_new = ANY (v_terminal)) THEN RETURN NULL; END IF;

  v_stake := coalesce((jn->>'stake')::numeric, (jn->>'virtual_stake')::numeric, 0);

  IF v_new IN ('VOID','CANCELLED','REFUNDED','PUSH') THEN
    v_payout := v_stake;
  ELSIF v_new = 'WON' THEN
    v_payout := coalesce(
      (jn->>'gross_payout')::numeric,
      (jn->>'payout')::numeric,
      (jn->>'actual_payout')::numeric,
      (jn->>'potential_payout')::numeric,
      (jn->>'potential_return')::numeric,
      0);
  ELSE
    v_payout := 0;
  END IF;

  v_sim := CASE WHEN jn ? 'is_simulation' THEN coalesce((jn->>'is_simulation')::boolean, false) ELSE NULL END;

  PERFORM public.accounting_sports_hook(
    v_product, v_ref, NEW.id, NEW.user_id, 0, v_payout, coalesce((jn->>'settled_at')::timestamptz, now()),
    jsonb_build_object('source','settlement_trigger','final_status', v_new), true, v_sim);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS acct_journal_place_predictions ON public.predictions;
CREATE TRIGGER acct_journal_place_predictions AFTER INSERT ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_placement_journal_trg('football','prediction');
DROP TRIGGER IF EXISTS acct_journal_settle_predictions ON public.predictions;
CREATE TRIGGER acct_journal_settle_predictions AFTER UPDATE OF status ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_settlement_journal_trg('football','prediction','WON|LOST|VOID');

DROP TRIGGER IF EXISTS acct_journal_place_ufc ON public.ufc_bets;
CREATE TRIGGER acct_journal_place_ufc AFTER INSERT ON public.ufc_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_placement_journal_trg('ufc','ufc_bet');
DROP TRIGGER IF EXISTS acct_journal_settle_ufc ON public.ufc_bets;
CREATE TRIGGER acct_journal_settle_ufc AFTER UPDATE OF status ON public.ufc_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_settlement_journal_trg('ufc','ufc_bet','WON|LOST|VOID|CANCELLED|REFUNDED');

DROP TRIGGER IF EXISTS acct_journal_place_f1 ON public.f1_bets;
CREATE TRIGGER acct_journal_place_f1 AFTER INSERT ON public.f1_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_placement_journal_trg('f1','f1_bet');
DROP TRIGGER IF EXISTS acct_journal_settle_f1 ON public.f1_bets;
CREATE TRIGGER acct_journal_settle_f1 AFTER UPDATE OF status ON public.f1_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_settlement_journal_trg('f1','f1_bet','WON|LOST|VOID|CANCELLED|REFUNDED');

DROP TRIGGER IF EXISTS acct_journal_place_f1_champ ON public.f1_championship_bets;
CREATE TRIGGER acct_journal_place_f1_champ AFTER INSERT ON public.f1_championship_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_placement_journal_trg('f1','f1_championship_bet');
DROP TRIGGER IF EXISTS acct_journal_settle_f1_champ ON public.f1_championship_bets;
CREATE TRIGGER acct_journal_settle_f1_champ AFTER UPDATE OF status ON public.f1_championship_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_settlement_journal_trg('f1','f1_championship_bet','WON|LOST|VOID|CANCELLED|REFUNDED');

-- 7. Keep the legacy wallet bridge from double-posting sports ------------------------
CREATE OR REPLACE FUNCTION public.accounting_bridge_wallet_transaction(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.wallet_transactions%ROWTYPE;
  v_env public.acct_environment;
  v_wallet_account uuid;
  v_clearing uuid;
  v_delta numeric(18,2);
  v_lines jsonb;
  v_res jsonb;
  v_product text;
  v_native boolean := false;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may run the wallet bridge';
  END IF;

  SELECT * INTO v_tx FROM public.wallet_transactions WHERE id = p_tx_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','MISSING','transaction_id',p_tx_id);
  END IF;
  IF v_tx.accounting_sync_status = 'SYNCED' THEN
    RETURN jsonb_build_object('status','SYNCED','journal_id',v_tx.accounting_journal_id,'idempotent',true);
  END IF;

  v_env := CASE WHEN coalesce(v_tx.is_simulation,false) THEN 'SIMULATION' ELSE 'PRODUCTION' END;

  -- Products already live on the unified journal post their own STAKE_PLACED /
  -- PAYOUT_SETTLED entries inside the settlement transaction.
  IF v_tx.transaction_category LIKE 'arcade_%' THEN
    v_product := substring(v_tx.transaction_category from 8);
    SELECT (journal_enabled OR dual_write) INTO v_native
      FROM public.accounting_migration_flags WHERE product = v_product;
    IF coalesce(v_native, false) THEN
      UPDATE public.wallet_transactions
         SET accounting_sync_status = 'SKIPPED',
             accounting_sync_error = 'product journal is authoritative (' || v_product || ')',
             accounting_synced_at = now()
       WHERE id = p_tx_id;
      RETURN jsonb_build_object('status','SKIPPED','reason','native_product_journal','product',v_product);
    END IF;
  END IF;

  -- Sports stake/settlement wallet rows: skip once any sports product is
  -- journal-native in this environment (their triggers post the double entry).
  IF v_tx.reference_type IN ('bet_placement','bet_settlement') THEN
    SELECT bool_or(f.journal_enabled) INTO v_native
      FROM (VALUES ('football'),('f1'),('ufc')) p(product)
      CROSS JOIN LATERAL public.accounting_flags_for(p.product, v_env) f;
    IF coalesce(v_native, false) THEN
      UPDATE public.wallet_transactions
         SET accounting_sync_status = 'SKIPPED',
             accounting_sync_error = 'sports journal is authoritative',
             accounting_synced_at = now()
       WHERE id = p_tx_id;
      RETURN jsonb_build_object('status','SKIPPED','reason','native_sports_journal');
    END IF;
  END IF;

  SELECT a.id INTO v_wallet_account FROM public.accounting_accounts a
   WHERE a.user_id = v_tx.user_id AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE';
  IF v_wallet_account IS NULL THEN
    UPDATE public.wallet_transactions
       SET accounting_sync_status = 'ERROR',
           accounting_sync_error = 'no active USER_WALLET account for this user'
     WHERE id = p_tx_id;
    RETURN jsonb_build_object('status','ERROR','reason','missing_wallet_account');
  END IF;

  SELECT a.id INTO v_clearing FROM public.accounting_accounts a
   WHERE a.account_code = 'LEGACY_PRODUCT_CLEARING' AND a.environment = v_env AND a.status = 'ACTIVE';

  v_delta := round(coalesce(v_tx.balance_after,0) - coalesce(v_tx.balance_before,0), 2);
  IF v_delta = 0 THEN
    UPDATE public.wallet_transactions
       SET accounting_sync_status = 'SKIPPED',
           accounting_sync_error = 'zero net wallet effect',
           accounting_synced_at = now()
     WHERE id = p_tx_id;
    RETURN jsonb_build_object('status','SKIPPED','reason','zero_delta');
  END IF;

  IF v_delta > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_clearing, 'debit', v_delta, 'credit', 0),
      jsonb_build_object('account_id', v_wallet_account, 'debit', 0, 'credit', v_delta));
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_wallet_account, 'debit', -v_delta, 'credit', 0),
      jsonb_build_object('account_id', v_clearing, 'debit', 0, 'credit', -v_delta));
  END IF;

  BEGIN
    v_res := public.accounting_post_journal(
      p_journal_type := 'LEGACY_BACKFILL_REFERENCE',
      p_lines := v_lines,
      p_idempotency_key := 'legacy-wallet-tx:' || v_tx.id::text,
      p_product := coalesce(v_tx.transaction_category, v_tx.reference_type::text, 'legacy'),
      p_reference_type := v_tx.reference_type::text,
      p_reference_id := v_tx.reference_id::text,
      p_event_type := v_tx.type::text,
      p_effective_at := v_tx.created_at,
      p_metadata := jsonb_build_object(
        'source','legacy_wallet_transaction',
        'wallet_transaction_id', v_tx.id,
        'legacy_ledger_seq', v_tx.ledger_seq,
        'shadow_mode', true),
      p_allow_negative := true,
      p_environment := v_env::text);
  EXCEPTION WHEN others THEN
    UPDATE public.wallet_transactions
       SET accounting_sync_status = 'ERROR', accounting_sync_error = SQLERRM
     WHERE id = p_tx_id;
    RETURN jsonb_build_object('status','ERROR','reason',SQLERRM);
  END;

  UPDATE public.wallet_transactions
     SET accounting_sync_status = 'SYNCED',
         accounting_journal_id = (v_res->>'journal_id')::uuid,
         accounting_sync_error = NULL,
         accounting_synced_at = now()
   WHERE id = p_tx_id;

  RETURN jsonb_build_object('status','SYNCED','journal_number', v_res->>'journal_number',
                            'environment', v_env, 'delta', v_delta);
END;
$$;

-- 8. Self-test ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sports_journal_selftest(
  p_env public.acct_environment DEFAULT 'SIMULATION'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_pass int := 0; v_fail int := 0;
  v_bad int;
  v_products text[] := ARRAY['football','f1','ufc'];
  v_p text;
  v_flag boolean;

  PROCEDURE_NOOP boolean;
BEGIN
  -- (a) every sports journal balances
  SELECT count(*) INTO v_bad FROM (
    SELECT j.id
      FROM public.accounting_journals j
      JOIN public.accounting_journal_lines l ON l.journal_id = j.id
     WHERE j.environment = p_env AND j.product = ANY(v_products) AND j.status = 'POSTED'
     GROUP BY j.id
    HAVING round(sum(l.debit),2) <> round(sum(l.credit),2)) x;
  IF v_bad = 0 THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;
  v_checks := v_checks || jsonb_build_object('check','journals_balance','unbalanced',v_bad,'pass',v_bad = 0);

  -- (b) no duplicate stake/payout postings per position
  SELECT count(*) INTO v_bad FROM (
    SELECT j.product, j.reference_id, j.journal_type
      FROM public.accounting_journals j
     WHERE j.environment = p_env AND j.product = ANY(v_products) AND j.status = 'POSTED'
       AND j.journal_type IN ('STAKE_PLACED','PAYOUT_SETTLED')
     GROUP BY 1,2,3 HAVING count(*) > 1) d;
  IF v_bad = 0 THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;
  v_checks := v_checks || jsonb_build_object('check','no_double_post','duplicates',v_bad,'pass',v_bad = 0);

  -- (c) football journals match predictions stake/payout for the same rows
  SELECT count(*) INTO v_bad
    FROM public.predictions p
    JOIN public.accounting_journals j
      ON j.reference_id = p.id::text AND j.product = 'football'
     AND j.environment = p_env AND j.status = 'POSTED' AND j.journal_type = 'STAKE_PLACED'
    JOIN LATERAL (SELECT round(sum(l.debit),2) d FROM public.accounting_journal_lines l
                   WHERE l.journal_id = j.id) s ON true
   WHERE s.d <> round(p.virtual_stake,2) * 2;
  IF v_bad = 0 THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;
  v_checks := v_checks || jsonb_build_object('check','football_stake_matches_predictions','mismatches',v_bad,'pass',v_bad = 0);

  -- (d) no active reservation survives a settled sports position
  SELECT count(*) INTO v_bad
    FROM public.accounting_liability_reservations r
   WHERE r.environment = p_env AND r.product = ANY(v_products) AND r.status = 'ACTIVE'
     AND EXISTS (SELECT 1 FROM public.accounting_journals j
                  WHERE j.reference_id = r.reference_id::text
                    AND j.journal_type = 'PAYOUT_SETTLED' AND j.status = 'POSTED'
                    AND j.environment = p_env);
  IF v_bad = 0 THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;
  v_checks := v_checks || jsonb_build_object('check','no_orphan_reservations','orphans',v_bad,'pass',v_bad = 0);

  -- (e) reservations hold exactly their net liability while ACTIVE
  SELECT count(*) INTO v_bad
    FROM public.accounting_liability_reservations r
   WHERE r.environment = p_env AND r.product = ANY(v_products)
     AND ((r.status = 'ACTIVE' AND r.reserved_amount <> r.max_net_liability)
       OR (r.status <> 'ACTIVE' AND r.reserved_amount <> 0));
  IF v_bad = 0 THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;
  v_checks := v_checks || jsonb_build_object('check','reservation_amounts_consistent','violations',v_bad,'pass',v_bad = 0);

  -- (f) flags resolve as expected for this environment
  FOREACH v_p IN ARRAY v_products LOOP
    SELECT f.journal_enabled INTO v_flag FROM public.accounting_flags_for(v_p, p_env) f;
    v_checks := v_checks || jsonb_build_object('check','flag_' || v_p, 'journal_enabled', v_flag, 'pass', true);
    v_pass := v_pass + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'environment', p_env, 'passed', v_pass, 'failed', v_fail,
    'ok', v_fail = 0, 'checks', v_checks, 'generated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.sports_journal_selftest(public.acct_environment) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sports_journal_selftest(public.acct_environment) TO service_role;

-- 9. Enable journal posting in SIMULATION only ---------------------------------------
INSERT INTO public.accounting_migration_flag_envs(product, environment, journal_enabled, notes)
VALUES ('football','SIMULATION', true, 'Phase B step 1 — simulation journal wiring'),
       ('f1','SIMULATION',       true, 'Phase B step 1 — simulation journal wiring'),
       ('ufc','SIMULATION',      true, 'Phase B step 1 — simulation journal wiring')
ON CONFLICT (product, environment) DO UPDATE SET journal_enabled = excluded.journal_enabled, notes = excluded.notes;