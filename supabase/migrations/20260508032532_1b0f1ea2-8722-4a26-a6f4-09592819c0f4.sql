
-- Broaden documents table access for sales persons
DROP POLICY IF EXISTS "Sales persons can manage own project documents" ON public.documents;
DROP POLICY IF EXISTS "Sales persons can view project documents" ON public.documents;

CREATE POLICY "Sales persons can view all documents"
ON public.documents FOR SELECT
USING (has_role(auth.uid(), 'sales_person'::app_role));

CREATE POLICY "Sales persons can insert documents"
ON public.documents FOR INSERT
WITH CHECK (has_role(auth.uid(), 'sales_person'::app_role) AND uploaded_by_user_id = auth.uid());

CREATE POLICY "Sales persons can update documents"
ON public.documents FOR UPDATE
USING (has_role(auth.uid(), 'sales_person'::app_role));

CREATE POLICY "Sales persons can delete documents"
ON public.documents FOR DELETE
USING (has_role(auth.uid(), 'sales_person'::app_role));

-- Storage policies: allow any sales person to upload/view in project-documents bucket
DROP POLICY IF EXISTS "Sales persons can upload project documents" ON storage.objects;
DROP POLICY IF EXISTS "Sales upload to own project folders" ON storage.objects;
DROP POLICY IF EXISTS "Sales can view project documents" ON storage.objects;
DROP POLICY IF EXISTS "Sales can update project documents" ON storage.objects;

CREATE POLICY "Sales can upload to project-documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-documents' AND has_role(auth.uid(), 'sales_person'::app_role));

CREATE POLICY "Sales can view project-documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-documents' AND has_role(auth.uid(), 'sales_person'::app_role));

CREATE POLICY "Sales can update project-documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'project-documents' AND has_role(auth.uid(), 'sales_person'::app_role));
