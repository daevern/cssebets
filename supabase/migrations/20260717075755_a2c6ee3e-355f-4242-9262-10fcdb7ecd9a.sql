DROP INDEX IF EXISTS public.ufc_fights_apimma_fight_id_key;
ALTER TABLE public.ufc_fights ADD CONSTRAINT ufc_fights_apimma_fight_id_key UNIQUE (apimma_fight_id);