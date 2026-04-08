
-- Fix notifications INSERT policy: restrict to own user_id only
DROP POLICY IF EXISTS "Users can only insert own notifications" ON public.notifications;
CREATE POLICY "Users can only insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Fix storage policies for sales persons: add path ownership
DROP POLICY IF EXISTS "Sales persons can view own uploads" ON storage.objects;
CREATE POLICY "Sales persons can view own uploads"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Sales persons can update own uploads" ON storage.objects;
CREATE POLICY "Sales persons can update own uploads"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Sales persons can upload documents" ON storage.objects;
CREATE POLICY "Sales persons can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);
