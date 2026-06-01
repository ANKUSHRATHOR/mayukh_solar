-- 1) Vendor bank accounts: admins only for SELECT
DROP POLICY IF EXISTS "Admin/operator read bank accounts" ON public.vendor_bank_accounts;
CREATE POLICY "Admin read bank accounts"
  ON public.vendor_bank_accounts
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Attendance events: add WITH CHECK so staff can't change ownership or rejection fields
DROP POLICY IF EXISTS "Staff update own pending events same day" ON public.attendance_events;
CREATE POLICY "Staff update own pending events same day"
  ON public.attendance_events
  FOR UPDATE
  USING (
    staff_user_id = auth.uid()
    AND is_rejected = false
    AND (captured_at)::date = CURRENT_DATE
  )
  WITH CHECK (
    staff_user_id = auth.uid()
    AND is_rejected = false
    AND rejected_by IS NULL
    AND rejected_at IS NULL
    AND rejection_reason IS NULL
  );
