
-- 1. Fix audit_logs INSERT: enforce user_id = auth.uid()
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can insert own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 2. Fix leads SELECT for welders: scope to assigned projects only
DROP POLICY IF EXISTS "Welders can view leads" ON public.leads;
CREATE POLICY "Welders can view assigned project leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'welder'::app_role)
  AND is_in_bin = false
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.lead_id = leads.id
      AND p.assigned_welder_id = auth.uid()
  )
);

-- 3. Fix leads SELECT for electricians: scope to assigned projects only
DROP POLICY IF EXISTS "Electricians can view leads" ON public.leads;
CREATE POLICY "Electricians can view assigned project leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'electrician'::app_role)
  AND is_in_bin = false
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.lead_id = leads.id
      AND p.assigned_electrician_id = auth.uid()
  )
);

-- 4. Fix staff self-update: prevent modifying sensitive columns
DROP POLICY IF EXISTS "Staff can update own profile" ON public.staff;
CREATE POLICY "Staff can update own profile"
ON public.staff
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND temp_pin_hash IS NOT DISTINCT FROM (SELECT s.temp_pin_hash FROM public.staff s WHERE s.user_id = auth.uid())
  AND must_change_password IS NOT DISTINCT FROM (SELECT s.must_change_password FROM public.staff s WHERE s.user_id = auth.uid())
  AND pin_expiry IS NOT DISTINCT FROM (SELECT s.pin_expiry FROM public.staff s WHERE s.user_id = auth.uid())
  AND is_active IS NOT DISTINCT FROM (SELECT s.is_active FROM public.staff s WHERE s.user_id = auth.uid())
);

-- 5. Enable Realtime authorization for notifications
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
