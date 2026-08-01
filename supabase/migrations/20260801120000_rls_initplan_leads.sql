-- Make the leads read path stop re-running has_role() once per row.
--
-- Every policy on these four tables called has_role(auth.uid(), ...) bare.
-- Postgres treats a bare volatile-looking call in a policy as a per-row
-- expression, so scanning 4001 leads invoked it ~8 times per row — once for
-- each OR'd policy. Wrapping the call in (select ...) turns it into an
-- InitPlan: Postgres evaluates it once per statement and reuses the result as
-- a One-Time Filter.
--
-- Measured on this project before the change, as an admin over 4001 leads:
--   seq scan on leads          cost 194 -> 42294   (218x)
--   count(*) on leads_list     34 ms (no RLS) -> 302 ms (RLS)
-- and EXPLAIN showed the same has_role costing 3 ms as an InitPlan versus
-- 239 ms evaluated per row on the identical scan.
--
-- auth.uid() gets the same treatment for the same reason.
--
-- IMPORTANT: this is purely a re-evaluation-frequency change. Every predicate
-- below is logically identical to the one it replaces — same roles, same
-- columns, same AND/OR structure, same WITH CHECK. Nothing about who can see
-- or change what is intended to change here.

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage all leads" ON public.leads;
CREATE POLICY "Admins can manage all leads" ON public.leads
  AS PERMISSIVE FOR ALL TO public
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "Operators can view leads" ON public.leads;
CREATE POLICY "Operators can view leads" ON public.leads
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role))
    AND is_in_bin = false
  );

DROP POLICY IF EXISTS "Telecallers can view own leads" ON public.leads;
CREATE POLICY "Telecallers can view own leads" ON public.leads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND is_in_bin = false
    AND (created_by_user_id = (SELECT auth.uid()) OR assigned_to_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Sales persons can view authorized leads" ON public.leads;
CREATE POLICY "Sales persons can view authorized leads" ON public.leads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
      AND is_in_bin = false
      AND (
        created_by_user_id = (SELECT auth.uid())
        OR assigned_to_user_id = (SELECT auth.uid())
        OR status = 'visit_created'::lead_status
      )
    )
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role))
  );

DROP POLICY IF EXISTS "Welders can view assigned project leads" ON public.leads;
CREATE POLICY "Welders can view assigned project leads" ON public.leads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'welder'::app_role))
    AND is_in_bin = false
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.lead_id = leads.id
        AND p.assigned_welder_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Electricians can view assigned project leads" ON public.leads;
CREATE POLICY "Electricians can view assigned project leads" ON public.leads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'electrician'::app_role))
    AND is_in_bin = false
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.lead_id = leads.id
        AND p.assigned_electrician_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Sales persons can create leads" ON public.leads;
CREATE POLICY "Sales persons can create leads" ON public.leads
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND created_by_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Telecallers can create leads" ON public.leads;
CREATE POLICY "Telecallers can create leads" ON public.leads
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND created_by_user_id = (SELECT auth.uid())
  );

-- The USING and WITH CHECK sides differ here: USING also requires
-- is_in_bin = false, WITH CHECK does not. Preserved as-is.
DROP POLICY IF EXISTS "Telecallers can update own leads" ON public.leads;
CREATE POLICY "Telecallers can update own leads" ON public.leads
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND is_in_bin = false
    AND (created_by_user_id = (SELECT auth.uid()) OR assigned_to_user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND (created_by_user_id = (SELECT auth.uid()) OR assigned_to_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Sales persons can update authorized leads" ON public.leads;
CREATE POLICY "Sales persons can update authorized leads" ON public.leads
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
      AND is_in_bin = false
      AND (
        created_by_user_id = (SELECT auth.uid())
        OR assigned_to_user_id = (SELECT auth.uid())
        OR status = 'visit_created'::lead_status
      )
    )
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role))
  )
  WITH CHECK (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
      AND is_in_bin = false
      AND (
        created_by_user_id = (SELECT auth.uid())
        OR assigned_to_user_id = (SELECT auth.uid())
        OR status = 'visit_created'::lead_status
      )
    )
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role))
  );

