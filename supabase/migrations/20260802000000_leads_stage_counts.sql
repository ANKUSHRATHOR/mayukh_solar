-- One query for the stage bar instead of eight.
--
-- The leads screen asked for a separate `count: 'exact'` per stage — eight
-- head-only requests, each re-scanning the whole filtered `leads_list`. With
-- the page query that is nine scans per render.
--
-- That view is expensive to *plan*, never mind execute: three lateral joins,
-- each carrying the RLS of the table it touches, produce a plan with hundreds
-- of InitPlans and ~80 ms of planning time on its own. Nine of those per render,
-- across a few open tabs, pushed queries past the 8s statement_timeout on the
-- `authenticated` role. Postgres then cancelled whichever statement was
-- unlucky, which is why failures showed up randomly on unrelated endpoints
-- (user_roles, staff, notifications) as 500s and "current transaction is
-- aborted" cascades — the leads page was starving the rest of the app.
--
-- Conditional aggregation gets every stage from a single scan. The stages are
-- not mutually exclusive (a lead can be 'interested' and have a quotation), so
-- this is FILTER rather than GROUP BY status.
--
-- SECURITY INVOKER (the default — deliberately not DEFINER) so `leads_list`
-- RLS still applies and a telecaller counts only their own rows.

CREATE OR REPLACE FUNCTION public.leads_stage_counts(
  _search        text          DEFAULT NULL,
  _creator       uuid          DEFAULT NULL,
  _assigned      uuid          DEFAULT NULL,
  _unassigned    boolean       DEFAULT false,
  _operator      uuid          DEFAULT NULL,
  _project_type  payment_type  DEFAULT NULL,
  _from          timestamptz   DEFAULT NULL,
  _to            timestamptz   DEFAULT NULL,
  _scope         text          DEFAULT 'all',
  _scope_user    uuid          DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'new',            count(*) FILTER (WHERE status = 'new'),
    'site_visit',     count(*) FILTER (WHERE status = 'visited'),
    'follow_up',      count(*) FILTER (WHERE status = 'follow_up'),
    'interested',     count(*) FILTER (WHERE status = 'interested'),
    'quotation_sent', count(*) FILTER (WHERE has_quotation),
    'final',          count(*) FILTER (WHERE status = 'final'),
    'not_interested', count(*) FILTER (WHERE status = 'not_interested'),
    'cancelled',      count(*) FILTER (WHERE status = 'cancelled')
  )
  FROM public.leads_list
  WHERE is_in_bin = false
    -- Mirrors buildLeadsQuery in AdminLeadsList.tsx. Every filter there except
    -- the stage itself must be reflected here, or a count will disagree with
    -- the list it filters to.
    AND (
      _search IS NULL OR _search = '' OR
      customer_name ILIKE '%' || _search || '%' OR
      mobile        ILIKE '%' || _search || '%' OR
      k_number      ILIKE '%' || _search || '%'
    )
    AND (_creator      IS NULL OR created_by_user_id  = _creator)
    AND (NOT _unassigned OR assigned_to_user_id IS NULL)
    AND (_assigned     IS NULL OR assigned_to_user_id = _assigned)
    AND (_operator     IS NULL OR assigned_operator_id = _operator)
    AND (_project_type IS NULL OR project_type        = _project_type)
    AND (_from IS NULL OR last_activity_at >= _from)
    AND (_to   IS NULL OR last_activity_at <= _to)
    AND (
      _scope <> 'my_visits' OR
      assigned_to_user_id = _scope_user OR
      created_by_user_id  = _scope_user
    )
    AND (
      _scope <> 'unassigned_visits' OR
      (assigned_to_user_id IS NULL AND follow_up_date IS NOT NULL)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.leads_stage_counts(
  text, uuid, uuid, boolean, uuid, payment_type, timestamptz, timestamptz, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_stage_counts(
  text, uuid, uuid, boolean, uuid, payment_type, timestamptz, timestamptz, text, uuid
) TO authenticated;
