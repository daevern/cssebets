
-- Set search_path on helpers/triggers that were missing it
ALTER FUNCTION public.csse_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.csse_token_tx_readonly_guard() SET search_path = public;
ALTER FUNCTION public.generate_referral_code() SET search_path = public;
ALTER FUNCTION public.profiles_assign_referral_code() SET search_path = public;
ALTER FUNCTION public.prevent_referral_field_change() SET search_path = public;
ALTER FUNCTION public.tg_referral_check_on_settle() SET search_path = public;

-- Revoke default PUBLIC execute on new SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.csse_credit_tokens(UUID, BIGINT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_referral_milestones(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.csse_grant_tokens_on_bet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.csse_clawback_tokens_on_void() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.csse_free_bet_settle_adjust() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_free_bet_atomic(UUID, UUID, UUID, prediction_market, TEXT, NUMERIC, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_adjust_referral(UUID, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_flag_referral(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_tokens(UUID, BIGINT, TEXT) FROM PUBLIC;

-- Re-grant execute where end users need it (via server functions with auth)
GRANT EXECUTE ON FUNCTION public.admin_adjust_referral(UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_flag_referral(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_tokens(UUID, BIGINT, TEXT) TO authenticated;
