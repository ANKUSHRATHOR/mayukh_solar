
-- 1. Allow telecallers to update their own leads (assignment, status, notes)
CREATE POLICY "Telecallers can update own leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'telecaller'::app_role)
  AND created_by_user_id = auth.uid()
  AND is_in_bin = false
)
WITH CHECK (
  has_role(auth.uid(), 'telecaller'::app_role)
  AND created_by_user_id = auth.uid()
);

-- 2. SECURITY DEFINER helper: list active sales persons for assignment dropdown
CREATE OR REPLACE FUNCTION public.get_assignable_sales_persons()
RETURNS TABLE(user_id uuid, full_name text, mobile text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, s.full_name, s.mobile, s.email
  FROM public.staff s
  JOIN public.user_roles ur ON ur.user_id = s.user_id
  WHERE ur.role = 'sales_person'::app_role
    AND s.is_active = true
  ORDER BY s.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignable_sales_persons() TO authenticated;

-- 3. SECURITY DEFINER helper: fetch a single staff member's public details by user_id
CREATE OR REPLACE FUNCTION public.get_staff_public(_user_id uuid)
RETURNS TABLE(user_id uuid, full_name text, mobile text, email text, role app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, s.full_name, s.mobile, s.email,
         (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = s.user_id LIMIT 1) AS role
  FROM public.staff s
  WHERE s.user_id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_public(uuid) TO authenticated;

-- 4. Storage RLS for the project-documents bucket so operators/admins/sales can preview & download
CREATE POLICY "Admins manage all project-documents"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'project-documents' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'project-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Operators read project-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'project-documents' AND has_role(auth.uid(), 'operator'::app_role));

CREATE POLICY "Sales read project-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'project-documents' AND has_role(auth.uid(), 'sales_person'::app_role));

CREATE POLICY "Sales upload project-documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-documents' AND has_role(auth.uid(), 'sales_person'::app_role));

CREATE POLICY "Sales update project-documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'project-documents' AND has_role(auth.uid(), 'sales_person'::app_role))
WITH CHECK (bucket_id = 'project-documents' AND has_role(auth.uid(), 'sales_person'::app_role));

-- 5. Re-attach push notification dispatch trigger (function existed but trigger was missing)
DROP TRIGGER IF EXISTS dispatch_push_after_notification ON public.notifications;
CREATE TRIGGER dispatch_push_after_notification
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_push_on_notification();

-- 6. Re-attach existing notification triggers if missing (idempotent)
DROP TRIGGER IF EXISTS notify_lead_assigned_trigger ON public.leads;
CREATE TRIGGER notify_lead_assigned_trigger
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.notify_lead_assigned();

DROP TRIGGER IF EXISTS notify_worker_assigned_trigger ON public.projects;
CREATE TRIGGER notify_worker_assigned_trigger
AFTER UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.notify_worker_assigned();

DROP TRIGGER IF EXISTS notify_project_status_change_trigger ON public.projects;
CREATE TRIGGER notify_project_status_change_trigger
AFTER UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.notify_project_status_change();

DROP TRIGGER IF EXISTS notify_document_rejected_trigger ON public.documents;
CREATE TRIGGER notify_document_rejected_trigger
AFTER UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.notify_document_rejected();
