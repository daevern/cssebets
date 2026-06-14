
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS admin_alert_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS critical_alert_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_alert_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_suppression_window_minutes integer NOT NULL DEFAULT 60;
