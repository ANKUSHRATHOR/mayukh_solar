-- Backfill staff row for auth user that lost its staff record after a previous hard-delete.
-- The admin already created an auth user + role for mobile 9251157546 but the staff row
-- was missing, so the person did not appear in the Staff tab.
--
-- Now also guarded on the auth user existing. This was a repair for one specific
-- row on the original project; on a fresh project that auth user is never
-- created (its seeding migration only set a password that is public in git
-- history), so the unguarded insert violated staff_user_id_fkey.
INSERT INTO public.staff (user_id, full_name, mobile, is_active, must_change_password)
SELECT '55e08867-cb80-4581-9163-215f41b8cfe3'::uuid,
       'Staff 9251157546', '9251157546', true, true
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '55e08867-cb80-4581-9163-215f41b8cfe3'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM public.staff WHERE user_id = '55e08867-cb80-4581-9163-215f41b8cfe3'::uuid
);
