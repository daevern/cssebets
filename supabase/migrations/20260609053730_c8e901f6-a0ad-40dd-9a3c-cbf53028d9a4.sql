DELETE FROM public.predictions WHERE match_id IN (SELECT id FROM public.matches WHERE external_id LIKE 'demo-%');
DELETE FROM public.matches WHERE external_id LIKE 'demo-%' OR external_id IS NULL;