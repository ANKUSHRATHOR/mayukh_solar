-- A lead is worked by a telecaller *and* a sales rep.
--
-- `leads.assigned_to_user_id` was one slot shared by both roles, so handing a
-- qualified lead to a sales rep wiped the telecaller off it: they lost it from
-- "My Leads" (unless they happened to have created it), and their follow-ups and
-- figures went with it. 269 leads were sitting on a telecaller and 7 on a sales
-- rep, so the column was in practice "whoever touched it last".
--
-- From here:
--   assigned_telecaller_id — the telecaller working the phone.
--   assigned_to_user_id    — the sales rep who visits and closes.
--
-- Keeping the old column as the sales slot rather than adding two new ones means
-- the sales-side policies, the projects join and the sales dashboard keep
-- meaning what they already meant; only the telecaller side moves.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_telecaller_id uuid;

COMMENT ON COLUMN public.leads.assigned_telecaller_id IS
  'Telecaller working this lead. Independent of assigned_to_user_id, which is the sales rep.';
COMMENT ON COLUMN public.leads.assigned_to_user_id IS
  'Sales rep assigned to this lead. See assigned_telecaller_id for the telecaller.';

CREATE INDEX IF NOT EXISTS idx_leads_assigned_telecaller
  ON public.leads (assigned_telecaller_id)
  WHERE assigned_telecaller_id IS NOT NULL;

-- Move every lead currently held by a telecaller into the new slot, so the sales
-- slot stops meaning two things. Leads held by a sales rep stay where they are.
UPDATE public.leads l
   SET assigned_telecaller_id = l.assigned_to_user_id,
       assigned_to_user_id    = NULL
 WHERE l.assigned_to_user_id IS NOT NULL
   AND l.assigned_telecaller_id IS NULL
   AND EXISTS (
     SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = l.assigned_to_user_id
        AND ur.role = 'telecaller'::app_role
   );

-- ---------------------------------------------------------------------------
-- leads_list
-- ---------------------------------------------------------------------------
-- `l.*` was expanded when the view was created, so the new column needs a
-- rebuild; REPLACE cannot do it because the column lands mid-list.

DROP VIEW IF EXISTS public.leads_list;

CREATE VIEW public.leads_list
WITH (security_invoker = true) AS
SELECT
  l.*,
  v.staff_id            AS last_visit_staff_id,
  v.visit_notes         AS last_visit_notes,
  v.status_updated_to   AS last_visit_status,
  v.visit_date          AS last_visit_at,
  p.id                  AS project_id,
  p.assigned_operator_id,
  p.payment_type        AS project_type,
  p.status              AS project_status,
  (q.project_id IS NOT NULL) AS has_quotation,
  GREATEST(
    COALESCE(v.visit_date,  l.updated_at, l.created_at),
    COALESCE(p.updated_at,  l.updated_at, l.created_at),
    COALESCE(l.updated_at,  l.created_at)
  ) AS last_activity_at
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT sv.staff_id, sv.visit_notes, sv.status_updated_to, sv.visit_date
  FROM public.site_visits sv
  WHERE sv.lead_id = l.id
  ORDER BY sv.visit_date DESC
  LIMIT 1
) v ON true
LEFT JOIN LATERAL (
  SELECT pr.id, pr.assigned_operator_id, pr.payment_type, pr.status, pr.updated_at
  FROM public.projects pr
  WHERE pr.lead_id = l.id
  ORDER BY pr.updated_at DESC
  LIMIT 1
) p ON true
LEFT JOIN LATERAL (
  SELECT qt.project_id
  FROM public.quotations qt
  WHERE qt.project_id = p.id
  LIMIT 1
) q ON true;

REVOKE ALL ON public.leads_list FROM anon;
GRANT SELECT ON public.leads_list TO authenticated;

