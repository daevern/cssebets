
-- 1) Enrich payout audit trigger metadata
CREATE OR REPLACE FUNCTION public.audit_payout_requests_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_actor  uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'payout_requested', 'payout_request', NEW.id, NEW.user_id, NEW.user_id,
      NULL,
      jsonb_build_object(
        'amount', NEW.amount,
        'status', NEW.status,
        'bank_name', NEW.bank_name
      ),
      '{}'::jsonb, NULL, NULL, NULL, NULL, false
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := 'payout_' || NEW.status::text;
    v_actor  := COALESCE(NEW.approved_by, NEW.completed_by, NEW.rejected_by, NEW.reviewed_by);
    PERFORM public.create_audit_log(
      v_action, 'payout_request', NEW.id, v_actor, NEW.user_id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object(
        'status', NEW.status,
        'amount', NEW.amount,
        'approved_by', NEW.approved_by,
        'completed_by', NEW.completed_by,
        'rejected_by', NEW.rejected_by,
        'reviewed_by', NEW.reviewed_by,
        'bank_reference_no', NEW.bank_reference_no,
        'checker_notes', NEW.checker_notes,
        'rejection_reason', NEW.rejection_reason,
        'approved_at', NEW.approved_at,
        'completed_at', NEW.completed_at,
        'rejected_at', NEW.rejected_at
      ),
      '{}'::jsonb, COALESCE(NEW.rejection_reason, NEW.user_rejection_reason),
      NULL, NULL, NULL, false
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Safe backfill: only rows tied to a real payout_request via entity_id
UPDATE public.audit_log a
   SET target_user_id = pr.user_id
  FROM public.payout_requests pr
 WHERE a.entity = 'payout_request'
   AND a.target_user_id IS NULL
   AND a.entity_id = pr.id;
