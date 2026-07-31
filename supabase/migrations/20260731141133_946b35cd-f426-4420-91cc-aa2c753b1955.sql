-- ============ Phase 6: authoritative liability reservation ============

ALTER TABLE public.accounting_migration_flags
  ADD COLUMN IF NOT EXISTS liability_enforced boolean NOT NULL DEFAULT false;

UPDATE public.accounting_migration_flags
   SET liability_enforced = true
 WHERE product IN ('plinko','treasure','roulette','blackjack');

CREATE TABLE IF NOT EXISTS public.accounting_liability_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment public.acct_environment NOT NULL,
  product text NOT NULL,
  game text,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  user_id uuid,
  max_gross_payout numeric(18,2) NOT NULL,
  stake_collected numeric(18,2) NOT NULL DEFAULT 0,
  max_net_liability numeric(18,2) NOT NULL,
  reserved_amount numeric(18,2) NOT NULL,
  counts_toward_available boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE',
  release_reason text,
  config_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acct_liab_status_chk CHECK (status IN ('ACTIVE','RELEASED','CANCELLED')),
  CONSTRAINT acct_liab_amounts_chk CHECK (
    max_gross_payout >= 0 AND stake_collected >= 0 AND reserved_amount >= 0),
  CONSTRAINT acct_liab_ref_uniq UNIQUE (reference_type, reference_id)
);

GRANT SELECT ON public.accounting_liability_reservations TO authenticated;
GRANT ALL ON public.accounting_liability_reservations TO service_role;
ALTER TABLE public.accounting_liability_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own reservations"
  ON public.accounting_liability_reservations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS acct_liab_active_idx
  ON public.accounting_liability_reservations (environment, product)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS acct_liab_user_idx
  ON public.accounting_liability_reservations (user_id, status);

CREATE TRIGGER acct_liab_touch BEFORE UPDATE ON public.accounting_liability_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- helpers ----

CREATE OR REPLACE FUNCTION public.accounting_user_env(p_user uuid)
RETURNS public.acct_environment
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.environment FROM public.accounting_accounts a
   WHERE a.user_id = p_user AND a.account_code = 'USER_WALLET' AND a.status = 'ACTIVE'
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.accounting_reserved_liability(p_env public.acct_environment)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(reserved_amount),0)::numeric(18,2)
    FROM public.accounting_liability_reservations
   WHERE environment = p_env AND status = 'ACTIVE' AND counts_toward_available;
$$;

-- available reserve now nets off active reserved liability
CREATE OR REPLACE FUNCTION public.accounting_available_reserve(p_env public.acct_environment)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    coalesce((SELECT sum(CASE WHEN a.account_code = 'HOUSE_BANKROLL' THEN b.balance
                              WHEN a.account_code = 'PAYOUTS_PAYABLE' THEN -b.balance
                              ELSE 0 END)
                FROM public.accounting_accounts a
                JOIN public.accounting_account_balances b ON b.account_id = a.id
               WHERE a.user_id IS NULL AND a.environment = p_env AND a.status = 'ACTIVE'
                 AND a.account_code IN ('HOUSE_BANKROLL','PAYOUTS_PAYABLE')), 0)
    - public.accounting_reserved_liability(p_env)
  )::numeric(18,2);
$$;

CREATE OR REPLACE FUNCTION public.accounting_available_reserve_locked(p_env public.acct_environment)
RETURNS numeric
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_bank numeric(18,2); v_reserved numeric(18,2);
BEGIN
  -- Serialise all reserve evaluations for this environment for the rest of the
  -- transaction, so concurrent placements queue instead of racing on a stale read.
  PERFORM pg_advisory_xact_lock(hashtext('accounting_reserve:' || p_env::text));

  PERFORM 1
    FROM public.accounting_accounts a
    JOIN public.accounting_account_balances b ON b.account_id = a.id
   WHERE a.user_id IS NULL AND a.environment = p_env AND a.status = 'ACTIVE'
     AND a.account_code IN ('HOUSE_BANKROLL','PAYOUTS_PAYABLE')
   ORDER BY a.account_code
   FOR UPDATE OF b;

  SELECT coalesce(sum(CASE WHEN a.account_code = 'HOUSE_BANKROLL' THEN b.balance
                           WHEN a.account_code = 'PAYOUTS_PAYABLE' THEN -b.balance
                           ELSE 0 END),0)::numeric(18,2)
    INTO v_bank
    FROM public.accounting_accounts a
    JOIN public.accounting_account_balances b ON b.account_id = a.id
   WHERE a.user_id IS NULL AND a.environment = p_env AND a.status = 'ACTIVE'
     AND a.account_code IN ('HOUSE_BANKROLL','PAYOUTS_PAYABLE');

  SELECT coalesce(sum(reserved_amount),0)::numeric(18,2) INTO v_reserved
    FROM public.accounting_liability_reservations
   WHERE environment = p_env AND status = 'ACTIVE' AND counts_toward_available;

  RETURN coalesce(v_bank,0) - coalesce(v_reserved,0);
