
-- Helper: can current sales person access this project's documents?
CREATE OR REPLACE FUNCTION public.sales_can_access_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_role(auth.uid(), 'sales_person'::app_role)
     AND EXISTS (
       SELECT 1
       FROM public.projects p
       LEFT JOIN public.leads l ON l.id = p.lead_id
       WHERE p.id = _project_id
         AND (
           p.assigned_sales_person_id = auth.uid()
           OR l.assigned_to_user_id   = auth.uid()
           OR l.created_by_user_id    = auth.uid()
           OR p.created_by_user_id    = auth.uid()
         )
     );
$$;

GRANT EXECUTE ON FUNCTION public.sales_can_access_project(uuid) TO authenticated;

-- ===== public.documents policies (replace sales-specific ones) =====
DROP POLICY IF EXISTS "Sales persons can view assigned project documents"  ON public.documents;
DROP POLICY IF EXISTS "Sales persons can insert assigned project documents" ON public.documents;
DROP POLICY IF EXISTS "Sales persons can update assigned project documents" ON public.documents;
DROP POLICY IF EXISTS "Sales persons can delete assigned project documents" ON public.documents;

CREATE POLICY "Sales can view project docs"
  ON public.documents FOR SELECT TO authenticated
  USING (public.sales_can_access_project(project_id));

CREATE POLICY "Sales can insert project docs"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by_user_id = auth.uid() AND public.sales_can_access_project(project_id));

CREATE POLICY "Sales can update project docs"
  ON public.documents FOR UPDATE TO authenticated
  USING (public.sales_can_access_project(project_id))
  WITH CHECK (public.sales_can_access_project(project_id));

CREATE POLICY "Sales can delete project docs"
  ON public.documents FOR DELETE TO authenticated
  USING (public.sales_can_access_project(project_id));

-- ===== storage.objects policies for project-documents bucket =====
DROP POLICY IF EXISTS "Assigned sales upload project docs (path-scoped)" ON storage.objects;
DROP POLICY IF EXISTS "Assigned sales view project docs (path-scoped)"   ON storage.objects;
DROP POLICY IF EXISTS "Assigned sales update project docs (path-scoped)" ON storage.objects;
DROP POLICY IF EXISTS "Assigned sales delete project docs (path-scoped)" ON storage.objects;

CREATE POLICY "Sales upload project docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND public.sales_can_access_project(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Sales view project docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.sales_can_access_project(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Sales update project docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.sales_can_access_project(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'project-documents'
    AND public.sales_can_access_project(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Sales delete project docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.sales_can_access_project(((storage.foldername(name))[1])::uuid)
  );
