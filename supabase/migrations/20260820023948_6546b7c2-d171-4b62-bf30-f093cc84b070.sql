select cron.schedule(
  'purge-stale-guests-hourly',
  '25 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/purge-guests?hours=48&limit=300',
    headers := '{"Content-Type":"application/json","x-cron-secret":"666828f8306db9a74bafcaa4d06ec0064bbfa1fcd2ad20a2"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);