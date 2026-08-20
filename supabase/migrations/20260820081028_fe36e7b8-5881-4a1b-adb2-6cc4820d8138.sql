REVOKE ALL ON FUNCTION public.bonus_active_campaign() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bonus_user_is_valid(uuid, public.bonus_campaigns) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bonus_user_is_approved(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallets_bonus_split() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bonus_profile_slot_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_ctx() FROM PUBLIC, anon, authenticated;