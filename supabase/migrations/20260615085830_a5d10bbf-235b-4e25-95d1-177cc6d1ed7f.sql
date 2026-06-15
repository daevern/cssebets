
REVOKE EXECUTE ON FUNCTION public.mark_tour_complete(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_onboarding_complete() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_onboarding_skipped() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_onboarding_event(text, text, int, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reset_onboarding(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_onboarding_enabled(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_global_onboarding(boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_onboarding_completion_stats() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mark_tour_complete(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_onboarding_complete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_onboarding_skipped() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_onboarding_event(text, text, int, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_onboarding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_onboarding_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_global_onboarding(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_onboarding_completion_stats() TO authenticated;
