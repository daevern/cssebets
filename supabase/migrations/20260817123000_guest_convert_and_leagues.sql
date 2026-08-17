-- Guest → member conversion + league invite codes.

-- 1) Convert an upgraded anon session into pending (awaiting staff approval).
-- Clears demo/simulation balance; keeps the same user_id for history.
CREATE OR REPLACE FUNCTION public.convert_guest_account(p_display_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_anon boolean;
  v_bal numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT coalesce(u.is_anonymous, false) INTO v_anon
  FROM auth.users u WHERE u.id = v_uid;

  -- Allow when already converted (is_anonymous=false) after updateUser,
  -- or when still flagged anonymous but credentials were just attached.
  -- Reject pure guests who never called updateUser (no email).
  IF v_anon AND NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_uid AND u.email IS NOT NULL AND length(u.email) > 0
  ) THEN
    RAISE EXCEPTION 'NOT_CONVERTED: attach email/password before converting';
  END IF;

  PERFORM set_config('app.demo_guest_reset', 'on', true);

  UPDATE public.profiles
     SET is_simulation = false,
         display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
         auth_provider = COALESCE(auth_provider, 'email'),
         updated_at = now()
   WHERE id = v_uid;

  DELETE FROM public.user_roles
   WHERE user_id = v_uid AND role = 'member'::public.app_role;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (v_uid, 'pending'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Close simulation wallet account; ensure production wallet.
  UPDATE public.accounting_accounts
     SET status = 'CLOSED', closed_at = now()
   WHERE user_id = v_uid AND account_code = 'USER_WALLET'
     AND environment = 'SIMULATION' AND status = 'ACTIVE';

  IF NOT EXISTS (
    SELECT 1 FROM public.accounting_accounts
     WHERE user_id = v_uid AND account_code = 'USER_WALLET'
       AND environment = 'PRODUCTION' AND status = 'ACTIVE'
  ) THEN
    INSERT INTO public.accounting_accounts
      (account_code, account_type, normal_balance, environment, currency_or_unit, status, user_id, metadata)
    VALUES
      ('USER_WALLET', 'LIABILITY', 'CREDIT', 'PRODUCTION', 'POINTS', 'ACTIVE', v_uid,
       jsonb_build_object('legacy_wallet_user_id', v_uid, 'guest_converted', true));
  END IF;

  SELECT coalesce(balance, 0) INTO v_bal FROM public.wallets WHERE user_id = v_uid;
  IF v_bal IS NULL THEN
    INSERT INTO public.wallets(user_id, balance, is_simulation)
    VALUES (v_uid, 0, false)
    ON CONFLICT (user_id) DO UPDATE SET balance = 0, is_simulation = false;
    v_bal := 0;
  ELSIF v_bal > 0 THEN
    PERFORM public.wallet_apply_change(
      v_uid,
      'debit'::public.wallet_txn_type,
      v_bal,
      'admin_adjustment'::public.wallet_ref_type,
      v_uid,
      'guest_convert_clear_demo',
      true
    );
  END IF;

  UPDATE public.wallets
     SET balance = 0, is_simulation = false, updated_at = now()
   WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'user_id', v_uid, 'cleared_demo', coalesce(v_bal, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_guest_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_guest_account(text) TO authenticated, service_role;

-- 2) League invite codes for create/join.
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS invite_code text;

UPDATE public.leagues
   SET invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 WHERE invite_code IS NULL;

ALTER TABLE public.leagues
  ALTER COLUMN invite_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leagues_invite_code_uidx ON public.leagues (invite_code);

-- Members can read co-members of leagues they belong to (for standings).
DROP POLICY IF EXISTS "league_members_read_own" ON public.league_members;
DROP POLICY IF EXISTS "Users view own league memberships" ON public.league_members;
DROP POLICY IF EXISTS "Members view league membership" ON public.league_members;
DROP POLICY IF EXISTS "Members view league memberships" ON public.league_members;
CREATE POLICY "league_members_read_co_members" ON public.league_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.league_members mine
      WHERE mine.league_id = league_members.league_id
        AND mine.user_id = auth.uid()
    )
  );

-- Service-role / SECURITY DEFINER server fns handle create/join inserts.