END;
$fn$;

-- ---- reserve / release API ----

CREATE OR REPLACE FUNCTION public.accounting_reserve_liability(
  p_product text, p_game text, p_reference_type text, p_reference_id uuid,
  p_user uuid, p_max_gross numeric, p_stake numeric,
  p_config_version text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb,
  p_settled boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_env public.acct_environment;
  v_net numeric(18,2);
  v_counts boolean;
  v_id uuid;
BEGIN
  v_env := coalesce(public.accounting_user_env(p_user), 'PRODUCTION');
  v_net := greatest(round(coalesce(p_max_gross,0),2) - round(coalesce(p_stake,0),2), 0);
  SELECT coalesce(f.liability_enforced,false) INTO v_counts
    FROM public.accounting_migration_flags f WHERE f.product = p_product;

  INSERT INTO public.accounting_liability_reservations(
    environment, product, game, reference_type, reference_id, user_id,
    max_gross_payout, stake_collected, max_net_liability, reserved_amount,
    counts_toward_available, status, release_reason, released_at,
    config_version, metadata)
  VALUES (v_env, p_product, coalesce(p_game, p_product), p_reference_type, p_reference_id, p_user,
    round(coalesce(p_max_gross,0),2), round(coalesce(p_stake,0),2), v_net, v_net,
    coalesce(v_counts,false),
    CASE WHEN p_settled THEN 'RELEASED' ELSE 'ACTIVE' END,
    CASE WHEN p_settled THEN 'SETTLED_SAME_TRANSACTION' END,
    CASE WHEN p_settled THEN now() END,
    p_config_version, coalesce(p_metadata,'{}'::jsonb))
  ON CONFLICT (reference_type, reference_id) DO UPDATE
     SET max_gross_payout = excluded.max_gross_payout,
         stake_collected  = excluded.stake_collected,
         max_net_liability = excluded.max_net_liability,
         reserved_amount = CASE WHEN public.accounting_liability_reservations.status = 'ACTIVE'
                                THEN excluded.reserved_amount
                                ELSE public.accounting_liability_reservations.reserved_amount END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.accounting_release_liability(
  p_reference_type text, p_reference_id uuid, p_reason text DEFAULT 'SETTLED')
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.accounting_liability_reservations
     SET status = 'RELEASED', reserved_amount = 0,
         release_reason = coalesce(p_reason,'SETTLED'), released_at = now()
   WHERE reference_type = p_reference_type AND reference_id = p_reference_id
     AND status = 'ACTIVE';
$$;

-- net-liability capacity assertion (Phase 6 semantics)
DROP FUNCTION IF EXISTS public.accounting_arcade_assert_capacity(text, uuid, numeric);
CREATE OR REPLACE FUNCTION public.accounting_arcade_assert_capacity(
  p_product text, p_user uuid, p_max_gross numeric, p_stake numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_flags public.accounting_migration_flags; v_env public.acct_environment;
        v_avail numeric(18,2); v_net numeric(18,2);
BEGIN
  SELECT * INTO v_flags FROM public.accounting_migration_flags WHERE product = p_product;
  IF NOT FOUND OR NOT v_flags.journal_enabled THEN RETURN; END IF;
  v_env := public.accounting_user_env(p_user);
  IF v_env IS NULL THEN RETURN; END IF;

  v_net := greatest(round(coalesce(p_max_gross,0),2) - round(coalesce(p_stake,0),2), 0);
  v_avail := public.accounting_available_reserve_locked(v_env);
  IF v_net > v_avail THEN
    RAISE EXCEPTION 'EXPOSURE_LIMIT: max net liability % exceeds available bankroll % (gross %, stake %)',
      v_net, v_avail, round(coalesce(p_max_gross,0),2), round(coalesce(p_stake,0),2);
  END IF;
END;
$fn$;

-- ---- automatic release on terminal state ----

CREATE OR REPLACE FUNCTION public.accounting_liability_release_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_ref text := TG_ARGV[0]; v_terminal text[] := string_to_array(TG_ARGV[1], '|');
        v_status text;
BEGIN
  v_status := upper(coalesce(to_jsonb(NEW)->>'status',''));
  IF v_status = ANY (v_terminal) THEN
    PERFORM public.accounting_release_liability(v_ref, NEW.id, 'TERMINAL_' || v_status);
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER acct_liab_release_treasure
  AFTER UPDATE OF status ON public.arcade_treasure_rounds FOR EACH ROW
  EXECUTE FUNCTION public.accounting_liability_release_trg(
    'arcade_treasure_round', 'WON|LOST|PUSH|VOID|REVERSED|EXPIRED|ERROR');

CREATE TRIGGER acct_liab_release_bj
  AFTER UPDATE OF status ON public.arcade_bj_hands FOR EACH ROW
  EXECUTE FUNCTION public.accounting_liability_release_trg(
    'arcade_bj_hand', 'COMPLETED|VOID|REVERSED|EXPIRED|ERROR');

CREATE TRIGGER acct_liab_release_predictions
  AFTER UPDATE OF status ON public.predictions FOR EACH ROW
  EXECUTE FUNCTION public.accounting_liability_release_trg(
    'prediction', 'WON|LOST|VOID');

CREATE TRIGGER acct_liab_release_ufc
  AFTER UPDATE OF status ON public.ufc_bets FOR EACH ROW
  EXECUTE FUNCTION public.accounting_liability_release_trg(
    'ufc_bet', 'WON|LOST|VOID|CANCELLED|REFUNDED');

CREATE TRIGGER acct_liab_release_f1
  AFTER UPDATE OF status ON public.f1_bets FOR EACH ROW
  EXECUTE FUNCTION public.accounting_liability_release_trg(
    'f1_bet', 'WON|LOST|VOID|CANCELLED|REFUNDED');

CREATE TRIGGER acct_liab_release_f1_champ
  AFTER UPDATE OF status ON public.f1_championship_bets FOR EACH ROW
  EXECUTE FUNCTION public.accounting_liability_release_trg(
    'f1_championship_bet', 'WON|LOST|VOID|CANCELLED|REFUNDED');

CREATE TRIGGER acct_liab_release_sports
  AFTER UPDATE OF status ON public.sports_bets FOR EACH ROW
  EXECUTE FUNCTION public.accounting_liability_release_trg(
    'sports_bet', 'WON|LOST|VOID|CANCELLED|REFUNDED|PUSH');

-- ---- sports reservations recorded on placement (shadow until enforced) ----

CREATE OR REPLACE FUNCTION public.accounting_liability_sports_insert_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_product text := TG_ARGV[0]; v_ref text := TG_ARGV[1];
        j jsonb := to_jsonb(NEW); v_stake numeric; v_gross numeric;
BEGIN
  IF upper(coalesce(j->>'status','')) <> 'PENDING' THEN RETURN NULL; END IF;
  v_stake := coalesce((j->>'stake')::numeric, (j->>'virtual_stake')::numeric, 0);
  v_gross := coalesce((j->>'potential_payout')::numeric, (j->>'potential_return')::numeric, 0);
  PERFORM public.accounting_reserve_liability(
    v_product, v_product, v_ref, NEW.id, NEW.user_id, v_gross, v_stake, NULL,
    jsonb_build_object('source','placement_trigger'));
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER acct_liab_reserve_predictions AFTER INSERT ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.accounting_liability_sports_insert_trg('football','prediction');
CREATE TRIGGER acct_liab_reserve_ufc AFTER INSERT ON public.ufc_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_liability_sports_insert_trg('ufc','ufc_bet');
CREATE TRIGGER acct_liab_reserve_f1 AFTER INSERT ON public.f1_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_liability_sports_insert_trg('f1','f1_bet');
CREATE TRIGGER acct_liab_reserve_f1_champ AFTER INSERT ON public.f1_championship_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_liability_sports_insert_trg('f1','f1_championship_bet');
CREATE TRIGGER acct_liab_reserve_sports AFTER INSERT ON public.sports_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_liability_sports_insert_trg('sports_generic','sports_bet');

-- ---- backfill open positions ----

INSERT INTO public.accounting_liability_reservations(
  environment, product, game, reference_type, reference_id, user_id,
  max_gross_payout, stake_collected, max_net_liability, reserved_amount,
  counts_toward_available, status, config_version, metadata)
SELECT coalesce(public.accounting_user_env(r.user_id),'PRODUCTION'), 'treasure','treasure',
       'arcade_treasure_round', r.id, r.user_id,
       least(floor(r.stake * coalesce((SELECT max(actual_multiplier) FROM public.arcade_treasure_multiplier_tables m WHERE m.config_id = r.config_id),1)),
             coalesce((SELECT c.max_return FROM public.arcade_treasure_configurations c WHERE c.id = r.config_id), 999999)),
       r.stake,
       greatest(least(floor(r.stake * coalesce((SELECT max(actual_multiplier) FROM public.arcade_treasure_multiplier_tables m WHERE m.config_id = r.config_id),1)),
             coalesce((SELECT c.max_return FROM public.arcade_treasure_configurations c WHERE c.id = r.config_id), 999999)) - r.stake, 0),
       greatest(least(floor(r.stake * coalesce((SELECT max(actual_multiplier) FROM public.arcade_treasure_multiplier_tables m WHERE m.config_id = r.config_id),1)),
             coalesce((SELECT c.max_return FROM public.arcade_treasure_configurations c WHERE c.id = r.config_id), 999999)) - r.stake, 0),
       true, 'ACTIVE', r.config_version::text, jsonb_build_object('source','phase6_backfill')
  FROM public.arcade_treasure_rounds r
 WHERE r.status IN ('CREATED','ACTIVE','COLLECTING')
ON CONFLICT (reference_type, reference_id) DO NOTHING;

INSERT INTO public.accounting_liability_reservations(
  environment, product, game, reference_type, reference_id, user_id,
  max_gross_payout, stake_collected, max_net_liability, reserved_amount,
  counts_toward_available, status, config_version, metadata)
SELECT coalesce(public.accounting_user_env(h.user_id),'PRODUCTION'), 'blackjack','blackjack',
       'arcade_bj_hand', h.id, h.user_id,
       public.arcade_bj_worst_case_gross(h.rule_config_id, h.total_stake),
       h.total_stake,
       greatest(public.arcade_bj_worst_case_gross(h.rule_config_id, h.total_stake) - h.total_stake, 0),
       greatest(public.arcade_bj_worst_case_gross(h.rule_config_id, h.total_stake) - h.total_stake, 0),
       true, 'ACTIVE', h.rule_version::text, jsonb_build_object('source','phase6_backfill')
  FROM public.arcade_bj_hands h
 WHERE h.status IN ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING')
ON CONFLICT (reference_type, reference_id) DO NOTHING;

INSERT INTO public.accounting_liability_reservations(
  environment, product, game, reference_type, reference_id, user_id,
  max_gross_payout, stake_collected, max_net_liability, reserved_amount,
  counts_toward_available, status, metadata)
SELECT coalesce(public.accounting_user_env(x.user_id),'PRODUCTION'), x.product, x.product,
       x.ref, x.id, x.user_id, x.gross, x.stake,
       greatest(x.gross - x.stake,0), greatest(x.gross - x.stake,0),
       false, 'ACTIVE', jsonb_build_object('source','phase6_backfill')
  FROM (
    SELECT 'football'::text product, 'prediction'::text ref, p.id, p.user_id,
           coalesce(p.potential_return,0) gross, coalesce(p.virtual_stake,0) stake
      FROM public.predictions p WHERE p.status = 'pending'
    UNION ALL
    SELECT 'ufc','ufc_bet', b.id, b.user_id, coalesce(b.potential_payout,0), coalesce(b.stake,0)
      FROM public.ufc_bets b WHERE lower(b.status) = 'pending'
    UNION ALL
    SELECT 'f1','f1_bet', b.id, b.user_id, coalesce(b.potential_payout,0), coalesce(b.stake,0)
      FROM public.f1_bets b WHERE lower(b.status) = 'pending'
    UNION ALL
    SELECT 'f1','f1_championship_bet', b.id, b.user_id, coalesce(b.potential_payout,0), coalesce(b.stake,0)
      FROM public.f1_championship_bets b WHERE lower(b.status) = 'pending'
    UNION ALL
    SELECT 'sports_generic','sports_bet', b.id, b.user_id, coalesce(b.potential_payout,0), coalesce(b.stake,0)
      FROM public.sports_bets b WHERE lower(b.status) = 'pending'
  ) x
ON CONFLICT (reference_type, reference_id) DO NOTHING;

-- ---- reporting view ----

CREATE OR REPLACE VIEW public.v_accounting_open_liability
WITH (security_invoker = true) AS
SELECT environment, product,
       count(*) FILTER (WHERE status='ACTIVE') AS open_positions,
       coalesce(sum(stake_collected) FILTER (WHERE status='ACTIVE'),0)::numeric(18,2) AS open_stakes,
       coalesce(sum(max_gross_payout) FILTER (WHERE status='ACTIVE'),0)::numeric(18,2) AS max_potential_payout,
       coalesce(sum(max_net_liability) FILTER (WHERE status='ACTIVE'),0)::numeric(18,2) AS max_net_liability,
       coalesce(sum(reserved_amount) FILTER (WHERE status='ACTIVE' AND counts_toward_available),0)::numeric(18,2) AS reserved_against_bankroll
  FROM public.accounting_liability_reservations
 GROUP BY environment, product;

GRANT SELECT ON public.v_accounting_open_liability TO authenticated, service_role;