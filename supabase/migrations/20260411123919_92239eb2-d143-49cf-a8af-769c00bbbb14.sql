
-- 1. Remove client INSERT policy on audit_logs
DROP POLICY IF EXISTS "Authenticated can insert own audit logs" ON public.audit_logs;

-- 2. Create trigger function for project status audit logging
CREATE OR REPLACE FUNCTION public.audit_project_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, old_value, new_value)
    VALUES (
      'project_status_update',
      'project',
      NEW.id::text,
      auth.uid(),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Create trigger on projects table
DROP TRIGGER IF EXISTS trg_audit_project_status ON public.projects;
CREATE TRIGGER trg_audit_project_status
AFTER UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.audit_project_status_change();

-- 4. Fix staff self-update policy - only allow full_name and last_login changes
DROP POLICY IF EXISTS "Staff can update own profile" ON public.staff;
CREATE POLICY "Staff can update own profile"
ON public.staff
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND user_id IS NOT DISTINCT FROM (SELECT s.user_id FROM staff s WHERE s.user_id = auth.uid())
  AND email IS NOT DISTINCT FROM (SELECT s.email FROM staff s WHERE s.user_id = auth.uid())
  AND mobile IS NOT DISTINCT FROM (SELECT s.mobile FROM staff s WHERE s.user_id = auth.uid())
  AND is_active IS NOT DISTINCT FROM (SELECT s.is_active FROM staff s WHERE s.user_id = auth.uid())
  AND must_change_password IS NOT DISTINCT FROM (SELECT s.must_change_password FROM staff s WHERE s.user_id = auth.uid())
  AND temp_pin_hash IS NOT DISTINCT FROM (SELECT s.temp_pin_hash FROM staff s WHERE s.user_id = auth.uid())
  AND pin_expiry IS NOT DISTINCT FROM (SELECT s.pin_expiry FROM staff s WHERE s.user_id = auth.uid())
);
