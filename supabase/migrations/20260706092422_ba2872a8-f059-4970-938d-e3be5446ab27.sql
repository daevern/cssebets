
-- ============================================================
-- Bug #6: matches.home_corners/away_corners/home_cards/away_cards —
-- document them explicitly as admin-override slots and audit changes.
-- Live stats live in public.match_stats; the matches.* columns are only
-- consulted when an admin manually sets them (via COALESCE precedence
-- in settle_cards_corners_for_match / regrade helpers).
-- ============================================================

COMMENT ON COLUMN public.matches.home_corners IS
  'Admin manual override for home corner total. NULL means "use match_stats.corners (feed value)". Setting this value is auto-logged to audit_log.';
COMMENT ON COLUMN public.matches.away_corners IS
  'Admin manual override for away corner total. NULL means "use match_stats.corners (feed value)". Setting this value is auto-logged to audit_log.';
COMMENT ON COLUMN public.matches.home_cards IS
  'Admin manual override for home card total. NULL means "use match_stats yellow+red (feed value)". Setting this value is auto-logged to audit_log.';
COMMENT ON COLUMN public.matches.away_cards IS
  'Admin manual override for away card total. NULL means "use match_stats yellow+red (feed value)". Setting this value is auto-logged to audit_log.';

CREATE OR REPLACE FUNCTION public.matches_audit_manual_stats_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed jsonb := '{}'::jsonb;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
BEGIN
  IF NEW.home_corners IS DISTINCT FROM OLD.home_corners THEN
    v_old := v_old || jsonb_build_object('home_corners', OLD.home_corners);
    v_new := v_new || jsonb_build_object('home_corners', NEW.home_corners);
  END IF;
  IF NEW.away_corners IS DISTINCT FROM OLD.away_corners THEN
    v_old := v_old || jsonb_build_object('away_corners', OLD.away_corners);
    v_new := v_new || jsonb_build_object('away_corners', NEW.away_corners);
  END IF;
  IF NEW.home_cards IS DISTINCT FROM OLD.home_cards THEN
    v_old := v_old || jsonb_build_object('home_cards', OLD.home_cards);
    v_new := v_new || jsonb_build_object('home_cards', NEW.home_cards);
  END IF;
  IF NEW.away_cards IS DISTINCT FROM OLD.away_cards THEN
    v_old := v_old || jsonb_build_object('away_cards', OLD.away_cards);
    v_new := v_new || jsonb_build_object('away_cards', NEW.away_cards);
  END IF;

  IF v_old <> '{}'::jsonb THEN
    INSERT INTO public.audit_log(
      user_id, action, entity, entity_id,
      is_simulation, reason, old_value, new_value, metadata
    ) VALUES (
      NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
      'match.stats_manual_override',
      'match',
      NEW.id,
      COALESCE(NEW.is_simulation, false),
      'Manual stats override (matches.* columns supersede match_stats feed)',
      v_old, v_new,
      jsonb_build_object('home_team', NEW.home_team, 'away_team', NEW.away_team)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_matches_audit_manual_stats_override ON public.matches;
CREATE TRIGGER trg_matches_audit_manual_stats_override
  AFTER UPDATE OF home_corners, away_corners, home_cards, away_cards
  ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.matches_audit_manual_stats_override();

-- ============================================================
-- Bug #7: predictions_accounting_trigger silently overwrites accounting
-- fields on status change. Add an AFTER trigger that captures the exact
-- before / after values so any regrade path leaves a paper trail.
-- ============================================================

CREATE OR REPLACE FUNCTION public.predictions_status_change_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Try to attribute to a signed-in caller; NULL for server-side settlement paths.
  BEGIN
    v_actor := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  INSERT INTO public.audit_log(
    user_id, action, entity, entity_id, target_user_id,
    is_simulation, reason,
    old_value, new_value, metadata
  ) VALUES (
    v_actor,
    'prediction.status_change',
    'prediction',
    NEW.id,
    NEW.user_id,
    COALESCE(NEW.is_simulation, false),
    'Prediction status transition (auto-audit)',
    jsonb_build_object(
      'status',              OLD.status,
      'gross_payout',        OLD.gross_payout,
      'net_profit',          OLD.net_profit,
      'house_profit_loss',   OLD.house_profit_loss,
      'points',              OLD.points,
      'settled_at',          OLD.settled_at,
      'settled_result',      OLD.settled_result
    ),
    jsonb_build_object(
      'status',              NEW.status,
      'gross_payout',        NEW.gross_payout,
      'net_profit',          NEW.net_profit,
      'house_profit_loss',   NEW.house_profit_loss,
      'points',              NEW.points,
      'settled_at',          NEW.settled_at,
      'settled_result',      NEW.settled_result
    ),
    jsonb_build_object(
      'match_id',            NEW.match_id,
      'market',              NEW.market,
      'virtual_stake',       NEW.virtual_stake,
      'reference_odds',      NEW.reference_odds,
      'accounting_version',  NEW.settlement_accounting_version
    )
  );

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_predictions_status_change_audit ON public.predictions;
CREATE TRIGGER trg_predictions_status_change_audit
  AFTER UPDATE OF status ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.predictions_status_change_audit();
