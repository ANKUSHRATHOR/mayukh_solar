
-- Recreate staff update policy without sensitive columns, then drop them
DROP POLICY IF EXISTS "Staff can update own profile" ON public.staff;

ALTER TABLE public.staff DROP COLUMN IF EXISTS temp_password_plain;
ALTER TABLE public.staff DROP COLUMN IF EXISTS temp_pin_hash;
ALTER TABLE public.staff DROP COLUMN IF EXISTS pin_expiry;
ALTER TABLE public.staff DROP COLUMN IF EXISTS temp_password_issued_at;
ALTER TABLE public.staff DROP COLUMN IF EXISTS temp_password_issued_by;

CREATE POLICY "Staff can update own profile" ON public.staff
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND email IS NOT DISTINCT FROM (SELECT s.email FROM public.staff s WHERE s.user_id = auth.uid())
    AND mobile IS NOT DISTINCT FROM (SELECT s.mobile FROM public.staff s WHERE s.user_id = auth.uid())
    AND is_active IS NOT DISTINCT FROM (SELECT s.is_active FROM public.staff s WHERE s.user_id = auth.uid())
    AND must_change_password IS NOT DISTINCT FROM (SELECT s.must_change_password FROM public.staff s WHERE s.user_id = auth.uid())
  );

-- staff_performance admin check
CREATE OR REPLACE FUNCTION public.staff_performance(_from date, _to date)
 RETURNS TABLE(user_id uuid, full_name text, role app_role, leads_created bigint, leads_assigned bigint, projects_completed bigint, present_days bigint, absent_days bigint, attendance_pct numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  SELECT s.user_id, s.full_name,
         (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = s.user_id LIMIT 1),
         (SELECT COUNT(*) FROM public.leads l WHERE l.created_by_user_id = s.user_id AND l.created_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.leads l WHERE l.assigned_to_user_id = s.user_id AND l.created_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.projects p WHERE p.assigned_sales_person_id = s.user_id AND p.status = 'project_completed'::project_status AND p.updated_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status IN ('present','late') AND a.date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status = 'absent' AND a.date BETWEEN _from AND _to),
         CASE WHEN (_to - _from + 1) > 0
              THEN ROUND(100.0 * (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status IN ('present','late','half_day') AND a.date BETWEEN _from AND _to) / (_to - _from + 1), 1)
              ELSE 0 END
  FROM public.staff s WHERE s.is_active = true ORDER BY s.full_name;
END;
$function$;

-- Vendor profile / bank accounts: restrict to admin/operator
DROP POLICY IF EXISTS "Staff read default vendor" ON public.vendor_profiles;
CREATE POLICY "Admin/operator read vendor profiles" ON public.vendor_profiles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role));

DROP POLICY IF EXISTS "Staff read active bank accounts" ON public.vendor_bank_accounts;
CREATE POLICY "Admin/operator read bank accounts" ON public.vendor_bank_accounts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'operator'::app_role));

-- user_roles: scope policies to authenticated
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Storage: remove broad sales policies; tighten assignment-scoped policies to require folder-path match
DROP POLICY IF EXISTS "Sales read project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Sales upload project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Sales update project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Assigned sales can upload project documents" ON storage.objects;
DROP POLICY IF EXISTS "Assigned sales can view project documents" ON storage.objects;
DROP POLICY IF EXISTS "Assigned sales can update project documents" ON storage.objects;

CREATE POLICY "Assigned sales view project docs (path-scoped)" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND has_role(auth.uid(),'sales_person'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.assigned_sales_person_id = auth.uid()
        AND p.id::text = (storage.foldername(objects.name))[1]
    )
  );

CREATE POLICY "Assigned sales upload project docs (path-scoped)" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND has_role(auth.uid(),'sales_person'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.assigned_sales_person_id = auth.uid()
        AND p.id::text = (storage.foldername(objects.name))[1]
    )
  );

CREATE POLICY "Assigned sales update project docs (path-scoped)" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND has_role(auth.uid(),'sales_person'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.assigned_sales_person_id = auth.uid()
        AND p.id::text = (storage.foldername(objects.name))[1]
    )
  );
