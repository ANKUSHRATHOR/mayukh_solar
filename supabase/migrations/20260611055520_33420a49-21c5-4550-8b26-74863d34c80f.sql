
-- 1) salary_runs: allow each staff member to read their own runs
CREATE POLICY "Staff can view own salary runs"
  ON public.salary_runs
  FOR SELECT
  TO authenticated
  USING (staff_user_id = auth.uid());

-- 2) vendor_profiles: allow operators (who build quotations) to read
CREATE POLICY "Operators can view vendor profiles"
  ON public.vendor_profiles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'::app_role));

-- 3) Split the broad ALL attendance-media policy into per-command policies,
--    all still scoped to the owner's own folder.
DROP POLICY IF EXISTS "Staff manage own attendance media" ON storage.objects;

CREATE POLICY "Staff insert own attendance media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Staff read own attendance media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attendance-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Staff update own attendance media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attendance-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'attendance-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Staff delete own attendance media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attendance-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
