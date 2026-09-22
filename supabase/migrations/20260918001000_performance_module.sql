-- The Performance module.
--
-- What was here: `staff_performance` (20260518173037) — leads created, leads
-- assigned, projects completed and attendance, per active staff member, for a
-- date range. An HR summary. It cannot answer any of the questions the people
-- who open /admin/performance actually ask: what was assigned, what is still
-- pending, what is late, who is behind, and which records are behind a number.
--
-- It is left exactly as it is. This migration adds the layer beside it:
--
--   performance_work_items_v  one normalised row per unit of assigned work
--   performance_overview()    per-employee aggregates over that set
--   performance_work_items()  the same set, paged — the drill-down
--   performance_trend()       the same set, bucketed by day or month
--   performance_targets       the only genuinely new data: what someone is
--                             expected to achieve in a month
--
-- The single most important property here is that the tiles and the table are
-- the same query. Every count in `performance_overview` is a FILTER over
-- `performance_work_items_v`, and `performance_work_items` applies the identical
-- predicate to return the rows — so clicking "12 overdue" cannot show 11 rows.
-- That is the reason work is normalised into one view rather than each metric
-- being counted against its own table with its own idea of "assigned".
--
-- Timezone: whole days in Asia/Kolkata, matching call_logs and
-- team_activity_performance. A UTC day would put 5:30am of the working day into
-- the previous one.

-- ---------------------------------------------------------------------------
-- Targets
-- ---------------------------------------------------------------------------
-- Nothing in this database has ever recorded what a person was *supposed* to
-- do, so target-vs-achievement has no source. One row per person per month per
-- metric, because a target that is edited in place silently rewrites history:
-- last month's achievement percentage must not move when this month's number
-- is raised.

CREATE TABLE IF NOT EXISTS public.performance_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  -- Always the first of the month, in India. Enforced by the constraint below
  -- rather than by trusting the caller.
  period_month  date NOT NULL,
  metric        text NOT NULL CHECK (metric IN ('revenue', 'connected_calls', 'projects_completed')),
  target_value  numeric NOT NULL CHECK (target_value >= 0),
  set_by        uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_targets_month_start CHECK (period_month = date_trunc('month', period_month)::date),
  CONSTRAINT performance_targets_unique UNIQUE (staff_user_id, period_month, metric)
);

COMMENT ON TABLE public.performance_targets IS
  'Monthly target per staff member per metric. A period shorter or longer than a month is pro-rated by days; see performance_overview.';

CREATE INDEX IF NOT EXISTS idx_performance_targets_staff
  ON public.performance_targets (staff_user_id, period_month);

ALTER TABLE public.performance_targets ENABLE ROW LEVEL SECURITY;

-- Admins set them; everyone may read their own, so a self-view can show the bar
-- without a privileged call.
DROP POLICY IF EXISTS "Admins manage targets" ON public.performance_targets;
CREATE POLICY "Admins manage targets"
  ON public.performance_targets FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Staff read own target" ON public.performance_targets;
