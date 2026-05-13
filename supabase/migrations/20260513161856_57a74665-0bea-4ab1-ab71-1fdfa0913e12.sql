-- 1. New assignment columns for telecaller and operator
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS assigned_telecaller_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_operator_id uuid;

-- 2. RLS for telecaller / operator on projects (additive)
DROP POLICY IF EXISTS "Telecallers view assigned projects" ON public.projects;
CREATE POLICY "Telecallers view assigned projects" ON public.projects
  FOR SELECT
  USING (has_role(auth.uid(),'telecaller'::app_role) AND assigned_telecaller_id = auth.uid());

DROP POLICY IF EXISTS "Telecallers update assigned projects" ON public.projects;
CREATE POLICY "Telecallers update assigned projects" ON public.projects
  FOR UPDATE
  USING (has_role(auth.uid(),'telecaller'::app_role) AND assigned_telecaller_id = auth.uid())
  WITH CHECK (has_role(auth.uid(),'telecaller'::app_role) AND assigned_telecaller_id = auth.uid());

-- 3. Fix sales-person UPDATE on leads (add WITH CHECK)
DROP POLICY IF EXISTS "Sales persons can update assigned leads" ON public.leads;
CREATE POLICY "Sales persons can update assigned leads" ON public.leads
  FOR UPDATE
  USING (has_role(auth.uid(),'sales_person'::app_role) AND is_in_bin = false AND assigned_to_user_id = auth.uid())
  WITH CHECK (has_role(auth.uid(),'sales_person'::app_role) AND assigned_to_user_id = auth.uid());

-- 4. Fix sales-person UPDATE on projects (add WITH CHECK)
DROP POLICY IF EXISTS "Sales persons can update assigned projects" ON public.projects;
CREATE POLICY "Sales persons can update assigned projects" ON public.projects
  FOR UPDATE
  USING (has_role(auth.uid(),'sales_person'::app_role) AND assigned_sales_person_id = auth.uid())
  WITH CHECK (has_role(auth.uid(),'sales_person'::app_role) AND assigned_sales_person_id = auth.uid());

-- 5. Storage policies for operators on project-documents bucket
DROP POLICY IF EXISTS "Operators can view project documents" ON storage.objects;
CREATE POLICY "Operators can view project documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents' AND has_role(auth.uid(),'operator'::app_role));

DROP POLICY IF EXISTS "Admins manage project documents" ON storage.objects;
CREATE POLICY "Admins manage project documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'project-documents' AND has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (bucket_id = 'project-documents' AND has_role(auth.uid(),'admin'::app_role));