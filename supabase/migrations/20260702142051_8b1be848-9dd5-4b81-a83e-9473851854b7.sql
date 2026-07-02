
-- 1) Restrict geofence coordinates to admins only
DROP POLICY IF EXISTS "Staff read active geofences" ON public.attendance_geofences;

-- 2) Remove direct INSERT policy so punch-out requests must go through request_special_punch_out() RPC
DROP POLICY IF EXISTS "Sales insert own punch_out_requests" ON public.punch_out_requests;

-- 3) Prevent plaintext temp password exposure via table SELECT.
-- Admins retrieve temp passwords via admin_list_temp_passwords() SECURITY DEFINER RPC.
REVOKE SELECT (temp_password_plain, temp_password_issued_at, temp_password_issued_by)
  ON public.staff FROM authenticated;
REVOKE SELECT (temp_password_plain, temp_password_issued_at, temp_password_issued_by)
  ON public.staff FROM anon;
