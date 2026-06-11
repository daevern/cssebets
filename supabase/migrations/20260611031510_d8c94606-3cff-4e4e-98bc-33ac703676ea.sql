
CREATE OR REPLACE FUNCTION public.set_house_user(p_admin_id UUID, p_house_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
BEGIN
  IF NOT private.has_role(p_admin_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'super_admin only';
  END IF;
  IF p_house_user_id IS NULL THEN
    RAISE EXCEPTION 'house user required';
  END IF;
  INSERT INTO public.wallets(user_id) VALUES (p_house_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.platform_bankroll
     SET house_user_id = p_house_user_id, updated_at = now()
   WHERE id = 1;
  RETURN p_house_user_id;
END $$;
