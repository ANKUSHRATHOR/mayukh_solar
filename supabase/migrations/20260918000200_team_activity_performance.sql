-- Per-employee sales activity, for the admin dashboard's Team tab.
--
-- `staff_performance` (20260518173037) answers a different question: leads and
-- attendance for everyone, which is an HR view. This one is about the work a
-- telecaller or sales rep actually does in a day — calls placed and connected,
-- leads worked, visits booked and surveyed, and what came out of it — so the
-- admin can compare people over a period instead of opening each staff page.
--
-- Admin-only, and SECURITY DEFINER because it reads across every staff member's
-- rows, which RLS would otherwise narrow to the caller's own.

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
    -- Whole days in India, so "today" means the working day rather than a UTC
    -- window that starts at 5:30am local.
    SELECT _from::timestamp AT TIME ZONE 'Asia/Kolkata'                AS from_ts,
           (_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'            AS to_ts
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
    (SELECT count(*) FROM public.leads l, bounds b
      WHERE l.assigned_to_user_id = s.user_id AND l.is_in_bin = false
        AND l.created_at >= b.from_ts AND l.created_at < b.to_ts),
    -- Booked by this person…
    (SELECT count(*) FROM public.site_visits v, bounds b
      WHERE v.staff_id = s.user_id AND v.visit_status <> 'note'
        AND v.created_at >= b.from_ts AND v.created_at < b.to_ts),
    -- …and surveyed by them, which is the sales rep's side of the same work.
    (SELECT count(*) FROM public.site_visits v, bounds b
      WHERE COALESCE(v.assigned_to_user_id, v.staff_id) = s.user_id
        AND v.visit_status = 'completed'
        AND v.completed_at >= b.from_ts AND v.completed_at < b.to_ts),
    -- Outcomes are read off the calls, so they credit whoever made the call.
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.status_updated_to = 'interested'::lead_status
        AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.status_updated_to = 'follow_up'::lead_status
        AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    (SELECT count(*) FROM public.call_logs c, bounds b
      WHERE c.staff_id = s.user_id AND c.status_updated_to = 'not_interested'::lead_status
        AND c.created_at >= b.from_ts AND c.created_at < b.to_ts),
    -- The end of the funnel: projects opened in the period from a lead this
    -- person holds or created.
    (SELECT count(*) FROM public.projects p
       JOIN public.leads l ON l.id = p.lead_id, bounds b
      WHERE (l.assigned_to_user_id = s.user_id OR l.created_by_user_id = s.user_id)
        AND p.created_at >= b.from_ts AND p.created_at < b.to_ts),
    -- Not period-bound: what this person owes right now, however it was set.
    (SELECT count(*) FROM public.leads l
      WHERE (l.assigned_to_user_id = s.user_id OR l.created_by_user_id = s.user_id)
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
    AND has_role(auth.uid(), 'admin'::app_role)   -- admin-only, enforced in the body
  ORDER BY s.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.team_activity_performance(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.team_activity_performance(date, date) TO authenticated;
