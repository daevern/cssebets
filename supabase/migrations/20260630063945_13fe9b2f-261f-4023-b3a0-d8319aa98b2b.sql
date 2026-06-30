
DROP POLICY IF EXISTS "Authenticated users can read page views" ON public.page_views;
CREATE POLICY "page_views_admin_read" ON public.page_views FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "platform_settings_admin_read" ON public.platform_settings;
CREATE POLICY "platform_settings_admin_read" ON public.platform_settings FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));
