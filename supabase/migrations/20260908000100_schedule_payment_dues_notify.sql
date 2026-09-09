-- Daily overdue-payment reminder.
--
-- Schedules the `notify-payment-dues` edge function at 09:30 IST (04:00 UTC),
-- which is early enough to act on and late enough that the previous day's
-- collections are already logged.
--
-- Guarded rather than assumed: pg_cron and pg_net are opt-in on Supabase, and a
-- migration that hard-fails on a project without them would block every later
-- migration. If this block skips, the function still works — trigger it from any
-- external scheduler with a POST carrying the INTERNAL_PUSH_SECRET as a bearer
-- token, or run it by hand from the Supabase dashboard.
--
-- Needs two settings on the database before the job can authenticate:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<ref>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.internal_push_secret = '<INTERNAL_PUSH_SECRET>';
-- The same secret send-push already accepts from DB triggers.

DO $$
DECLARE
  have_cron boolean;
  have_net  boolean;
  base_url  text;
  secret    text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO have_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')  INTO have_net;

  IF NOT (have_cron AND have_net) THEN
    RAISE NOTICE
      'pg_cron/pg_net not installed — skipping the payment dues schedule. Trigger notify-payment-dues from an external scheduler instead.';
    RETURN;
  END IF;

  base_url := current_setting('app.settings.supabase_url', true);
  secret   := current_setting('app.settings.internal_push_secret', true);

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE
      'app.settings.supabase_url / app.settings.internal_push_secret are unset — skipping the payment dues schedule.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('notify-payment-dues')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-payment-dues');

  PERFORM cron.schedule(
    'notify-payment-dues',
    '0 4 * * *',
    format(
      $job$SELECT net.http_post(
             url     := %L,
             headers := jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', %L
                        ),
             body    := '{}'::jsonb
           );$job$,
      base_url || '/functions/v1/notify-payment-dues',
      'Bearer ' || secret
    )
  );
END $$;
