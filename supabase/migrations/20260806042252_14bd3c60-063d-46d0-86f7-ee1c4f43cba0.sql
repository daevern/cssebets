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
    -- allow_negative: the legacy wallet remains the authority on player funds
    -- during the migration, so the mirrored ledger wallet may lag behind it.
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
      p_metadata => coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('legacy_wallet_authoritative', true),
      p_allow_negative => true,
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
      p_allow_negative => true,
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