
-- Extend UFC head-to-head to also store recent-form (per-fighter) rows.
ALTER TABLE public.ufc_fight_h2h
  ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS fighter_slot text,
  ADD COLUMN IF NOT EXISTS opponent_name text,
  ADD COLUMN IF NOT EXISTS is_win boolean;

-- record_type: 'direct' | 'form_a' | 'form_b'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ufc_fight_h2h_record_type_chk'
  ) THEN
    ALTER TABLE public.ufc_fight_h2h
      ADD CONSTRAINT ufc_fight_h2h_record_type_chk
      CHECK (record_type IN ('direct','form_a','form_b'));
  END IF;
END$$;

-- Allow multiple rows per past_fight_apimma_id when record_type differs; add composite unique.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ufc_fight_h2h_fight_id_past_fight_apimma_id_key'
  ) THEN
    ALTER TABLE public.ufc_fight_h2h
      DROP CONSTRAINT ufc_fight_h2h_fight_id_past_fight_apimma_id_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ufc_fight_h2h_unique_key'
  ) THEN
    ALTER TABLE public.ufc_fight_h2h
      ADD CONSTRAINT ufc_fight_h2h_unique_key
      UNIQUE (fight_id, record_type, past_fight_apimma_id);
  END IF;
END$$;