-- ---------------------------------------------------------------------------
-- Access: both assignees can reach the lead
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Telecallers can view own leads" ON public.leads;
CREATE POLICY "Telecallers can view own leads" ON public.leads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND is_in_bin = false
    AND (
      created_by_user_id     = (SELECT auth.uid())
      OR assigned_to_user_id = (SELECT auth.uid())
      OR assigned_telecaller_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Telecallers can update own leads" ON public.leads;
CREATE POLICY "Telecallers can update own leads" ON public.leads
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND is_in_bin = false
    AND (
      created_by_user_id     = (SELECT auth.uid())
      OR assigned_to_user_id = (SELECT auth.uid())
      OR assigned_telecaller_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND (
      created_by_user_id     = (SELECT auth.uid())
      OR assigned_to_user_id = (SELECT auth.uid())
      OR assigned_telecaller_id = (SELECT auth.uid())
    )
  );

-- Sales reps keep their own slot, plus the open `visit_created` pool.
DROP POLICY IF EXISTS "Sales persons can view authorized leads" ON public.leads;
CREATE POLICY "Sales persons can view authorized leads" ON public.leads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'sales_person'::app_role))
      AND is_in_bin = false
      AND (
        created_by_user_id     = (SELECT auth.uid())
        OR assigned_to_user_id = (SELECT auth.uid())
        OR status = 'visit_created'::lead_status
      )
    )
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'operator'::app_role))
  );

-- can_act_on_lead gates every visit and call function, so the telecaller slot
-- has to count here or a reassigned telecaller cannot log their own calls.
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
             AND (
               l.created_by_user_id = auth.uid()
               OR l.assigned_to_user_id = auth.uid()
               OR l.assigned_telecaller_id = auth.uid()
             )
           )
           OR (has_role(auth.uid(), 'sales_person'::app_role) AND l.status = 'visit_created'::lead_status)
         )
    );
$$;

