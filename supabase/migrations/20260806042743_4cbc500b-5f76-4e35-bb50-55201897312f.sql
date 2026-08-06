-- Settlement also backfills the stake entry for positions placed before the
-- journal was enabled. Idempotency keys make the extra call a no-op otherwise.
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
    v_product, v_ref, NEW.id, NEW.user_id, v_stake, v_payout,
    coalesce((jn->>'settled_at')::timestamptz, now()),
    jsonb_build_object('source','settlement_trigger','final_status', v_new), true, v_sim);
  RETURN NULL;
END;
$$;

-- Live world: journal on, liability still shadow (legacy bankroll authoritative).
INSERT INTO public.accounting_migration_flag_envs(product, environment, journal_enabled, dual_write, liability_enforced, capacity_enforced, notes)
VALUES ('football','PRODUCTION', true, true, false, true, 'Phase B step 3 — production dual-write, journal shadow'),
       ('f1','PRODUCTION',       true, true, false, true, 'Phase B step 3 — production dual-write, journal shadow'),
       ('ufc','PRODUCTION',      true, true, false, true, 'Phase B step 3 — production dual-write, journal shadow')
ON CONFLICT (product, environment) DO UPDATE
  SET journal_enabled = excluded.journal_enabled,
      dual_write = excluded.dual_write,
      liability_enforced = excluded.liability_enforced,
      capacity_enforced = excluded.capacity_enforced,
      notes = excluded.notes;

-- Reconciliation helper: journal vs legacy bankroll vs settled bet flows.
CREATE OR REPLACE FUNCTION public.sports_journal_reconciliation(
  p_env public.acct_environment DEFAULT 'PRODUCTION'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_products text[] := ARRAY['football','f1','ufc'];
  v_stake numeric(18,2);
  v_payout numeric(18,2);
  v_mismatch int;
  v_unbalanced int;
BEGIN
  SELECT coalesce(sum(CASE WHEN j.journal_type = 'STAKE_PLACED' THEN l.credit ELSE 0 END),0)::numeric(18,2),
         coalesce(sum(CASE WHEN j.journal_type = 'PAYOUT_SETTLED' THEN l.debit ELSE 0 END),0)::numeric(18,2)
    INTO v_stake, v_payout
    FROM public.accounting_journals j
    JOIN public.accounting_journal_lines l ON l.journal_id = j.id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.environment = p_env AND j.status = 'POSTED' AND j.product = ANY(v_products)
     AND a.account_code = 'HOUSE_BANKROLL';

  SELECT count(*) INTO v_unbalanced FROM (
    SELECT j.id FROM public.accounting_journals j
      JOIN public.accounting_journal_lines l ON l.journal_id = j.id
     WHERE j.environment = p_env AND j.product = ANY(v_products) AND j.status = 'POSTED'
     GROUP BY j.id HAVING round(sum(l.debit),2) <> round(sum(l.credit),2)) x;

  -- settled football rows whose journalled payout disagrees with the bet row
  SELECT count(*) INTO v_mismatch
    FROM public.predictions p
    JOIN public.accounting_journals j
      ON j.reference_id = p.id::text AND j.product = 'football' AND j.environment = p_env
     AND j.status = 'POSTED' AND j.journal_type = 'PAYOUT_SETTLED'
    JOIN LATERAL (SELECT round(sum(l.debit),2) d FROM public.accounting_journal_lines l
                   JOIN public.accounting_accounts a ON a.id = l.account_id
                  WHERE l.journal_id = j.id AND a.account_code = 'HOUSE_BANKROLL') s ON true
   WHERE s.d <> round(CASE WHEN p.status = 'void' THEN p.virtual_stake ELSE p.gross_payout END, 2);

  RETURN jsonb_build_object(
    'environment', p_env,
    'journal_sports_stake_in', v_stake,
    'journal_sports_payout_out', v_payout,
    'journal_sports_net_to_house', round(v_stake - v_payout, 2),
    'legacy_platform_bankroll', (SELECT balance FROM public.platform_bankroll
                                  WHERE is_simulation = (p_env = 'SIMULATION') LIMIT 1),
    'unbalanced_journals', v_unbalanced,
    'payout_mismatches', v_mismatch,
    'ok', (v_unbalanced = 0 AND v_mismatch = 0),
    'generated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.sports_journal_reconciliation(public.acct_environment) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sports_journal_reconciliation(public.acct_environment) TO service_role;