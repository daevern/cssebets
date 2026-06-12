
REVOKE EXECUTE ON FUNCTION public.edit_pending_bet_stake(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_pending_bet(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_pending_bet_stake(uuid, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pending_bet(uuid, uuid) TO service_role;
