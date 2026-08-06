INSERT INTO public.accounting_migration_flag_envs(product, environment, journal_enabled, dual_write, liability_enforced, capacity_enforced, notes)
VALUES ('football','PRODUCTION', true, true, true, true, 'Phase B step 4 - production cutover to unified journal'),
       ('f1','PRODUCTION',       true, true, true, true, 'Phase B step 4 - production cutover to unified journal'),
       ('ufc','PRODUCTION',      true, true, true, true, 'Phase B step 4 - production cutover to unified journal')
ON CONFLICT (product, environment) DO UPDATE
  SET journal_enabled = excluded.journal_enabled,
      dual_write = excluded.dual_write,
      liability_enforced = excluded.liability_enforced,
      capacity_enforced = excluded.capacity_enforced,
      notes = excluded.notes;

UPDATE public.accounting_liability_reservations
   SET counts_toward_available = true, updated_at = now()
 WHERE environment = 'PRODUCTION' AND status = 'ACTIVE'
   AND product IN ('football','f1','ufc') AND counts_toward_available = false;