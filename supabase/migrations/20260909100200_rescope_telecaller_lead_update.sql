-- A telecaller could UPDATE any lead, including ones they cannot read.
--
-- 20260722000000_telecaller_lead_scope.sql deliberately narrowed telecallers to
-- leads they created or were assigned. 20260801120000_rls_initplan_leads.sql
-- rewrote the policies to lift auth calls into InitPlans and, in doing so,
-- carried a blanket `OR has_role(telecaller)` into the UPDATE policy — silently
-- undoing that narrowing. Sorting later, it won.
--
-- The result was a policy pair that disagreed with itself: SELECT scoped a
-- telecaller to their own leads while UPDATE let them write to all of them. Same
-- class of mistake as the wide-open project_payments policies closed in
-- 20260909000100 — a rewrite that changed who, while claiming to change only how.
--
-- Telecallers keep their own correctly-scoped policy ("Telecallers can update
-- own leads"), so removing the clause here takes nothing legitimate away.
-- Operator keeps blanket lead UPDATE: that is the operations role, and its
-- SELECT is equally broad, so the two agree.

DROP POLICY IF EXISTS "Sales persons can update authorized leads" ON public.leads;

CREATE POLICY "Sales persons can update authorized leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    (
      (SELECT has_role((SELECT auth.uid()), 'sales_person'::app_role))
      AND is_in_bin = false
      AND (
        created_by_user_id  = (SELECT auth.uid())
        OR assigned_to_user_id = (SELECT auth.uid())
        OR status = 'visit_created'::lead_status
      )
    )
    OR (SELECT has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT has_role((SELECT auth.uid()), 'operator'::app_role))
  )
  WITH CHECK (
    (
      (SELECT has_role((SELECT auth.uid()), 'sales_person'::app_role))
      AND is_in_bin = false
      AND (
        created_by_user_id  = (SELECT auth.uid())
        OR assigned_to_user_id = (SELECT auth.uid())
        OR status = 'visit_created'::lead_status
      )
    )
    OR (SELECT has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT has_role((SELECT auth.uid()), 'operator'::app_role))
  );
