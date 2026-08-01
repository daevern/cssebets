DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT j.id, w.id AS wtx
      FROM public.accounting_journals j
      JOIN public.wallet_transactions w
        ON w.accounting_journal_id = j.id
     WHERE j.journal_type = 'LEGACY_BACKFILL_REFERENCE'
       AND j.status = 'POSTED'
       AND EXISTS (
         SELECT 1 FROM public.accounting_journals n
          WHERE n.reference_id = j.reference_id
            AND n.journal_type <> 'LEGACY_BACKFILL_REFERENCE'
            AND n.status = 'POSTED')
  LOOP
    PERFORM public.accounting_reverse_journal(
      r.id,
      'duplicate of native product journal (bridge double-count)'::text,
      ('reverse-dup:' || r.id::text)::text,
      NULL::uuid,
      NULL::uuid);
    UPDATE public.wallet_transactions
       SET accounting_sync_status = 'SKIPPED',
           accounting_sync_error = 'already journalled natively (dual-write product)',
           accounting_journal_id = NULL,
           accounting_synced_at = now()
     WHERE id = r.wtx;
  END LOOP;
END
$do$;