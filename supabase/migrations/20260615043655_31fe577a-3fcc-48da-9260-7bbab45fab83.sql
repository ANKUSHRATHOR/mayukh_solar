-- Backfill staff row for auth user that lost its staff record after a previous hard-delete.
-- The admin already created an auth user + role for mobile 9251157546 but the staff row
-- was missing, so the person did not appear in the Staff tab.
INSERT INTO public.staff (user_id, full_name, mobile, is_active, must_change_password)
SELECT '55e08867-cb80-4581-9163-215f41b8cfe3'::uuid,
       'Staff 9251157546', '9251157546', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff WHERE user_id = '55e08867-cb80-4581-9163-215f41b8cfe3'::uuid
);