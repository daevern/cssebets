
REVOKE EXECUTE ON FUNCTION public.edit_sports_bet_stake(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_sports_bet(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_f1_race_bet_stake(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_f1_race_bet(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_f1_championship_bet_stake(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_f1_championship_bet(uuid,uuid) FROM PUBLIC, anon, authenticated;
