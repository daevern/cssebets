
-- ============================================================================
-- Phase 10: Audit log foundation
-- ============================================================================

-- 1) Extend existing audit_log with the missing fields (backward-compatible)
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_target_user_idx ON public.audit_log(target_user_id, created_at DESC);

-- Ensure grants (no client INSERT — only SECURITY DEFINER helper / triggers write)
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon;

-- 2) Helper function to create audit entries safely
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_action text,
  p_entity text,
  p_entity_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_reason text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_is_simulation boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_log(
    user_id, target_user_id, action, entity, entity_id,
    old_value, new_value, metadata, reason,
    ip, user_agent, request_id, is_simulation
  ) VALUES (
    COALESCE(p_actor_user_id, auth.uid()), p_target_user_id, p_action, p_entity, p_entity_id,
    p_before, p_after, COALESCE(p_metadata, '{}'::jsonb), p_reason,
    p_ip, p_user_agent, p_request_id, COALESCE(p_is_simulation, false)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_audit_log(text, text, uuid, uuid, uuid, jsonb, jsonb, jsonb, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_audit_log(text, text, uuid, uuid, uuid, jsonb, jsonb, jsonb, text, text, text, text, boolean) TO service_role;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Predictions: placed / settled / voided
CREATE OR REPLACE FUNCTION public.audit_predictions_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'bet_placed', 'prediction', NEW.id, NEW.user_id, NEW.user_id,
      NULL,
      jsonb_build_object(
        'match_id', NEW.match_id, 'market', NEW.market, 'outcome', NEW.outcome,
        'virtual_stake', NEW.virtual_stake, 'odds', NEW.reference_odds,
        'potential_return', NEW.potential_return, 'status', NEW.status
      ),
      jsonb_build_object('client_request_id', NEW.client_request_id),
      NULL, NULL, NULL, NULL, COALESCE(NEW.is_simulation, false)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'won' THEN v_action := 'bet_settled_won';
    ELSIF NEW.status = 'lost' THEN v_action := 'bet_settled_lost';
    ELSIF NEW.status = 'void' THEN v_action := 'bet_voided';
    ELSE v_action := 'bet_status_changed';
    END IF;
    PERFORM public.create_audit_log(
      v_action, 'prediction', NEW.id, NULL, NEW.user_id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object(
        'status', NEW.status, 'virtual_stake', NEW.virtual_stake,
        'gross_payout', NEW.gross_payout, 'net_profit', NEW.net_profit,
        'house_profit_loss', NEW.house_profit_loss, 'settled_at', NEW.settled_at
      ),
      '{}'::jsonb, NULL, NULL, NULL, NULL, COALESCE(NEW.is_simulation, false)
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_predictions ON public.predictions;
CREATE TRIGGER audit_predictions
AFTER INSERT OR UPDATE OF status ON public.predictions
FOR EACH ROW EXECUTE FUNCTION public.audit_predictions_trg();

-- Wallet transactions: categorized ledger movement
CREATE OR REPLACE FUNCTION public.audit_wallet_transactions_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text;
BEGIN
  v_action := 'wallet_' || COALESCE(NEW.transaction_category, NEW.type::text || '_' || COALESCE(NEW.reference_type::text, 'other'));
  PERFORM public.create_audit_log(
    v_action, 'wallet_transaction', NEW.id, NULL, NEW.user_id,
    NULL,
    jsonb_build_object(
      'type', NEW.type, 'amount', NEW.amount,
      'reference_type', NEW.reference_type, 'reference_id', NEW.reference_id,
      'category', NEW.transaction_category
    ),
    jsonb_build_object('note', NEW.note),
    NULL, NULL, NULL, NULL, COALESCE(NEW.is_simulation, false)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_wallet_transactions ON public.wallet_transactions;
CREATE TRIGGER audit_wallet_transactions
AFTER INSERT ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_wallet_transactions_trg();

-- Payout requests
CREATE OR REPLACE FUNCTION public.audit_payout_requests_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'payout_requested', 'payout_request', NEW.id, NEW.user_id, NEW.user_id,
      NULL,
      jsonb_build_object('amount', NEW.amount, 'status', NEW.status, 'bank_name', NEW.bank_name),
      '{}'::jsonb, NULL, NULL, NULL, NULL, false
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := 'payout_' || NEW.status::text;
    PERFORM public.create_audit_log(
      v_action, 'payout_request', NEW.id, NEW.reviewed_by, NEW.user_id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'amount', NEW.amount,
                        'rejection_reason', NEW.rejection_reason,
                        'completed_at', NEW.completed_at,
                        'approved_at', NEW.approved_at),
      '{}'::jsonb, COALESCE(NEW.rejection_reason, NEW.user_rejection_reason),
      NULL, NULL, NULL, false
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_payout_requests ON public.payout_requests;
CREATE TRIGGER audit_payout_requests
AFTER INSERT OR UPDATE OF status ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_payout_requests_trg();

-- Match market odds: edits / suspend / reactivate
CREATE OR REPLACE FUNCTION public.audit_match_market_odds_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text;
BEGIN
  IF OLD.active IS DISTINCT FROM NEW.active THEN
    v_action := CASE WHEN NEW.active THEN 'odds_reactivated' ELSE 'odds_suspended' END;
  ELSIF OLD.odds IS DISTINCT FROM NEW.odds THEN
    v_action := 'odds_edited';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.create_audit_log(
    v_action, 'match_market_odds', NEW.id, auth.uid(), NULL,
    jsonb_build_object('odds', OLD.odds, 'active', OLD.active, 'source', OLD.source),
    jsonb_build_object('odds', NEW.odds, 'active', NEW.active, 'source', NEW.source),
    jsonb_build_object('match_id', NEW.match_id, 'market', NEW.market, 'selection', NEW.selection),
    NULL, NULL, NULL, NULL, false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_match_market_odds ON public.match_market_odds;
CREATE TRIGGER audit_match_market_odds
AFTER UPDATE OF odds, active ON public.match_market_odds
FOR EACH ROW EXECUTE FUNCTION public.audit_match_market_odds_trg();

-- User roles: grants / revokes
CREATE OR REPLACE FUNCTION public.audit_user_roles_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'role_granted', 'user_role', NEW.id, auth.uid(), NEW.user_id,
      NULL, jsonb_build_object('role', NEW.role),
      '{}'::jsonb, NULL, NULL, NULL, NULL, false
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'role_revoked', 'user_role', OLD.id, auth.uid(), OLD.user_id,
      jsonb_build_object('role', OLD.role), NULL,
      '{}'::jsonb, NULL, NULL, NULL, NULL, false
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_trg();

-- Platform bankroll: balance change
CREATE OR REPLACE FUNCTION public.audit_platform_bankroll_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.balance IS DISTINCT FROM NEW.balance THEN
    PERFORM public.create_audit_log(
      'bankroll_changed', 'platform_bankroll', NULL, auth.uid(), NULL,
      jsonb_build_object('balance', OLD.balance),
      jsonb_build_object('balance', NEW.balance,
                        'total_stakes_collected', NEW.total_stakes_collected,
                        'total_payouts_paid', NEW.total_payouts_paid),
      '{}'::jsonb, NULL, NULL, NULL, NULL, false
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_platform_bankroll ON public.platform_bankroll;
CREATE TRIGGER audit_platform_bankroll
AFTER UPDATE OF balance ON public.platform_bankroll
FOR EACH ROW EXECUTE FUNCTION public.audit_platform_bankroll_trg();
