
-- Incidents
CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('wallet','settlement','odds','point_requests','payouts','support','security','other')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  title text NOT NULL,
  notes text,
  resolution_summary text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidents service only" ON public.incidents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX incidents_status_idx ON public.incidents(status, created_at DESC);
CREATE INDEX incidents_severity_idx ON public.incidents(severity, created_at DESC);

-- Operational alerts
CREATE TABLE public.operational_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('info','warning','critical')),
  category text NOT NULL,
  title text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.operational_alerts TO service_role;
ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts service only" ON public.operational_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX op_alerts_status_idx ON public.operational_alerts(status, created_at DESC);
CREATE INDEX op_alerts_level_idx ON public.operational_alerts(level, created_at DESC);

-- Health check runs
CREATE TABLE public.health_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','degraded','failed')),
  duration_ms integer NOT NULL DEFAULT 0,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.health_check_runs TO service_role;
ALTER TABLE public.health_check_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health runs service only" ON public.health_check_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX health_runs_name_idx ON public.health_check_runs(check_name, created_at DESC);
CREATE INDEX health_runs_created_idx ON public.health_check_runs(created_at DESC);

-- updated_at trigger reused
CREATE TRIGGER incidents_touch BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
