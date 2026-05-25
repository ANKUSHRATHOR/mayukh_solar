
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- Seed the internal push secret (matches the INTERNAL_PUSH_SECRET edge-function env var)
INSERT INTO private.app_config(key, value)
VALUES ('internal_push_secret', '16643838d569a441642dd81c81b82fc271ba276990531e9644c94f53db7f84e0')
ON CONFLICT (key) DO NOTHING;

-- Lock down the table: no role except postgres / SECURITY DEFINER can access
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.app_config FROM PUBLIC, anon, authenticated;

-- Update the trigger to forward the secret as Authorization header
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  fn_url text := 'https://yuaehplccjzsahckdhvc.supabase.co/functions/v1/send-push';
  push_on boolean;
  secret text;
BEGIN
  SELECT push_enabled INTO push_on
    FROM public.notification_preferences WHERE user_id = NEW.user_id;
  IF push_on IS NOT NULL AND push_on = false THEN
    RETURN NEW;
  END IF;

  SELECT value INTO secret FROM private.app_config WHERE key = 'internal_push_secret';

  PERFORM extensions.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(secret, '')
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'entity_type', NEW.entity_type,
      'entity_id', NEW.entity_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;
