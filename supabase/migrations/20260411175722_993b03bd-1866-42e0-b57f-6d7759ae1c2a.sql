-- 1. Remove client INSERT on notifications (triggers handle all inserts)
DROP POLICY IF EXISTS "Users can only insert own notifications" ON public.notifications;

-- 2. Sales person storage DELETE policy
CREATE POLICY "Sales persons can delete own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);