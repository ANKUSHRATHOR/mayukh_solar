-- Editing, cancelling and deleting site visits.
--
-- `site_visits` had INSERT and SELECT policies for staff and nothing else, so
-- only an admin could change a visit. A telecaller, sales rep or operator who
-- booked the wrong date had no way to fix it, and a direct UPDATE from the
-- client matched zero rows and reported success.
--
-- Rather than open UPDATE/DELETE policies — which would let a client rewrite a
-- completed visit's GPS proof or outcome — every change goes through a SECURITY
-- DEFINER function that checks who is asking, which states may change, and
-- keeps the lead's status and follow-up date in step with its visits.
--
-- Rules:
--   * edit    — scheduled visits only: date, assignee, notes.
--   * cancel  — scheduled visits only, with a reason. The row stays as history.
--   * delete  — admin only, any state, and written to audit_logs.
--   * book    — one path for the lead page and the reschedule flow. It fills the
--               lead's assignee only when the lead has none; it never clears it.
--               The old lead-page booking overwrote the assignee with the
--               visit's (or with NULL), so a second "unassigned" booking took the
--               lead away from its rep.

-- ---------------------------------------------------------------------------
-- Who may act
-- ---------------------------------------------------------------------------

-- Mirrors the leads SELECT policies for the roles that work visits, so anyone
-- who can open a lead can manage its visits.
CREATE OR REPLACE FUNCTION public.can_act_on_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
       WHERE l.id = _lead_id
         AND l.is_in_bin = false
         AND (
           has_role(auth.uid(), 'operator'::app_role)
           OR (
             (has_role(auth.uid(), 'telecaller'::app_role) OR has_role(auth.uid(), 'sales_person'::app_role))
             AND (l.created_by_user_id = auth.uid() OR l.assigned_to_user_id = auth.uid())
           )
           OR (has_role(auth.uid(), 'sales_person'::app_role) AND l.status = 'visit_created'::lead_status)
         )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_site_visit(_visit_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_visits v
     WHERE v.id = _visit_id
       AND (
         has_role(auth.uid(), 'admin'::app_role)
         OR v.staff_id = auth.uid()
         OR v.assigned_to_user_id = auth.uid()
         OR public.can_act_on_lead(v.lead_id)
       )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_act_on_lead(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_site_visit(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_act_on_lead(uuid)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_manage_site_visit(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Keeping the lead in step
-- ---------------------------------------------------------------------------
-- The lead's follow-up date is the next scheduled visit. When none is left, a
-- lead still parked at `visit_created` moves to `follow_up` — otherwise it would
-- claim a visit that no longer exists, and sales reps (who see every
-- `visit_created` lead) would keep being offered it.

CREATE OR REPLACE FUNCTION public.sync_lead_visit_state(_lead_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_visit timestamptz;
BEGIN
  SELECT min(COALESCE(scheduled_for, visit_date)) INTO next_visit
    FROM public.site_visits
   WHERE lead_id = _lead_id
     AND visit_status = 'scheduled';

  IF next_visit IS NOT NULL THEN
    UPDATE public.leads SET follow_up_date = next_visit WHERE id = _lead_id;
  ELSE
    UPDATE public.leads
       SET status = 'follow_up'::lead_status
     WHERE id = _lead_id
       AND status = 'visit_created'::lead_status;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.sync_lead_visit_state(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Book
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.book_site_visit(
  _lead_id       uuid,
  _scheduled_for timestamptz,
  _assigned_to   uuid DEFAULT NULL,
  _notes         text DEFAULT NULL
)
RETURNS public.site_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  l public.leads%ROWTYPE;
  v public.site_visits%ROWTYPE;
BEGIN
  IF _scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Pick the visit date and time.';
  END IF;

  IF NOT public.can_act_on_lead(_lead_id) THEN
    RAISE EXCEPTION 'You do not have access to this lead.';
  END IF;

  SELECT * INTO l FROM public.leads WHERE id = _lead_id;
  IF l.status IN ('final'::lead_status, 'cancelled'::lead_status) THEN
    RAISE EXCEPTION 'This lead is %; a visit cannot be booked.', l.status;
  END IF;

  INSERT INTO public.site_visits (
    lead_id, staff_id, assigned_to_user_id, visit_status,
    scheduled_for, visit_date, visit_notes, status_updated_to
  ) VALUES (
    _lead_id, auth.uid(), _assigned_to, 'scheduled',
    _scheduled_for, _scheduled_for, NULLIF(btrim(_notes), ''), 'visit_created'::lead_status
  )
  RETURNING * INTO v;

  UPDATE public.leads
     SET status              = 'visit_created'::lead_status,
         assigned_to_user_id = COALESCE(assigned_to_user_id, _assigned_to)
   WHERE id = _lead_id;

  PERFORM public.sync_lead_visit_state(_lead_id);
  RETURN v;
END $$;

-- ---------------------------------------------------------------------------
-- Edit
-- ---------------------------------------------------------------------------
-- Every argument is written as given: the client sends the whole form, so a
-- NULL assignee means "unassigned", not "leave unchanged".

CREATE OR REPLACE FUNCTION public.update_site_visit(
  _visit_id      uuid,
  _scheduled_for timestamptz,
  _assigned_to   uuid DEFAULT NULL,
  _notes         text DEFAULT NULL
)
RETURNS public.site_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v public.site_visits%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.site_visits WHERE id = _visit_id FOR UPDATE;
  IF NOT FOUND OR v.visit_status = 'note' THEN
    RAISE EXCEPTION 'Visit not found.';
  END IF;
  IF NOT public.can_manage_site_visit(_visit_id) THEN
    RAISE EXCEPTION 'You cannot edit this visit.';
  END IF;
  IF v.visit_status <> 'scheduled' THEN
    RAISE EXCEPTION 'Only a scheduled visit can be edited; this one is %.', v.visit_status;
  END IF;
  IF _scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Pick the visit date and time.';
  END IF;

  UPDATE public.site_visits
     SET scheduled_for       = _scheduled_for,
         visit_date          = _scheduled_for,
         assigned_to_user_id = _assigned_to,
         visit_notes         = NULLIF(btrim(_notes), '')
   WHERE id = _visit_id
  RETURNING * INTO v;

  PERFORM public.sync_lead_visit_state(v.lead_id);
  RETURN v;
END $$;

-- ---------------------------------------------------------------------------
-- Cancel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_site_visit(_visit_id uuid, _reason text)
RETURNS public.site_visits
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v public.site_visits%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.site_visits WHERE id = _visit_id FOR UPDATE;
  IF NOT FOUND OR v.visit_status = 'note' THEN
    RAISE EXCEPTION 'Visit not found.';
  END IF;
  IF NOT public.can_manage_site_visit(_visit_id) THEN
    RAISE EXCEPTION 'You cannot cancel this visit.';
  END IF;
  IF v.visit_status <> 'scheduled' THEN
    RAISE EXCEPTION 'Only a scheduled visit can be cancelled; this one is %.', v.visit_status;
  END IF;
  IF NULLIF(btrim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for cancelling.';
  END IF;

  UPDATE public.site_visits
     SET visit_status     = 'cancelled',
         cancelled_reason = btrim(_reason)
   WHERE id = _visit_id
  RETURNING * INTO v;

  PERFORM public.sync_lead_visit_state(v.lead_id);
  RETURN v;
END $$;

-- ---------------------------------------------------------------------------
-- Delete (admin)
-- ---------------------------------------------------------------------------
-- The whole row goes into audit_logs first, so a mistaken delete can be read
-- back and re-entered.

CREATE OR REPLACE FUNCTION public.delete_site_visit(_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v public.site_visits%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only an admin can delete a visit. Cancel it instead.';
  END IF;

  SELECT * INTO v FROM public.site_visits WHERE id = _visit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not found.';
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, old_value)
  VALUES ('site_visit_deleted', 'site_visit', _visit_id::text, auth.uid(), to_jsonb(v));

  DELETE FROM public.site_visits WHERE id = _visit_id;

  PERFORM public.sync_lead_visit_state(v.lead_id);
  RETURN jsonb_build_object('ok', true, 'lead_id', v.lead_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.book_site_visit(uuid, timestamptz, uuid, text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_site_visit(uuid, timestamptz, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_site_visit(uuid, text)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_site_visit(uuid)                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.book_site_visit(uuid, timestamptz, uuid, text)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_site_visit(uuid, timestamptz, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cancel_site_visit(uuid, text)                    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_site_visit(uuid)                          TO authenticated;

-- ---------------------------------------------------------------------------
-- Read access
-- ---------------------------------------------------------------------------
-- Gaps that made visits invisible to the people working them: an operator saw
-- only visits they had booked themselves, the assigned surveyor had no policy
-- at all, and a telecaller saw visits only on leads they had created, not ones
-- assigned to them.

DROP POLICY IF EXISTS "Assignees view assigned site visits" ON public.site_visits;
CREATE POLICY "Assignees view assigned site visits" ON public.site_visits
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (assigned_to_user_id = (SELECT auth.uid()));

-- Operators can already read every non-binned lead; their visits follow.
DROP POLICY IF EXISTS "Operators view site visits" ON public.site_visits;
CREATE POLICY "Operators view site visits" ON public.site_visits
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role)));

DROP POLICY IF EXISTS "Telecallers view own lead site visits" ON public.site_visits;
CREATE POLICY "Telecallers view own lead site visits" ON public.site_visits
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = site_visits.lead_id
        AND (l.created_by_user_id = (SELECT auth.uid()) OR l.assigned_to_user_id = (SELECT auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- Operators get the Site Visits module
-- ---------------------------------------------------------------------------
-- Operators book and work visits. Still editable afterwards in Roles & Access.

INSERT INTO public.role_permissions (role, module, allowed)
VALUES ('operator', 'site_visits', true)
ON CONFLICT (role, module) DO UPDATE SET allowed = true, updated_at = now();
