
-- 1. Add assigned_sales_person_id to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS assigned_sales_person_id uuid;

UPDATE public.projects
  SET assigned_sales_person_id = created_by_user_id
  WHERE assigned_sales_person_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_assigned_sales_person
  ON public.projects(assigned_sales_person_id);

-- 2. Replace sales policies on projects (assignment based)
DROP POLICY IF EXISTS "Sales persons can view their projects" ON public.projects;
DROP POLICY IF EXISTS "Sales persons can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Sales persons can create projects" ON public.projects;

CREATE POLICY "Sales persons can view assigned projects"
ON public.projects FOR SELECT
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND assigned_sales_person_id = auth.uid()
);

CREATE POLICY "Sales persons can update assigned projects"
ON public.projects FOR UPDATE
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND assigned_sales_person_id = auth.uid()
);

CREATE POLICY "Sales persons can create projects"
ON public.projects FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND created_by_user_id = auth.uid()
  AND assigned_sales_person_id = auth.uid()
);

-- 3. Replace sales policies on documents (must own assigned project)
DROP POLICY IF EXISTS "Sales persons can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Sales persons can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Sales persons can update documents" ON public.documents;
DROP POLICY IF EXISTS "Sales persons can delete documents" ON public.documents;

CREATE POLICY "Sales persons can view assigned project documents"
ON public.documents FOR SELECT
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = documents.project_id
      AND p.assigned_sales_person_id = auth.uid()
  )
);

CREATE POLICY "Sales persons can insert assigned project documents"
ON public.documents FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND uploaded_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = documents.project_id
      AND p.assigned_sales_person_id = auth.uid()
  )
);

CREATE POLICY "Sales persons can update assigned project documents"
ON public.documents FOR UPDATE
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = documents.project_id
      AND p.assigned_sales_person_id = auth.uid()
  )
);

CREATE POLICY "Sales persons can delete assigned project documents"
ON public.documents FOR DELETE
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = documents.project_id
      AND p.assigned_sales_person_id = auth.uid()
  )
);

-- 4. Tighten sales policies on leads (only assigned sales person)
DROP POLICY IF EXISTS "Sales persons can view leads" ON public.leads;
DROP POLICY IF EXISTS "Sales persons can update leads" ON public.leads;

CREATE POLICY "Sales persons can view assigned leads"
ON public.leads FOR SELECT
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND is_in_bin = false
  AND assigned_to_user_id = auth.uid()
);

CREATE POLICY "Sales persons can update assigned leads"
ON public.leads FOR UPDATE
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND is_in_bin = false
  AND assigned_to_user_id = auth.uid()
);

-- 5. Tighten sales policies on quotations
DROP POLICY IF EXISTS "Sales persons can view own project quotations" ON public.quotations;
DROP POLICY IF EXISTS "Sales persons can create quotations" ON public.quotations;

CREATE POLICY "Sales persons can view assigned project quotations"
ON public.quotations FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = quotations.project_id
      AND p.assigned_sales_person_id = auth.uid()
  )
);

CREATE POLICY "Sales persons can create assigned project quotations"
ON public.quotations FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'sales_person'::app_role)
  AND created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = quotations.project_id
      AND p.assigned_sales_person_id = auth.uid()
  )
);

-- 6. Storage policies: sales can only manage objects in projects they're assigned to
DROP POLICY IF EXISTS "Sales can upload to project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Sales can view project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Sales can update project-documents" ON storage.objects;

-- Folder structure may use either project_id or quotation_number as the first segment.
-- Allow sales if they are assigned to ANY active project (file mapping enforced by documents table RLS).
CREATE POLICY "Assigned sales can upload project documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.assigned_sales_person_id = auth.uid()
  )
);

CREATE POLICY "Assigned sales can view project documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.assigned_sales_person_id = auth.uid()
  )
);

CREATE POLICY "Assigned sales can update project documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'project-documents'
  AND has_role(auth.uid(), 'sales_person'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.assigned_sales_person_id = auth.uid()
  )
);
