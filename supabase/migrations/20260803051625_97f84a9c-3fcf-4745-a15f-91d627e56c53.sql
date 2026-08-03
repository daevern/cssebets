UPDATE public.arcade_rps_configurations
SET maintenance_mode = false,
    announcement = NULL,
    updated_at = now()
WHERE status = 'active';