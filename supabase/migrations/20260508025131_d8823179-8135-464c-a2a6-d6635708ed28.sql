
-- Allow sales persons to upload to projects they created (path: {projectId}/...)
CREATE POLICY "Sales persons can upload project documents they created"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.created_by_user_id = auth.uid()
  )
);

-- Allow operators to view (already exists for SELECT all) - ensure they can also see for review
-- Allow sales person SELECT for projects they created already exists.
