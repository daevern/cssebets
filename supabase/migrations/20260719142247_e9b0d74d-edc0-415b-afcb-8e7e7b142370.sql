
SELECT cron.unschedule('f1-live-1min') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'f1-live-1min'
);
SELECT cron.schedule(
  'f1-live-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--9a7d8431-a21b-4be7-aa5c-77435c44e420.lovable.app/api/public/hooks/f1-live',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zanZhZ29ldWF3bHlibnZicnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODgwNjAsImV4cCI6MjA5NjQ2NDA2MH0.vglzd_dDRiPdCt5RHfMqANGiSy7NvSXwr0jFJMRqxv0'
    ),
    body := '{}'::jsonb
  );
  $$
);
