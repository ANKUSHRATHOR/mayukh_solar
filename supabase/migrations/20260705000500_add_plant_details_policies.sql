-- REDESIGN AND FEATURE ADDITIONS MIGRATION — part 2 of 2
--
-- Split out of 20260705000000 so that 'visit_created' is added to the
-- lead_status enum in a committed transaction before these policies reference
-- it. Postgres rejects "unsafe use of new value" otherwise (SQLSTATE 55P04).
--
-- A sales person sees leads they created, leads assigned to them, or any lead
-- sitting at 'visit_created' — the shared pool of booked visits.

DROP POLICY IF EXISTS "Sales persons can view assigned leads" ON public.leads;
DROP POLICY IF EXISTS "Sales persons can view created leads" ON public.leads;
DROP POLICY IF EXISTS "Sales persons can view authorized leads" ON public.leads;

CREATE POLICY "Sales persons can view authorized leads"
ON public.leads FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'sales_person'::app_role) AND is_in_bin = false AND (
    created_by_user_id = auth.uid()
    OR assigned_to_user_id = auth.uid()
    OR status = 'visit_created'
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'telecaller'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
);

DROP POLICY IF EXISTS "Sales persons can update assigned leads" ON public.leads;
DROP POLICY IF EXISTS "Sales persons can update created leads" ON public.leads;
DROP POLICY IF EXISTS "Sales persons can update authorized leads" ON public.leads;

CREATE POLICY "Sales persons can update authorized leads"
ON public.leads FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'sales_person'::app_role) AND is_in_bin = false AND (
    created_by_user_id = auth.uid()
    OR assigned_to_user_id = auth.uid()
    OR status = 'visit_created'
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'telecaller'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
)
WITH CHECK (
  (has_role(auth.uid(), 'sales_person'::app_role) AND is_in_bin = false AND (
    created_by_user_id = auth.uid()
    OR assigned_to_user_id = auth.uid()
    OR status = 'visit_created'
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'telecaller'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
);
