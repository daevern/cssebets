
REVOKE EXECUTE ON FUNCTION public.generate_public_reference() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_public_reference_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_point_request_public_reference() FROM PUBLIC, anon, authenticated;