DROP POLICY IF EXISTS "Telecallers view own lead site visits" ON public.site_visits;
CREATE POLICY "Telecallers view own lead site visits" ON public.site_visits
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'telecaller'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = site_visits.lead_id
        AND (
          l.created_by_user_id = (SELECT auth.uid())
          OR l.assigned_to_user_id = (SELECT auth.uid())
          OR l.assigned_telecaller_id = (SELECT auth.uid())
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Assigning
-- ---------------------------------------------------------------------------
-- One entry point for both slots. An admin or operator sets either; a telecaller
-- may hand their own lead to a sales rep but cannot move the telecaller slot,
-- including their own — losing a lead is an admin's decision.

CREATE OR REPLACE FUNCTION public.assign_lead(
  _lead_id  uuid,
  _slot     text,          -- 'telecaller' | 'sales_person'
  _assignee uuid           -- NULL clears the slot
)
RETURNS public.leads
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  l public.leads%ROWTYPE;
  assignee_role app_role;
  is_manager boolean := has_role(auth.uid(), 'admin'::app_role)
                     OR has_role(auth.uid(), 'operator'::app_role);
BEGIN
  IF _slot NOT IN ('telecaller', 'sales_person') THEN
    RAISE EXCEPTION 'Unknown assignment slot %.', _slot;
  END IF;

  SELECT * INTO l FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found.';
  END IF;

  IF NOT is_manager THEN
    IF _slot = 'telecaller' THEN
      RAISE EXCEPTION 'Only an admin or operator can change the telecaller.';
    END IF;
    IF NOT (has_role(auth.uid(), 'telecaller'::app_role) AND public.can_act_on_lead(_lead_id)) THEN
      RAISE EXCEPTION 'You cannot assign this lead.';
    END IF;
  END IF;

  IF _assignee IS NOT NULL THEN
    SELECT role INTO assignee_role FROM public.user_roles WHERE user_id = _assignee LIMIT 1;
    IF assignee_role IS NULL THEN
      RAISE EXCEPTION 'That person has no role assigned and cannot receive leads.';
    END IF;
    -- The slot names the role, so a mismatch is a mistake worth refusing rather
    -- than storing a sales rep in the telecaller column.
    IF _slot = 'telecaller' AND assignee_role <> 'telecaller'::app_role THEN
      RAISE EXCEPTION 'That person is not a telecaller.';
    END IF;
    IF _slot = 'sales_person' AND assignee_role <> 'sales_person'::app_role THEN
      RAISE EXCEPTION 'That person is not a sales person.';
    END IF;
  END IF;

  IF _slot = 'telecaller' THEN
    UPDATE public.leads SET assigned_telecaller_id = _assignee WHERE id = _lead_id RETURNING * INTO l;
  ELSE
    UPDATE public.leads SET assigned_to_user_id = _assignee WHERE id = _lead_id RETURNING * INTO l;
  END IF;

  RETURN l;
END $$;

REVOKE EXECUTE ON FUNCTION public.assign_lead(uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.assign_lead(uuid, text, uuid) TO authenticated;

-- Bulk assign now routes by the assignee's role instead of overwriting whatever
-- slot was there: picking a telecaller no longer evicts the sales rep.
CREATE OR REPLACE FUNCTION public.bulk_assign_leads(
  _lead_ids uuid[],
  _assignee uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated int;
  assignee_role app_role;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)) THEN
    RAISE EXCEPTION 'Only an admin or operator can reassign leads.';
  END IF;

  IF _assignee IS NULL THEN
    RAISE EXCEPTION 'Pick who the leads go to.';
  END IF;

  SELECT role INTO assignee_role FROM public.user_roles WHERE user_id = _assignee LIMIT 1;
  IF assignee_role IS NULL THEN
    RAISE EXCEPTION 'That person has no role assigned and cannot receive leads.';
  END IF;

  IF assignee_role = 'telecaller'::app_role THEN
    UPDATE public.leads
       SET assigned_telecaller_id = _assignee, updated_at = now()
     WHERE id = ANY(_lead_ids);
  ELSIF assignee_role = 'sales_person'::app_role THEN
    UPDATE public.leads
       SET assigned_to_user_id = _assignee, updated_at = now()
     WHERE id = ANY(_lead_ids);
  ELSE
    RAISE EXCEPTION 'Leads go to a telecaller or a sales person, not a %.', assignee_role;
  END IF;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', updated, 'slot', assignee_role);
END $$;

REVOKE EXECUTE ON FUNCTION public.bulk_assign_leads(uuid[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.bulk_assign_leads(uuid[], uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Booking a visit fills the sales slot when it is empty
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
  assignee_role app_role;
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

  IF _assigned_to IS NOT NULL THEN
    SELECT role INTO assignee_role FROM public.user_roles WHERE user_id = _assigned_to LIMIT 1;
  END IF;

  UPDATE public.leads
     SET status = 'visit_created'::lead_status,
         -- Only a sales rep, and only into an empty slot: booking a visit must
         -- never take a lead off the rep who already owns it.
         assigned_to_user_id = CASE
           WHEN assigned_to_user_id IS NULL AND assignee_role = 'sales_person'::app_role
             THEN _assigned_to
           ELSE assigned_to_user_id
         END
   WHERE id = _lead_id;

  PERFORM public.sync_lead_visit_state(_lead_id);
  RETURN v;
END $$;

-- ---------------------------------------------------------------------------
-- Counting: "assigned to me" means either slot
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leads_stage_counts(
  _search       text        DEFAULT NULL,
  _creator      uuid        DEFAULT NULL,
  _assigned     uuid        DEFAULT NULL,
  _unassigned   boolean     DEFAULT false,
  _operator     uuid        DEFAULT NULL,
  _project_type payment_type DEFAULT NULL,
  _from         timestamptz DEFAULT NULL,
  _to           timestamptz DEFAULT NULL,
  _scope        text        DEFAULT 'all',
  _scope_user   uuid        DEFAULT NULL,
  _campaign     text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'new',            count(*) FILTER (WHERE l.status = 'new'),
    'site_visit',     count(*) FILTER (WHERE l.status = 'visited'),
    'follow_up',      count(*) FILTER (WHERE l.status = 'follow_up'),
    'not_connected',  count(*) FILTER (WHERE l.status = 'not_connected'),
    'interested',     count(*) FILTER (WHERE l.status = 'interested'),
    'quotation_sent', count(*) FILTER (WHERE q.has_quotation),
    'final',          count(*) FILTER (WHERE l.status = 'final'),
    'not_interested', count(*) FILTER (WHERE l.status = 'not_interested'),
    'cancelled',      count(*) FILTER (WHERE l.status = 'cancelled')
  )
  FROM public.leads l
  LEFT JOIN LATERAL (
    SELECT pr.id, pr.assigned_operator_id, pr.payment_type, pr.updated_at
      FROM public.projects pr
     WHERE pr.lead_id = l.id
     ORDER BY pr.updated_at DESC
     LIMIT 1
  ) p ON true
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM public.quotations qt WHERE qt.project_id = p.id) AS has_quotation
  ) q
  WHERE l.is_in_bin = false
    AND (
      _search IS NULL OR _search = '' OR
      l.customer_name ILIKE '%' || _search || '%' OR
      l.mobile        ILIKE '%' || _search || '%' OR
      l.k_number      ILIKE '%' || _search || '%'
    )
    AND (_creator      IS NULL OR l.created_by_user_id  = _creator)
    -- Unassigned means nobody at all, on either side.
    AND (NOT _unassigned OR (l.assigned_to_user_id IS NULL AND l.assigned_telecaller_id IS NULL))
    AND (_assigned     IS NULL OR l.assigned_to_user_id = _assigned OR l.assigned_telecaller_id = _assigned)
    AND (_operator     IS NULL OR p.assigned_operator_id = _operator)
    AND (_project_type IS NULL OR p.payment_type         = _project_type)
    AND (_campaign     IS NULL OR l.campaign             = _campaign)
    AND (_from IS NULL OR GREATEST(
          COALESCE((SELECT max(sv.visit_date) FROM public.site_visits sv WHERE sv.lead_id = l.id), l.updated_at, l.created_at),
          COALESCE(p.updated_at, l.updated_at, l.created_at),
          COALESCE(l.updated_at, l.created_at)) >= _from)
    AND (_to   IS NULL OR GREATEST(
          COALESCE((SELECT max(sv.visit_date) FROM public.site_visits sv WHERE sv.lead_id = l.id), l.updated_at, l.created_at),
          COALESCE(p.updated_at, l.updated_at, l.created_at),
          COALESCE(l.updated_at, l.created_at)) <= _to)
    AND (
      _scope <> 'my_visits' OR
      l.assigned_to_user_id = _scope_user OR
      l.assigned_telecaller_id = _scope_user OR
      l.created_by_user_id  = _scope_user
    )
    AND (
      _scope <> 'unassigned_visits' OR
      (l.assigned_to_user_id IS NULL AND l.follow_up_date IS NOT NULL)
    );
$function$;

-- Both dashboards count a lead as "mine" from either slot.
CREATE OR REPLACE FUNCTION public.telecaller_day_stats(_staff uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  who        uuid := COALESCE(_staff, auth.uid());
  day_start  timestamptz;
  month_start timestamptz;
  today_ist  date;
  result     jsonb;
BEGIN
  IF who <> auth.uid() AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'You can only see your own figures.';
  END IF;

  today_ist   := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  day_start   := today_ist::timestamp AT TIME ZONE 'Asia/Kolkata';
  month_start := date_trunc('month', today_ist::timestamp) AT TIME ZONE 'Asia/Kolkata';

  SELECT jsonb_build_object(
    'dialed',          count(*) FILTER (WHERE c.created_at >= day_start),
    'connected',       count(*) FILTER (WHERE c.created_at >= day_start AND c.outcome = 'connected'),
    'not_connected',   count(*) FILTER (WHERE c.created_at >= day_start AND c.outcome = 'not_connected'),
    'unlogged',        count(*) FILTER (WHERE c.created_at >= day_start AND c.outcome = 'dialed'),
    'interested',      count(*) FILTER (WHERE c.created_at >= day_start AND c.status_updated_to = 'interested'::lead_status),
    'follow_up',       count(*) FILTER (WHERE c.created_at >= day_start AND c.status_updated_to = 'follow_up'::lead_status),
    'not_interested',  count(*) FILTER (WHERE c.created_at >= day_start AND c.status_updated_to = 'not_interested'::lead_status),
    'month_calls',     count(*) FILTER (WHERE c.created_at >= month_start)
  ) INTO result
  FROM public.call_logs c
  WHERE c.staff_id = who
    AND c.created_at >= month_start;

  RETURN result
    || (
      SELECT jsonb_build_object(
        'visits_created',       count(*) FILTER (WHERE v.created_at >= day_start),
        'month_visits_created', count(*)
      )
        FROM public.site_visits v
       WHERE v.staff_id = who
         AND v.visit_status <> 'note'
         AND v.created_at >= month_start
    )
    || (
      SELECT jsonb_build_object(
        'leads_created',       count(*) FILTER (WHERE l.created_at >= day_start),
        'month_leads_created', count(*)
      )
        FROM public.leads l
       WHERE l.created_by_user_id = who
         AND l.is_in_bin = false
         AND l.created_at >= month_start
    )
    || (
      SELECT jsonb_build_object(
        'follow_ups_due_today', count(*) FILTER (
          WHERE (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date = today_ist),
        'follow_ups_overdue',   count(*) FILTER (
          WHERE (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date < today_ist)
      )
        FROM public.leads l
       WHERE l.is_in_bin = false
         AND l.follow_up_date IS NOT NULL
         AND l.status NOT IN ('final'::lead_status, 'cancelled'::lead_status, 'not_interested'::lead_status)
         AND (l.assigned_to_user_id = who OR l.assigned_telecaller_id = who OR l.created_by_user_id = who)
    );
END $$;

CREATE OR REPLACE FUNCTION public.team_activity_performance(_from date, _to date)
RETURNS TABLE (
  user_id            uuid,
  full_name          text,
  role               app_role,
  dialed             bigint,
  connected          bigint,
  not_connected      bigint,
  leads_created      bigint,
  leads_assigned     bigint,
  visits_booked      bigint,
  visits_completed   bigint,
  interested         bigint,
  follow_ups_set     bigint,
  not_interested     bigint,
  projects_created   bigint,
  follow_ups_overdue bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH bounds AS (
    SELECT _from::timestamp AT TIME ZONE 'Asia/Kolkata'     AS from_ts,
           (_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata' AS to_ts
  )
  SELECT
    s.user_id,
    s.full_name,
    r.role,
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.outcome = 'connected'
        AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.outcome = 'not_connected'
        AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    (SELECT count(*) FROM public.leads l, bounds b
      WHERE l.created_by_user_id = s.user_id AND l.is_in_bin = false
        AND l.created_at >= b.from_ts AND l.created_at < b.to_ts),
    -- Either slot, so a telecaller and a sales rep both count the shared lead.
    (SELECT count(*) FROM public.leads l, bounds b
      WHERE (l.assigned_to_user_id = s.user_id OR l.assigned_telecaller_id = s.user_id)
        AND l.is_in_bin = false
        AND l.created_at >= b.from_ts AND l.created_at < b.to_ts),
    (SELECT count(*) FROM public.site_visits v, bounds b
      WHERE v.staff_id = s.user_id AND v.visit_status <> 'note'
        AND v.created_at >= b.from_ts AND v.created_at < b.to_ts),
    (SELECT count(*) FROM public.site_visits v, bounds b
      WHERE COALESCE(v.assigned_to_user_id, v.staff_id) = s.user_id
        AND v.visit_status = 'completed'
        AND v.completed_at >= b.from_ts AND v.completed_at < b.to_ts),
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.status_updated_to = 'interested'::lead_status
        AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.status_updated_to = 'follow_up'::lead_status
        AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.status_updated_to = 'not_interested'::lead_status
        AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    (SELECT count(*) FROM public.projects p
       JOIN public.leads l ON l.id = p.lead_id, bounds b
      WHERE (l.assigned_to_user_id = s.user_id OR l.assigned_telecaller_id = s.user_id OR l.created_by_user_id = s.user_id)
        AND p.created_at >= b.from_ts AND p.created_at < b.to_ts),
    (SELECT count(*) FROM public.leads l
      WHERE (l.assigned_to_user_id = s.user_id OR l.assigned_telecaller_id = s.user_id OR l.created_by_user_id = s.user_id)
        AND l.is_in_bin = false
        AND l.follow_up_date IS NOT NULL
        AND (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND l.status NOT IN ('final'::lead_status, 'cancelled'::lead_status, 'not_interested'::lead_status))
  FROM public.staff s
  JOIN LATERAL (
    SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = s.user_id LIMIT 1
  ) r ON true
  WHERE s.is_active = true
    AND r.role IN ('telecaller'::app_role, 'sales_person'::app_role)
    AND has_role(auth.uid(), 'admin'::app_role)
  ORDER BY s.full_name;
$$;

-- Same for the HR-side view, so a telecaller's leads still show there.
CREATE OR REPLACE FUNCTION public.staff_performance(_from date, _to date)
RETURNS TABLE (user_id uuid, full_name text, role app_role,
  leads_created bigint, leads_assigned bigint,
  projects_completed bigint, present_days bigint, absent_days bigint, attendance_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.full_name,
         (SELECT role FROM public.user_roles WHERE user_id = s.user_id LIMIT 1),
         (SELECT COUNT(*) FROM public.leads l WHERE l.created_by_user_id = s.user_id AND l.created_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.leads l WHERE (l.assigned_to_user_id = s.user_id OR l.assigned_telecaller_id = s.user_id) AND l.created_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.projects p WHERE p.assigned_sales_person_id = s.user_id AND p.status = 'project_completed'::project_status AND p.updated_at::date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status IN ('present','late') AND a.date BETWEEN _from AND _to),
         (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status = 'absent' AND a.date BETWEEN _from AND _to),
         CASE WHEN (_to - _from + 1) > 0
              THEN ROUND(100.0 * (SELECT COUNT(*) FROM public.attendance a WHERE a.staff_user_id = s.user_id AND a.status IN ('present','late','half_day') AND a.date BETWEEN _from AND _to) / (_to - _from + 1), 1)
              ELSE 0 END
  FROM public.staff s
  WHERE s.is_active = true
    AND has_role(auth.uid(), 'admin'::app_role)
  ORDER BY s.full_name;
$$;

-- Lead documents follow the same ownership.
DROP POLICY IF EXISTS "Staff manage lead documents" ON public.documents;
CREATE POLICY "Staff manage lead documents"
  ON public.documents FOR ALL TO authenticated
  USING (
    lead_id IS NOT NULL
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'operator'::app_role)
      OR has_role(auth.uid(), 'telecaller'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.leads l
         WHERE l.id = documents.lead_id
           AND (l.created_by_user_id = auth.uid() OR l.assigned_to_user_id = auth.uid() OR l.assigned_telecaller_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    lead_id IS NOT NULL
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'operator'::app_role)
      OR has_role(auth.uid(), 'telecaller'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.leads l
         WHERE l.id = documents.lead_id
           AND (l.created_by_user_id = auth.uid() OR l.assigned_to_user_id = auth.uid() OR l.assigned_telecaller_id = auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- The lead's people panel, and the assignment trail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_lead_people(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  ld public.leads%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO ld FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR ld.created_by_user_id = auth.uid()
    OR ld.assigned_to_user_id = auth.uid()
    OR ld.assigned_telecaller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id = _lead_id AND (
        p.assigned_sales_person_id = auth.uid()
        OR p.assigned_welder_id = auth.uid()
        OR p.assigned_electrician_id = auth.uid()
        OR p.assigned_operator_id = auth.uid()
        OR p.assigned_telecaller_id = auth.uid()
    ))
    OR has_role(auth.uid(), 'telecaller'::app_role)
    OR has_role(auth.uid(), 'operator'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'creator', (SELECT to_jsonb(s) FROM (SELECT user_id, full_name, mobile, email FROM public.staff WHERE user_id = ld.created_by_user_id) s),
    -- `assignee` keeps its name so existing callers still read the sales rep.
    'assignee', (SELECT to_jsonb(s) FROM (SELECT user_id, full_name, mobile, email FROM public.staff WHERE user_id = ld.assigned_to_user_id) s),
    'telecaller', (SELECT to_jsonb(s) FROM (SELECT user_id, full_name, mobile, email FROM public.staff WHERE user_id = ld.assigned_telecaller_id) s),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', la.id,
        'from', (SELECT full_name FROM public.staff WHERE user_id = la.from_user_id),
        'to',   (SELECT full_name FROM public.staff WHERE user_id = la.to_user_id),
        'by',   (SELECT full_name FROM public.staff WHERE user_id = la.changed_by),
        'at',   la.created_at
      ) ORDER BY la.created_at DESC)
      FROM (SELECT * FROM public.lead_assignments WHERE lead_id = _lead_id ORDER BY created_at DESC LIMIT 20) la
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END $function$;

-- Both slots are worth a trail entry and a notification; before this, moving a
-- lead between telecallers was silent.
CREATE OR REPLACE FUNCTION public.log_lead_assignment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.assigned_to_user_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id) THEN
    INSERT INTO public.lead_assignments (lead_id, from_user_id, to_user_id, changed_by)
    VALUES (NEW.id,
            CASE WHEN TG_OP='UPDATE' THEN OLD.assigned_to_user_id ELSE NULL END,
            NEW.assigned_to_user_id,
            auth.uid());
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.assigned_telecaller_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.assigned_telecaller_id IS DISTINCT FROM OLD.assigned_telecaller_id) THEN
    INSERT INTO public.lead_assignments (lead_id, from_user_id, to_user_id, changed_by)
    VALUES (NEW.id,
            CASE WHEN TG_OP='UPDATE' THEN OLD.assigned_telecaller_id ELSE NULL END,
            NEW.assigned_telecaller_id,
            auth.uid());
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.notify_lead_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assigned_to_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id) THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (NEW.assigned_to_user_id, 'New Lead Assigned',
            'Lead "' || NEW.customer_name || '" has been assigned to you.',
            'lead_assigned', 'lead', NEW.id::text);
  END IF;

  IF NEW.assigned_telecaller_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.assigned_telecaller_id IS DISTINCT FROM NEW.assigned_telecaller_id) THEN
    INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
    VALUES (NEW.assigned_telecaller_id, 'New Lead Assigned',
            'Lead "' || NEW.customer_name || '" has been assigned to you.',
            'lead_assigned', 'lead', NEW.id::text);
  END IF;

  RETURN NEW;
END $function$;
