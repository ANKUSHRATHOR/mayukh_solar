DROP POLICY IF EXISTS "Admins can access all documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage all project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage project documents" ON storage.objects;
CREATE POLICY "Admins manage project documents"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Operators can download documents" ON storage.objects;
DROP POLICY IF EXISTS "Operators can view project documents" ON storage.objects;
DROP POLICY IF EXISTS "Operators read project-documents" ON storage.objects;
CREATE POLICY "Operators read project-documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.has_role(auth.uid(), 'operator'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff update own pending events same day" ON public.attendance_events;
CREATE POLICY "Staff update own pending events same day"
  ON public.attendance_events
  FOR UPDATE
  TO authenticated
  USING (
    staff_user_id = auth.uid()
    AND is_rejected = false
    AND rejected_by IS NULL
    AND rejected_at IS NULL
    AND rejection_reason IS NULL
    AND captured_at::date = CURRENT_DATE
  )
  WITH CHECK (
    staff_user_id = auth.uid()
    AND is_rejected = false
    AND rejected_by IS NULL
    AND rejected_at IS NULL
    AND rejection_reason IS NULL
    AND captured_at::date = CURRENT_DATE
  );