-- ---------------------------------------------------------------------------
-- site_visits  (lateral-joined by leads_list, so it pays the same per-row cost)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage all site visits" ON public.site_visits;
CREATE POLICY "Admins can manage all site visits" ON public.site_visits
  AS PERMISSIVE FOR ALL TO public
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "Staff can view own site visits" ON public.site_visits;
CREATE POLICY "Staff can view own site visits" ON public.site_visits
  AS PERMISSIVE FOR SELECT TO public
  USING (staff_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Telecallers view own lead site visits" ON public.site_visits;
CREATE POLICY "Telecallers view own lead site visits" ON public.site_visits
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = site_visits.lead_id
        AND l.created_by_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Sales persons can view assigned lead site visits" ON public.site_visits;
CREATE POLICY "Sales persons can view assigned lead site visits" ON public.site_visits
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = site_visits.lead_id
        AND (l.assigned_to_user_id = (SELECT auth.uid()) OR l.created_by_user_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Staff can create own site visits" ON public.site_visits;
CREATE POLICY "Staff can create own site visits" ON public.site_visits
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (staff_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- projects  (lateral-joined by leads_list)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage all projects" ON public.projects;
CREATE POLICY "Admins can manage all projects" ON public.projects
  AS PERMISSIVE FOR ALL TO public
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "Operators can view all projects" ON public.projects;
CREATE POLICY "Operators can view all projects" ON public.projects
  AS PERMISSIVE FOR SELECT TO public
  USING ((SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role)));

DROP POLICY IF EXISTS "Telecallers view assigned projects" ON public.projects;
CREATE POLICY "Telecallers view assigned projects" ON public.projects
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND assigned_telecaller_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Sales persons can view assigned projects" ON public.projects;
CREATE POLICY "Sales persons can view assigned projects" ON public.projects
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND assigned_sales_person_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Welders can view assigned projects" ON public.projects;
CREATE POLICY "Welders can view assigned projects" ON public.projects
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'welder'::app_role))
    AND assigned_welder_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Electricians can view assigned projects" ON public.projects;
CREATE POLICY "Electricians can view assigned projects" ON public.projects
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'electrician'::app_role))
    AND assigned_electrician_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Sales persons can create projects" ON public.projects;
CREATE POLICY "Sales persons can create projects" ON public.projects
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND created_by_user_id = (SELECT auth.uid())
    AND assigned_sales_person_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Operators can update projects" ON public.projects;
CREATE POLICY "Operators can update projects" ON public.projects
  AS PERMISSIVE FOR UPDATE TO public
  USING ((SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role)));

DROP POLICY IF EXISTS "Sales persons can update assigned projects" ON public.projects;
CREATE POLICY "Sales persons can update assigned projects" ON public.projects
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND assigned_sales_person_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND assigned_sales_person_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Telecallers update assigned projects" ON public.projects;
CREATE POLICY "Telecallers update assigned projects" ON public.projects
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND assigned_telecaller_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND assigned_telecaller_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Welders can update assigned projects" ON public.projects;
CREATE POLICY "Welders can update assigned projects" ON public.projects
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'welder'::app_role))
    AND assigned_welder_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Electricians can update assigned projects" ON public.projects;
CREATE POLICY "Electricians can update assigned projects" ON public.projects
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'electrician'::app_role))
    AND assigned_electrician_id = (SELECT auth.uid())
  );

-- ---------------------------------------------------------------------------
-- quotations  (lateral-joined by leads_list)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage all quotations" ON public.quotations;
CREATE POLICY "Admins can manage all quotations" ON public.quotations
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "Operators can view all quotations" ON public.quotations;
CREATE POLICY "Operators can view all quotations" ON public.quotations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role)));

DROP POLICY IF EXISTS "Sales persons can view assigned project quotations" ON public.quotations;
CREATE POLICY "Sales persons can view assigned project quotations" ON public.quotations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = quotations.project_id
        AND p.assigned_sales_person_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Operators can create quotations" ON public.quotations;
CREATE POLICY "Operators can create quotations" ON public.quotations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role))
    AND created_by_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Sales persons can create assigned project quotations" ON public.quotations;
CREATE POLICY "Sales persons can create assigned project quotations" ON public.quotations
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND created_by_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = quotations.project_id
        AND p.assigned_sales_person_id = (SELECT auth.uid())
    )
  );
