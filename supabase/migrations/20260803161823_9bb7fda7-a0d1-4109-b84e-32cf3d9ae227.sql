UPDATE public.arcade_treasure_configurations
SET max_return = 1000000000, updated_at = now()
WHERE status = 'active';