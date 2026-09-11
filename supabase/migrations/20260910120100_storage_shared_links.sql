-- Sharing a document with the customer.
--
-- Documents now live in Google Drive, private to the company account and read
-- only through the `drive-storage` edge function, which re-checks the caller
-- against RLS. That is the right default for a customer's Aadhaar -- but it
-- leaves no URL a customer could open, and operators do legitimately send
-- people their own bill or invoice over WhatsApp.
--
-- Rather than making the Drive file link-shareable (which on a personal Google
-- account cannot be given an expiry and so is permanent until someone
-- remembers to revoke it), a share copies the bytes to a `shared/` prefix here
-- and hands out a signed URL that expires on its own.
--
-- Scoped the same way as the existing quotations policy: staff can manage the
-- prefix, nobody unauthenticated can read it, and the copy is disposable.

DROP POLICY IF EXISTS "Staff manage shared document copies" ON storage.objects;
CREATE POLICY "Staff manage shared document copies" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] = 'shared'
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] = 'shared'
  );