CREATE POLICY "Staff read own target"
  ON public.performance_targets FOR SELECT TO authenticated
  USING (staff_user_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS update_performance_targets_updated_at ON public.performance_targets;
CREATE TRIGGER update_performance_targets_updated_at
  BEFORE UPDATE ON public.performance_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- The work item
-- ---------------------------------------------------------------------------
-- Four things in this database are "work assigned to a person": a task, a site
-- visit, a lead someone is working, and a project someone is running. They have
-- four different shapes and four different words for "done". This view gives
-- them one shape, so the module has exactly one definition of assigned,
-- completed, pending and overdue instead of one per tile.
--
--   status  not_started | in_progress | completed | cancelled
--
-- Overdue is deliberately NOT a status: it is due_date < today AND status not
-- in (completed, cancelled), computed by the reader against the current day.
-- Storing it would make it wrong by tomorrow, and a cancelled item would stay
-- "overdue" forever.
--
-- The view has no RLS of its own and is reachable only from the SECURITY
-- DEFINER functions below, which do the scoping.

DROP VIEW IF EXISTS public.performance_work_items_v;
CREATE VIEW public.performance_work_items_v AS
-- Tasks.
SELECT
  'task'::text                          AS kind,
  t.id                                  AS item_id,
  t.assigned_to_user_id                 AS owner_id,
  t.title                               AS title,
  t.priority::text                      AS priority,
  CASE t.status::text
    WHEN 'completed'   THEN 'completed'
    WHEN 'in_progress' THEN 'in_progress'
    ELSE 'not_started'
  END                                   AS status,
  t.created_at                          AS assigned_at,
  t.due_date                            AS due_date,
  t.completed_at                        AS completed_at,
  NULL::text                            AS outcome,
  t.lead_id                             AS lead_id,
  t.project_id                          AS project_id,
  COALESCE(NULLIF(btrim(dl.customer_name), ''), NULLIF(btrim(pl.customer_name), ''), '—') AS subject
FROM public.tasks t
LEFT JOIN public.leads    dl ON dl.id = t.lead_id
LEFT JOIN public.projects dp ON dp.id = t.project_id
LEFT JOIN public.leads    pl ON pl.id = dp.lead_id

UNION ALL

-- Site visits. Credited to whoever surveys it, falling back to whoever booked
-- it — the same rule team_activity_performance uses for visits_completed.
-- 'note' rows are legacy call logs and never count as visits (see lib/visits.ts).
SELECT
  'visit'::text,
  v.id,
  COALESCE(v.assigned_to_user_id, v.staff_id),
  'Site visit — ' || COALESCE(NULLIF(btrim(l.customer_name), ''), 'Lead'),
  NULL::text,
  CASE v.visit_status
    WHEN 'completed' THEN 'completed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'not_started'
  END,
  v.created_at,
  (COALESCE(v.scheduled_for, v.visit_date) AT TIME ZONE 'Asia/Kolkata')::date,
  v.completed_at,
  v.outcome,
  v.lead_id,
  NULL::uuid,
  COALESCE(NULLIF(btrim(l.customer_name), ''), 'Lead')
FROM public.site_visits v
JOIN public.leads l ON l.id = v.lead_id
WHERE v.visit_status <> 'note'

UNION ALL

-- Leads. A lead is work for its telecaller and, independently, for its sales
-- rep (20260918000300), so it emits a row per slot — deduplicated, because one
-- person holding both slots is one piece of work, not two. Due date is the
-- follow-up the owner promised.
SELECT
  'lead'::text,
  l.id,
  o.owner_id,
  'Lead — ' || COALESCE(NULLIF(btrim(l.customer_name), ''), 'Unnamed'),
  NULL::text,
  CASE
    WHEN l.status IN ('final') THEN 'completed'
    WHEN l.status IN ('cancelled', 'not_interested') THEN 'cancelled'
    WHEN l.status IN ('new', 'not_connected') THEN 'not_started'
    ELSE 'in_progress'
  END,
  l.created_at,
  (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date,
  CASE WHEN l.status = 'final' THEN l.updated_at END,
  l.status::text,
  l.id,
  NULL::uuid,
  COALESCE(NULLIF(btrim(l.customer_name), ''), 'Unnamed')
FROM public.leads l
CROSS JOIN LATERAL (
  SELECT DISTINCT x AS owner_id
    FROM unnest(ARRAY[l.assigned_telecaller_id, l.assigned_to_user_id]) AS x
   WHERE x IS NOT NULL
) o
WHERE l.is_in_bin = false

UNION ALL

-- Projects, for the operator running them and the sales rep who owns the file.
SELECT
  'project'::text,
  p.id,
  o.owner_id,
  'Project — ' || COALESCE(NULLIF(btrim(p.k_number), ''), NULLIF(btrim(pl.customer_name), ''), p.project_code),
  NULL::text,
  CASE
    WHEN p.status::text IN ('project_completed', 'closed') THEN 'completed'
    WHEN p.status::text IN ('new_project', 'documents_pending', 'pending_documents') THEN 'not_started'
    ELSE 'in_progress'
  END,
  p.created_at,
  p.expected_install_date::date,
  p.completed_at,
  p.status::text,
  p.lead_id,
  p.id,
  COALESCE(NULLIF(btrim(p.k_number), ''), NULLIF(btrim(pl.customer_name), ''), p.project_code)
FROM public.projects p
LEFT JOIN public.leads pl ON pl.id = p.lead_id
CROSS JOIN LATERAL (
  SELECT DISTINCT x AS owner_id
    FROM unnest(ARRAY[p.assigned_operator_id, p.assigned_sales_person_id]) AS x
   WHERE x IS NOT NULL
) o;

COMMENT ON VIEW public.performance_work_items_v IS
  'Every unit of assigned work — task, site visit, lead, project — in one shape. Read only through the performance_* functions, which scope it.';

REVOKE ALL ON public.performance_work_items_v FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may see whom
-- ---------------------------------------------------------------------------
-- An admin sees everyone. Anyone else sees themselves and nobody else — the
-- functions below coerce the staff filter rather than refusing, so an employee
-- opening the module gets their own figures instead of an error.

CREATE OR REPLACE FUNCTION public.performance_scope(_staff uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
           WHEN has_role(auth.uid(), 'admin'::app_role) THEN _staff
           ELSE auth.uid()
         END;
$$;

-- ---------------------------------------------------------------------------
-- The overview
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.performance_overview(
  _from  date,
  _to    date,
  _role  text DEFAULT NULL,
  _staff uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id                 uuid,
  full_name               text,
  role                    app_role,
  -- Common work, all counted over the items assigned inside the period, so the
  -- rates below compare a cohort with itself rather than this month's finishes
  -- against this month's starts.
  work_assigned           bigint,
  work_completed          bigint,
  work_pending            bigint,
  work_overdue            bigint,
  work_cancelled          bigint,
  work_on_time            bigint,
  work_on_time_eligible   bigint,
  -- Throughput: finished during the period whenever it was handed out.
  work_completed_in_period bigint,
  tasks_assigned          bigint,
  tasks_completed         bigint,
  tasks_pending           bigint,
  tasks_overdue           bigint,
  tasks_on_time           bigint,
  tasks_on_time_eligible  bigint,
  -- Telecaller
  calls_assigned          bigint,
  calls_dialed            bigint,
  calls_connected         bigint,
  calls_not_connected     bigint,
  calls_unlogged          bigint,
  calls_not_attempted     bigint,
  follow_ups_scheduled    bigint,
  follow_ups_due          bigint,
  follow_ups_completed    bigint,
  follow_ups_overdue      bigint,
  leads_interested        bigint,
  leads_not_interested    bigint,
  visits_booked           bigint,
  -- Sales
  leads_assigned          bigint,
  leads_contacted         bigint,
  leads_qualified         bigint,
  visits_completed        bigint,
  quotations_sent         bigint,
  deals_won               bigint,
  deals_lost              bigint,
  revenue                 numeric,
  pipeline_value          numeric,
  -- Operations
  projects_assigned       bigint,
  surveys_assigned        bigint,
  surveys_completed       bigint,
  documents_pending       bigint,
  applications_submitted  bigint,
  approvals_completed     bigint,
  installations_scheduled bigint,
  installations_completed bigint,
  projects_completed      bigint,
  projects_delayed        bigint,
  -- Target
  target_metric           text,
  target_value            numeric,
  achievement             numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
-- Every name in RETURNS TABLE is also a plpgsql variable, and this function is
-- almost entirely query. Where a bare identifier could be either, it is the
-- column — the alternative is an "ambiguous reference" error at runtime on a
-- name like `revenue` or `role`.
#variable_conflict use_column
DECLARE
  scoped    uuid := public.performance_scope(_staff);
  is_admin  boolean := has_role(auth.uid(), 'admin'::app_role);
  from_ts   timestamptz := _from::timestamp AT TIME ZONE 'Asia/Kolkata';
  to_ts     timestamptz := (_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata';
  today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF _from > _to THEN
    RAISE EXCEPTION 'The start of the period is after its end.';
  END IF;

  RETURN QUERY
  WITH people AS (
    SELECT s.user_id, s.full_name, r.role
      FROM public.staff s
      JOIN LATERAL (
        SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = s.user_id LIMIT 1
      ) r ON true
     WHERE s.is_active = true
       AND (_role  IS NULL OR r.role::text = _role)
       AND (scoped IS NULL OR s.user_id = scoped)
       -- A non-admin is pinned to their own row by performance_scope; this is
       -- the belt to that braces, so an unscoped call cannot leak the team.
       AND (is_admin OR s.user_id = auth.uid())
  ),
  items AS (
    SELECT
      w.owner_id,
      w.kind,
      w.status,
      (w.assigned_at >= from_ts AND w.assigned_at < to_ts)                          AS in_period,
      (w.completed_at IS NOT NULL AND w.completed_at >= from_ts
        AND w.completed_at < to_ts)                                                 AS done_in_period,
      (w.due_date IS NOT NULL AND w.due_date < today_ist
        AND w.status NOT IN ('completed', 'cancelled'))                             AS is_overdue,
      (w.due_date IS NOT NULL)                                                      AS has_due,
      (w.status = 'completed' AND w.due_date IS NOT NULL AND w.completed_at IS NOT NULL
        AND (w.completed_at AT TIME ZONE 'Asia/Kolkata')::date <= w.due_date)       AS on_time
      FROM public.performance_work_items_v w
      JOIN people pe ON pe.user_id = w.owner_id
  ),
  agg AS (
    SELECT
      i.owner_id,
      count(*) FILTER (WHERE i.in_period)                                            AS work_assigned,
      count(*) FILTER (WHERE i.in_period AND i.status = 'completed')                 AS work_completed,
      count(*) FILTER (WHERE i.in_period AND i.status IN ('not_started', 'in_progress')
                               AND NOT i.is_overdue)                                 AS work_pending,
      count(*) FILTER (WHERE i.in_period AND i.is_overdue)                           AS work_overdue,
      count(*) FILTER (WHERE i.in_period AND i.status = 'cancelled')                 AS work_cancelled,
      count(*) FILTER (WHERE i.in_period AND i.on_time)                              AS work_on_time,
      count(*) FILTER (WHERE i.in_period AND i.status = 'completed' AND i.has_due)   AS work_on_time_eligible,
      count(*) FILTER (WHERE i.done_in_period)                                       AS work_completed_in_period,
      count(*) FILTER (WHERE i.kind = 'task' AND i.in_period)                        AS tasks_assigned,
      count(*) FILTER (WHERE i.kind = 'task' AND i.in_period AND i.status = 'completed') AS tasks_completed,
      count(*) FILTER (WHERE i.kind = 'task' AND i.in_period
                               AND i.status IN ('not_started', 'in_progress')
                               AND NOT i.is_overdue)                                 AS tasks_pending,
      count(*) FILTER (WHERE i.kind = 'task' AND i.in_period AND i.is_overdue)       AS tasks_overdue,
      count(*) FILTER (WHERE i.kind = 'task' AND i.in_period AND i.on_time)          AS tasks_on_time,
      count(*) FILTER (WHERE i.kind = 'task' AND i.in_period AND i.status = 'completed'
                               AND i.has_due)                                        AS tasks_on_time_eligible
      FROM items i
     GROUP BY i.owner_id
  ),
  -- Monthly targets, pro-rated by the share of each month the period covers, so
  -- "Today" is compared against a day's worth of the month's number rather than
  -- the whole month's.
  targets AS (
    SELECT t.staff_user_id,
           t.metric,
           sum(
             t.target_value
             * (LEAST(_to, (t.period_month + interval '1 month - 1 day')::date)
                - GREATEST(_from, t.period_month) + 1)::numeric
             / EXTRACT(day FROM (t.period_month + interval '1 month - 1 day'))::numeric
           ) AS target_value
      FROM public.performance_targets t
     WHERE t.period_month <= _to
       AND (t.period_month + interval '1 month - 1 day')::date >= _from
     GROUP BY t.staff_user_id, t.metric
  )
  SELECT
    pe.user_id,
    pe.full_name,
    pe.role,
    COALESCE(a.work_assigned, 0),
    COALESCE(a.work_completed, 0),
    COALESCE(a.work_pending, 0),
    COALESCE(a.work_overdue, 0),
    COALESCE(a.work_cancelled, 0),
    COALESCE(a.work_on_time, 0),
    COALESCE(a.work_on_time_eligible, 0),
    COALESCE(a.work_completed_in_period, 0),
    COALESCE(a.tasks_assigned, 0),
    COALESCE(a.tasks_completed, 0),
    COALESCE(a.tasks_pending, 0),
    COALESCE(a.tasks_overdue, 0),
    COALESCE(a.tasks_on_time, 0),
    COALESCE(a.tasks_on_time_eligible, 0),

    -- ----- Telecaller -----------------------------------------------------
    -- Assigned to call: leads handed to them as telecaller during the period.
    (SELECT count(*) FROM public.leads l
      WHERE l.assigned_telecaller_id = pe.user_id AND l.is_in_bin = false
        AND l.created_at >= from_ts AND l.created_at < to_ts),
    (SELECT count(*) FROM public.call_logs c
      WHERE c.staff_id = pe.user_id AND c.created_at >= from_ts AND c.created_at < to_ts),
    -- Connected is the outcome the caller recorded. Busy, switched off, no
    -- answer and wrong numbers are `not_connected` and never counted here.
    (SELECT count(*) FROM public.call_logs c
      WHERE c.staff_id = pe.user_id AND c.outcome = 'connected'
        AND c.created_at >= from_ts AND c.created_at < to_ts),
    (SELECT count(*) FROM public.call_logs c
      WHERE c.staff_id = pe.user_id AND c.outcome = 'not_connected'
        AND c.created_at >= from_ts AND c.created_at < to_ts),
    -- Dialled and never written up, so dialled = connected + not connected +
    -- this, on screen.
    (SELECT count(*) FROM public.call_logs c
      WHERE c.staff_id = pe.user_id AND c.outcome = 'dialed'
        AND c.created_at >= from_ts AND c.created_at < to_ts),
    -- Never attempted: assigned in the period and nobody has dialled it since.
    (SELECT count(*) FROM public.leads l
      WHERE l.assigned_telecaller_id = pe.user_id AND l.is_in_bin = false
        AND l.created_at >= from_ts AND l.created_at < to_ts
        AND NOT EXISTS (SELECT 1 FROM public.call_logs c WHERE c.lead_id = l.id)),
    (SELECT count(*) FROM public.call_logs c
      WHERE c.staff_id = pe.user_id AND c.follow_up_date IS NOT NULL
        AND c.created_at >= from_ts AND c.created_at < to_ts),
    -- Due in the period, counted on the lead so a follow-up set any way at all
    -- is included.
    (SELECT count(*) FROM public.leads l
      WHERE (l.assigned_telecaller_id = pe.user_id OR l.assigned_to_user_id = pe.user_id)
        AND l.is_in_bin = false AND l.follow_up_date IS NOT NULL
        AND (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to),
    (SELECT count(*) FROM public.leads l
      WHERE (l.assigned_telecaller_id = pe.user_id OR l.assigned_to_user_id = pe.user_id)
        AND l.is_in_bin = false AND l.follow_up_date IS NOT NULL
        AND (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
        AND EXISTS (
          SELECT 1 FROM public.call_logs c
           WHERE c.lead_id = l.id AND c.staff_id = pe.user_id
             AND c.outcome <> 'dialed'
             AND c.created_at >= l.follow_up_date)),
    -- Current, not period-bound: what this person owes right now.
    (SELECT count(*) FROM public.leads l
      WHERE (l.assigned_telecaller_id = pe.user_id OR l.assigned_to_user_id = pe.user_id)
        AND l.is_in_bin = false AND l.follow_up_date IS NOT NULL
        AND (l.follow_up_date AT TIME ZONE 'Asia/Kolkata')::date < today_ist
        AND l.status NOT IN ('final'::lead_status, 'cancelled'::lead_status, 'not_interested'::lead_status)),
    (SELECT count(*) FROM public.call_logs c
      WHERE c.staff_id = pe.user_id AND c.status_updated_to = 'interested'::lead_status
        AND c.created_at >= from_ts AND c.created_at < to_ts),
    (SELECT count(*) FROM public.call_logs c
      WHERE c.staff_id = pe.user_id AND c.status_updated_to = 'not_interested'::lead_status
        AND c.created_at >= from_ts AND c.created_at < to_ts),
    (SELECT count(*) FROM public.site_visits v
      WHERE v.staff_id = pe.user_id AND v.visit_status <> 'note'
        AND v.created_at >= from_ts AND v.created_at < to_ts),

    -- ----- Sales ----------------------------------------------------------
    (SELECT count(*) FROM public.leads l
      WHERE l.assigned_to_user_id = pe.user_id AND l.is_in_bin = false
        AND l.created_at >= from_ts AND l.created_at < to_ts),
    -- Contacted: a call or a visit happened on it inside the period.
    (SELECT count(*) FROM public.leads l
      WHERE l.assigned_to_user_id = pe.user_id AND l.is_in_bin = false
        AND l.created_at >= from_ts AND l.created_at < to_ts
        AND (EXISTS (SELECT 1 FROM public.call_logs c
                      WHERE c.lead_id = l.id AND c.outcome <> 'dialed'
                        AND c.created_at >= from_ts AND c.created_at < to_ts)
          OR EXISTS (SELECT 1 FROM public.site_visits v
                      WHERE v.lead_id = l.id AND v.visit_status = 'completed'
                        AND v.completed_at >= from_ts AND v.completed_at < to_ts))),
    -- Qualified: got past "we rang them" to a stated interest or beyond.
    (SELECT count(*) FROM public.leads l
      WHERE l.assigned_to_user_id = pe.user_id AND l.is_in_bin = false
        AND l.created_at >= from_ts AND l.created_at < to_ts
        AND l.status IN ('interested'::lead_status, 'visited'::lead_status,
                         'quotation_sent'::lead_status, 'quotation_accepted'::lead_status,
                         'final'::lead_status)),
    (SELECT count(*) FROM public.site_visits v
      WHERE COALESCE(v.assigned_to_user_id, v.staff_id) = pe.user_id
        AND v.visit_status = 'completed'
        AND v.completed_at >= from_ts AND v.completed_at < to_ts),
    (SELECT count(*) FROM public.quotations q
      WHERE q.created_by_user_id = pe.user_id
        AND q.created_at >= from_ts AND q.created_at < to_ts),
    -- Won: the lead became a project. There is no separate deal record in this
    -- app — conversion *is* project creation (see CLAUDE.md, "A lead becomes a
    -- project directly") — so this reads projects, not a duplicate table.
    (SELECT count(*) FROM public.projects p
       JOIN public.leads l ON l.id = p.lead_id
      WHERE (l.assigned_to_user_id = pe.user_id OR p.assigned_sales_person_id = pe.user_id)
        AND p.created_at >= from_ts AND p.created_at < to_ts),
    (SELECT count(*) FROM public.leads l
      WHERE l.assigned_to_user_id = pe.user_id AND l.is_in_bin = false
        AND l.status IN ('not_interested'::lead_status, 'cancelled'::lead_status,
                         'quotation_rejected'::lead_status)
        AND l.updated_at >= from_ts AND l.updated_at < to_ts),
    -- Revenue is money actually received in the period on their projects, not
    -- the value of what was signed.
    (SELECT COALESCE(sum(pay.amount), 0) FROM public.project_payments pay
       JOIN public.projects p ON p.id = pay.project_id
      WHERE p.assigned_sales_person_id = pe.user_id AND pay.status = 'completed'
        AND pay.payment_date BETWEEN _from AND _to),
    -- Pipeline: signed but not finished, whenever it was signed.
    (SELECT COALESCE(sum(p.final_amount), 0) FROM public.projects p
      WHERE p.assigned_sales_person_id = pe.user_id
        AND p.status::text NOT IN ('project_completed', 'closed')),

    -- ----- Operations -----------------------------------------------------
    (SELECT count(*) FROM public.projects p
      WHERE p.assigned_operator_id = pe.user_id
        AND p.created_at >= from_ts AND p.created_at < to_ts),
    (SELECT count(*) FROM public.site_visits v
      WHERE COALESCE(v.assigned_to_user_id, v.staff_id) = pe.user_id
        AND v.visit_status <> 'note'
        AND v.created_at >= from_ts AND v.created_at < to_ts),
    (SELECT count(*) FROM public.site_visits v
      WHERE COALESCE(v.assigned_to_user_id, v.staff_id) = pe.user_id
        AND v.visit_status = 'completed'
        AND v.completed_at >= from_ts AND v.completed_at < to_ts),
    -- Current stage counts on their files — a worklist, so not period-bound.
    (SELECT count(*) FROM public.projects p
      WHERE p.assigned_operator_id = pe.user_id
        AND p.status::text IN ('documents_pending', 'pending_documents', 'pending_operator_review')),
    -- The existing pipeline's words for "applied" and "approved"; no new stages.
    (SELECT count(*) FROM public.audit_logs al
      WHERE al.user_id = pe.user_id AND al.entity_type = 'project'
        AND (al.new_value->>'status') IN ('net_meter_applied', 'net_metering_submitted')
        AND al.created_at >= from_ts AND al.created_at < to_ts),
    (SELECT count(*) FROM public.audit_logs al
      WHERE al.user_id = pe.user_id AND al.entity_type = 'project'
        AND (al.new_value->>'status') IN ('documents_approved', 'loan_approved')
        AND al.created_at >= from_ts AND al.created_at < to_ts),
    (SELECT count(*) FROM public.projects p
      WHERE p.assigned_operator_id = pe.user_id
        AND p.installation_scheduled_for IS NOT NULL
        AND p.installation_scheduled_for::date BETWEEN _from AND _to),
    (SELECT count(*) FROM public.audit_logs al
      WHERE al.user_id = pe.user_id AND al.entity_type = 'project'
        AND (al.new_value->>'status') IN ('installation_completed', 'installation_done')
        AND al.created_at >= from_ts AND al.created_at < to_ts),
    (SELECT count(*) FROM public.projects p
      WHERE (p.assigned_operator_id = pe.user_id OR p.assigned_sales_person_id = pe.user_id)
        AND p.completed_at >= from_ts AND p.completed_at < to_ts),
    -- Delayed: promised an install date that has passed, still not finished.
    (SELECT count(*) FROM public.projects p
      WHERE (p.assigned_operator_id = pe.user_id OR p.assigned_sales_person_id = pe.user_id)
        AND p.expected_install_date IS NOT NULL
        AND p.expected_install_date::date < today_ist
        AND p.status::text NOT IN ('project_completed', 'closed')),

    -- ----- Target ---------------------------------------------------------
    m.metric,
    tg.target_value,
    m.achievement
  FROM people pe
  LEFT JOIN agg a ON a.owner_id = pe.user_id
  CROSS JOIN LATERAL (
    -- One headline metric per role, so target and achievement are the same unit.
    SELECT CASE pe.role
             WHEN 'sales_person' THEN 'revenue'
             WHEN 'telecaller'   THEN 'connected_calls'
             ELSE 'projects_completed'
           END AS metric
  ) mk
  CROSS JOIN LATERAL (
    SELECT mk.metric,
           CASE mk.metric
             WHEN 'revenue' THEN
               (SELECT COALESCE(sum(pay.amount), 0) FROM public.project_payments pay
                  JOIN public.projects p ON p.id = pay.project_id
                 WHERE p.assigned_sales_person_id = pe.user_id AND pay.status = 'completed'
                   AND pay.payment_date BETWEEN _from AND _to)
             WHEN 'connected_calls' THEN
               (SELECT count(*)::numeric FROM public.call_logs c
                 WHERE c.staff_id = pe.user_id AND c.outcome = 'connected'
                   AND c.created_at >= from_ts AND c.created_at < to_ts)
             ELSE
               (SELECT count(*)::numeric FROM public.projects p
                 WHERE (p.assigned_operator_id = pe.user_id OR p.assigned_sales_person_id = pe.user_id)
                   AND p.completed_at >= from_ts AND p.completed_at < to_ts)
           END AS achievement
  ) m
  -- NULL target, not zero: "no target set" and "target of nothing" must not
  -- render as the same thing.
  LEFT JOIN targets tg ON tg.staff_user_id = pe.user_id AND tg.metric = m.metric
  ORDER BY pe.full_name;
END $$;

-- ---------------------------------------------------------------------------
-- The drill-down
-- ---------------------------------------------------------------------------
-- Same view, same predicates, one page at a time. `_bucket` names the slice a
-- tile represents; passing the tile's own bucket is what guarantees the count
-- and the rows agree.

CREATE OR REPLACE FUNCTION public.performance_work_items(
  _from     date,
  _to       date,
  _staff    uuid    DEFAULT NULL,
  _role     text    DEFAULT NULL,
  _bucket   text    DEFAULT 'assigned',
  _kind     text    DEFAULT NULL,
  _status   text    DEFAULT NULL,
  _priority text    DEFAULT NULL,
  _search   text    DEFAULT NULL,
  _sort     text    DEFAULT 'due_date',
  _dir      text    DEFAULT 'asc',
  _limit    int     DEFAULT 25,
  _offset   int     DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
-- Every name in RETURNS TABLE is also a plpgsql variable, and this function is
-- almost entirely query. Where a bare identifier could be either, it is the
-- column — the alternative is an "ambiguous reference" error at runtime on a
-- name like `revenue` or `role`.
#variable_conflict use_column
DECLARE
  scoped    uuid := public.performance_scope(_staff);
  is_admin  boolean := has_role(auth.uid(), 'admin'::app_role);
  from_ts   timestamptz := _from::timestamp AT TIME ZONE 'Asia/Kolkata';
  to_ts     timestamptz := (_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata';
  today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  total     bigint;
  rows_out  jsonb;
BEGIN
  -- Whitelists, because _sort and _dir reach an ORDER BY. Nothing here is
  -- interpolated into SQL text, but an unknown value should say so rather than
  -- quietly sorting by something else.
  IF _bucket NOT IN ('assigned', 'completed', 'pending', 'overdue', 'due_today',
                     'completed_in_period', 'cancelled', 'all') THEN
    RAISE EXCEPTION 'Unknown bucket %', _bucket;
  END IF;
  IF _dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Sort direction must be asc or desc.';
  END IF;
  IF _sort NOT IN ('due_date', 'assigned_at', 'completed_at', 'title', 'status',
                   'priority', 'owner_name') THEN
    RAISE EXCEPTION 'Cannot sort by %', _sort;
  END IF;

  WITH people AS (
    SELECT s.user_id, s.full_name, r.role
      FROM public.staff s
      JOIN LATERAL (
        SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = s.user_id LIMIT 1
      ) r ON true
     WHERE s.is_active = true
       AND (_role  IS NULL OR r.role::text = _role)
       AND (scoped IS NULL OR s.user_id = scoped)
       AND (is_admin OR s.user_id = auth.uid())
  ),
  base AS (
    SELECT
      w.kind, w.item_id, w.owner_id, pe.full_name AS owner_name, w.title, w.subject,
      w.priority, w.status, w.assigned_at, w.due_date, w.completed_at, w.outcome,
      w.lead_id, w.project_id,
      (w.due_date IS NOT NULL AND w.due_date < today_ist
        AND w.status NOT IN ('completed', 'cancelled'))                AS is_overdue,
      (w.assigned_at >= from_ts AND w.assigned_at < to_ts)             AS in_period,
      (w.completed_at IS NOT NULL AND w.completed_at >= from_ts
        AND w.completed_at < to_ts)                                    AS done_in_period
      FROM public.performance_work_items_v w
      JOIN people pe ON pe.user_id = w.owner_id
  ),
  -- The bucket predicates are character-for-character the FILTER clauses in
  -- performance_overview. They are the reason a tile and its drill-down agree.
  filtered AS (
    SELECT * FROM base b
     WHERE CASE _bucket
             WHEN 'assigned'            THEN b.in_period
             WHEN 'completed'           THEN b.in_period AND b.status = 'completed'
             WHEN 'pending'             THEN b.in_period AND b.status IN ('not_started', 'in_progress')
                                              AND NOT b.is_overdue
             WHEN 'overdue'             THEN b.in_period AND b.is_overdue
             WHEN 'cancelled'           THEN b.in_period AND b.status = 'cancelled'
             WHEN 'completed_in_period' THEN b.done_in_period
             -- Worklists, deliberately current rather than period-bound: what
             -- needs doing today does not depend on which month is on screen.
             WHEN 'due_today'           THEN b.due_date = today_ist
                                              AND b.status NOT IN ('completed', 'cancelled')
             ELSE true
           END
       AND (_kind     IS NULL OR b.kind = _kind)
       AND (_priority IS NULL OR b.priority = _priority)
       AND (_status   IS NULL OR
            CASE WHEN _status = 'overdue' THEN b.is_overdue ELSE b.status = _status END)
       AND (_search   IS NULL OR _search = '' OR
            b.title ILIKE '%' || _search || '%' OR b.subject ILIKE '%' || _search || '%')
  ),
  -- Overdue is a presentation of an open item, not a fifth stored status, so it
  -- is folded in here — one badge vocabulary for the table and the filter.
  page AS (
    SELECT row_number() OVER (
             ORDER BY
               CASE WHEN _dir = 'asc' THEN
                 CASE _sort
                   WHEN 'due_date'     THEN f.due_date::text
                   WHEN 'assigned_at'  THEN to_char(f.assigned_at, 'YYYY-MM-DD HH24:MI:SS')
                   WHEN 'completed_at' THEN to_char(f.completed_at, 'YYYY-MM-DD HH24:MI:SS')
                   WHEN 'owner_name'   THEN f.owner_name
                   WHEN 'status'       THEN f.status
                   WHEN 'priority'     THEN f.priority
                   ELSE f.title
                 END
               END ASC NULLS LAST,
               CASE WHEN _dir = 'desc' THEN
                 CASE _sort
                   WHEN 'due_date'     THEN f.due_date::text
                   WHEN 'assigned_at'  THEN to_char(f.assigned_at, 'YYYY-MM-DD HH24:MI:SS')
                   WHEN 'completed_at' THEN to_char(f.completed_at, 'YYYY-MM-DD HH24:MI:SS')
                   WHEN 'owner_name'   THEN f.owner_name
                   WHEN 'status'       THEN f.status
                   WHEN 'priority'     THEN f.priority
                   ELSE f.title
                 END
               END DESC NULLS LAST,
               f.item_id
           ) AS seq,
           f.kind, f.item_id, f.owner_id, f.owner_name, f.title, f.subject, f.priority,
           CASE WHEN f.is_overdue THEN 'overdue' ELSE f.status END AS status,
           f.assigned_at, f.due_date, f.completed_at, f.outcome, f.lead_id, f.project_id
      FROM filtered f
  )
  SELECT
    (SELECT count(*) FROM filtered),
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) - 'seq' ORDER BY p.seq)
         FROM page p
        WHERE p.seq > GREATEST(_offset, 0)
          AND p.seq <= GREATEST(_offset, 0) + GREATEST(_limit, 0)),
      '[]'::jsonb)
    INTO total, rows_out;

  RETURN jsonb_build_object('total', COALESCE(total, 0), 'rows', COALESCE(rows_out, '[]'::jsonb));
END $$;

-- ---------------------------------------------------------------------------
-- The trend
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.performance_trend(
  _from  date,
  _to    date,
  _grain text DEFAULT 'day',
  _staff uuid DEFAULT NULL,
  _role  text DEFAULT NULL
)
RETURNS TABLE (
  bucket    date,
  assigned  bigint,
  completed bigint,
  revenue   numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  scoped   uuid := public.performance_scope(_staff);
  is_admin boolean := has_role(auth.uid(), 'admin'::app_role);
  step     interval := CASE WHEN _grain = 'month' THEN interval '1 month' ELSE interval '1 day' END;
BEGIN
  IF _grain NOT IN ('day', 'month') THEN
    RAISE EXCEPTION 'Grain is day or month.';
  END IF;

  RETURN QUERY
  WITH people AS (
    SELECT s.user_id
      FROM public.staff s
      JOIN LATERAL (
        SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = s.user_id LIMIT 1
      ) r ON true
     WHERE s.is_active = true
       AND (_role  IS NULL OR r.role::text = _role)
       AND (scoped IS NULL OR s.user_id = scoped)
       AND (is_admin OR s.user_id = auth.uid())
  ),
  -- Every bucket in the range, so a quiet day is a zero on the line rather than
  -- a gap the chart closes up.
  buckets AS (
    SELECT generate_series(
             CASE WHEN _grain = 'month'
                  THEN date_trunc('month', _from::timestamp)
                  ELSE _from::timestamp END,
             _to::timestamp, step)::date AS bucket
  ),
  bounded AS (
    SELECT b.bucket,
           b.bucket::timestamp AT TIME ZONE 'Asia/Kolkata'                  AS from_ts,
           ((b.bucket + step)::date)::timestamp AT TIME ZONE 'Asia/Kolkata' AS to_ts,
           b.bucket                                                         AS from_d,
           (b.bucket + step)::date - 1                                      AS to_d
      FROM buckets b
  )
  SELECT
    bd.bucket,
    (SELECT count(*) FROM public.performance_work_items_v w JOIN people pe ON pe.user_id = w.owner_id
      WHERE w.assigned_at >= bd.from_ts AND w.assigned_at < bd.to_ts),
    (SELECT count(*) FROM public.performance_work_items_v w JOIN people pe ON pe.user_id = w.owner_id
      WHERE w.completed_at >= bd.from_ts AND w.completed_at < bd.to_ts),
    (SELECT COALESCE(sum(pay.amount), 0) FROM public.project_payments pay
       JOIN public.projects p ON p.id = pay.project_id
       JOIN people pe ON pe.user_id = p.assigned_sales_person_id
      WHERE pay.status = 'completed' AND pay.payment_date BETWEEN bd.from_d AND bd.to_d)
  FROM bounded bd
  ORDER BY bd.bucket;
END $$;

REVOKE EXECUTE ON FUNCTION public.performance_scope(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.performance_overview(date, date, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.performance_work_items(date, date, uuid, text, text, text, text, text, text, text, text, int, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.performance_trend(date, date, text, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.performance_scope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_overview(date, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_work_items(date, date, uuid, text, text, text, text, text, text, text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_trend(date, date, text, uuid, text) TO authenticated;
