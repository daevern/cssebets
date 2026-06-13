
REVOKE ALL ON FUNCTION public.place_market_bet_atomic(uuid,uuid,text,text,numeric,uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.place_market_bet_atomic(uuid,uuid,text,text,numeric,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.place_bet_atomic(uuid,uuid,prediction_market,text,numeric,numeric,uuid,numeric,uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.place_bet_atomic(uuid,uuid,prediction_market,text,numeric,numeric,uuid,numeric,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.update_platform_settings(uuid,numeric,numeric,numeric,numeric,boolean,boolean,boolean,boolean,numeric,text[],int) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(uuid,numeric,numeric,numeric,numeric,boolean,boolean,boolean,boolean,numeric,text[],int) TO service_role;
