
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,int,int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_betting_allowed(uuid,uuid,text,numeric,boolean) FROM anon, authenticated;
