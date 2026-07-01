
-- =========================================================
-- Phase 6 fix: platform_bankroll canonical safeguard
-- =========================================================
-- id = 1 is the canonical LIVE platform bankroll.
-- id = 2 is the SIMULATION bankroll used by simulation.functions.ts
-- (kept separately, must never be summed with live).

ALTER TABLE public.platform_bankroll
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Classify existing rows
UPDATE public.platform_bankroll SET kind = 'live',       is_active = true  WHERE id = 1;
UPDATE public.platform_bankroll SET kind = 'simulation', is_active = true  WHERE id = 2;

-- Constrain allowed kinds
ALTER TABLE public.platform_bankroll
  DROP CONSTRAINT IF EXISTS platform_bankroll_kind_chk;
ALTER TABLE public.platform_bankroll
  ADD CONSTRAINT platform_bankroll_kind_chk
  CHECK (kind IN ('live','simulation'));

-- Enforce a single active LIVE bankroll row (prevents accidental duplicates
-- or accidental summing across rows in future code).
DROP INDEX IF EXISTS platform_bankroll_one_active_live_idx;
CREATE UNIQUE INDEX platform_bankroll_one_active_live_idx
  ON public.platform_bankroll ((kind))
  WHERE kind = 'live' AND is_active = true;

COMMENT ON TABLE public.platform_bankroll IS
  'Platform bankroll. Canonical LIVE row: id=1 (kind=live, is_active=true). Simulation row: id=2 (kind=simulation). Live and simulation MUST NEVER be summed together. All live P&L / risk code must filter kind=''live'' AND is_active=true, or use id=1 explicitly.';

COMMENT ON COLUMN public.platform_bankroll.kind IS
  'Row purpose: ''live'' = real bankroll (only one active), ''simulation'' = sandbox for simulation.functions.ts.';

COMMENT ON COLUMN public.platform_bankroll.is_active IS
  'Only one live row may be active at a time (enforced by platform_bankroll_one_active_live_idx).';

-- =========================================================
-- Phase 10 fix: wallet audit trigger — populate transaction_category
-- and richer fields in new_value.
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_wallet_transactions_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_action text;
BEGIN
  -- Action naming: prefer explicit transaction_category; fall back to type+reference_type
  v_action := 'wallet_' || COALESCE(
    NEW.transaction_category,
    NEW.type::text || '_' || COALESCE(NEW.reference_type::text, 'other')
  );

  PERFORM public.create_audit_log(
    v_action,
    'wallet_transaction',
    NEW.id,
    NULL,
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'transaction_category', NEW.transaction_category,
      'type',                 NEW.type,
      'reference_type',       NEW.reference_type,
      'reference_id',         NEW.reference_id,
      'amount',               NEW.amount,
      'user_id',              NEW.user_id,
      'wallet_transaction_id',NEW.id,
      'bet_id',               NEW.bet_id,
      'payout_request_id',    NEW.payout_request_id,
      'balance_before',       NEW.balance_before,
      'balance_after',        NEW.balance_after
    ),
    jsonb_build_object('note', NEW.note),
    NULL, NULL, NULL, NULL,
    COALESCE(NEW.is_simulation, false)
  );
  RETURN NEW;
END;
$function$;

-- =========================================================
-- Audit action naming mapping (documentation only; no rewrites).
-- =========================================================
COMMENT ON TABLE public.audit_log IS
$c$Audit trail. Action naming mapping (legacy -> semantic):
  prediction.submit / prediction.market_submit -> bet placed
  prediction status change (settled)           -> bet settled
  payout.approve / payout.user_confirm         -> payout approved
  payout.reject                                -> payout rejected
  wallet.approve_request                       -> wallet request approved
  wallet.reject_request                        -> wallet request rejected
  wallet.admin_adjust                          -> wallet manual adjustment
  wallet_<transaction_category>                -> wallet ledger movement (Phase 10 trigger)
  bankroll.topup / bankroll.change             -> platform bankroll changed
  odds_edited / odds.sync                      -> market odds edited/synced
  user.suspend / user_roles insert/delete      -> role/user change
Historical rows retain their original action strings; reporting layers should
translate via this mapping rather than renaming existing rows.$c$;
