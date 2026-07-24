-- Allow authenticated staff members (admins, operators, salespersons) to manage quotation documents under the 'quotations/' folder prefix in the 'project-documents' storage bucket.
DROP POLICY IF EXISTS "Staff manage quotations in storage" ON storage.objects;
CREATE POLICY "Staff manage quotations in storage" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] = 'quotations'
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] = 'quotations'
  );
