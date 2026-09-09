-- Evaluate auth checks once per statement, not once per row.
--
-- Postgres re-evaluates a bare `auth.uid()` / `has_role(auth.uid(), ...)` in an
-- RLS predicate for every candidate row. Wrapping it in a scalar subquery makes
-- it an InitPlan the planner runs once. 20260801120000 already did this for
-- leads, projects, site_visits and quotations; these are the ones it missed.
--
-- The predicates themselves are unchanged — every policy below permits exactly
-- the same rows as before. Only the evaluation point moves.
--
-- Two groups:
--   * project_payments, added by 20260908000000, which reintroduced the raw
--     form and was the only table in the leads/projects read path still using it.
--   * staff and user_roles, which sit on the sign-in path: every page load
--     resolves a role and a staff row through them, so a slow predicate there
--     delays the whole app before anything renders.

-- ---------------------------------------------------------------------------
-- project_payments
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins manage payments"                ON public.project_payments;
DROP POLICY IF EXISTS "Finance roles read payments"           ON public.project_payments;
DROP POLICY IF EXISTS "Finance roles add payments"            ON public.project_payments;
DROP POLICY IF EXISTS "Sales read payments on their projects" ON public.project_payments;
DROP POLICY IF EXISTS "Sales add payments on their projects"  ON public.project_payments;

CREATE POLICY "Admins manage payments"
  ON public.project_payments FOR ALL TO authenticated
  USING      ((SELECT has_role((SELECT auth.uid()), 'admin'::app_role)))
  WITH CHECK ((SELECT has_role((SELECT auth.uid()), 'admin'::app_role)));

CREATE POLICY "Finance roles read payments"
  ON public.project_payments FOR SELECT TO authenticated
  USING ((SELECT has_role((SELECT auth.uid()), 'operator'::app_role)));

CREATE POLICY "Finance roles add payments"
  ON public.project_payments FOR INSERT TO authenticated
  WITH CHECK ((SELECT has_role((SELECT auth.uid()), 'operator'::app_role)));

CREATE POLICY "Sales read payments on their projects"
  ON public.project_payments FOR SELECT TO authenticated
  USING (
    (SELECT has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_payments.project_id
         AND p.assigned_sales_person_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Sales add payments on their projects"
  ON public.project_payments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT has_role((SELECT auth.uid()), 'sales_person'::app_role))
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_payments.project_id
         AND p.assigned_sales_person_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- staff and user_roles — the sign-in path
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff can view own profile"   ON public.staff;
CREATE POLICY "Staff can view own profile"
  ON public.staff FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- Same guard as before: a member of staff may edit their own row but may not
-- change their email, mobile, active flag or password-reset flag.
DROP POLICY IF EXISTS "Staff can update own profile" ON public.staff;
CREATE POLICY "Staff can update own profile"
  ON public.staff FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND NOT (email    IS DISTINCT FROM (SELECT s.email    FROM public.staff s WHERE s.user_id = (SELECT auth.uid())))
    AND NOT (mobile   IS DISTINCT FROM (SELECT s.mobile   FROM public.staff s WHERE s.user_id = (SELECT auth.uid())))
    AND NOT (is_active IS DISTINCT FROM (SELECT s.is_active FROM public.staff s WHERE s.user_id = (SELECT auth.uid())))
    AND NOT (must_change_password IS DISTINCT FROM (SELECT s.must_change_password FROM public.staff s WHERE s.user_id = (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  USING (user_id = (SELECT auth.uid()));
